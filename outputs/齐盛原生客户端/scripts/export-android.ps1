param([string]$GodotBin = '', [string]$ToolchainFile = '', [string]$OutputFile = '', [string]$PythonBin = '', [switch]$Check)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $GodotBin) { $GodotBin = [IO.Path]::GetFullPath((Join-Path $project '../../work/Godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe')) }
if (-not $ToolchainFile) { $ToolchainFile = Join-Path $project 'work/android-toolchain.json' }
if (-not (Test-Path -LiteralPath $ToolchainFile)) { throw 'Prepare the verified JDK 17 and Android SDK toolchain first; see docs/android-build.md' }
$toolchain = Get-Content -LiteralPath $ToolchainFile -Raw -Encoding UTF8 | ConvertFrom-Json
$java = [IO.Path]::GetFullPath($toolchain.javaSdk)
$sdk = [IO.Path]::GetFullPath($toolchain.androidSdk)
$python = if ($PythonBin) { [IO.Path]::GetFullPath($PythonBin) } elseif ($toolchain.python) { [IO.Path]::GetFullPath($toolchain.python) } else { (Get-Command python -ErrorAction Stop).Source }
foreach ($tool in @((Join-Path $java 'bin/java.exe'),(Join-Path $java 'bin/keytool.exe'),(Join-Path $java 'bin/jarsigner.exe'),(Join-Path $sdk 'build-tools/35.0.1/apksigner.bat'),(Join-Path $sdk 'platform-tools/adb.exe'),$GodotBin,$python)) {
    if (-not (Test-Path -LiteralPath $tool)) { throw ('Required export tool missing: '+$tool) }
}
if (-not (Test-Path -LiteralPath (Join-Path $project 'work/templates/android_debug.apk'))) { throw 'Missing official Godot 4.7.2 Android debug template' }
$node = (Get-Command node -ErrorAction Stop).Source
$preflightText = & $node (Join-Path $project 'scripts/native-export-preflight.mjs') android
if ($LASTEXITCODE -ne 0) { throw 'Android native identity or physics verification failed' }
$preflight = $preflightText | ConvertFrom-Json
if ($Check) { @{checked=$true;exported=$false;published=$false;version='0.2.0';platform='android';stage='internal';sourceHash=$preflight.sourceHash} | ConvertTo-Json; return }
$distRoot = [IO.Path]::GetFullPath((Join-Path $project 'dist'))
$delivery = if ($OutputFile) { [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputFile)) { $OutputFile } else { Join-Path $project $OutputFile })) } else { Join-Path $distRoot 'qisheng-native-0.2.0-android-arm64-internal.apk' }
if (-not $delivery.StartsWith(($distRoot+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($delivery) -ne '.apk') { throw 'Android output must be a new APK inside native dist' }
if (Test-Path -LiteralPath $delivery) { throw 'Android output already exists; choose a new -OutputFile. Historical packages are never overwritten.' }
& $node (Join-Path $project 'scripts/prepare-runtime-licenses.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Native runtime license preparation failed' }

New-Item -ItemType Directory -Force (Join-Path $project 'private'),(Join-Path $project 'dist'),(Join-Path $project 'work/appdata/Godot') | Out-Null
foreach ($folder in @('private','work')) {
    $marker = Join-Path $project ($folder+'/.gdignore')
    if (-not (Test-Path -LiteralPath $marker)) { New-Item -ItemType File -Path $marker | Out-Null }
}
$keyConfig = Join-Path $project 'private/android-internal-signing.json'
if (-not (Test-Path -LiteralPath $keyConfig)) {
    $random = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($random) } finally { $generator.Dispose() }
    $password = [Convert]::ToBase64String($random).Replace('/','A').Replace('+','B').Replace('=','C')
    @{alias='openqs-internal';password=$password} | ConvertTo-Json | Set-Content -LiteralPath $keyConfig -Encoding utf8
}
$signing = Get-Content -LiteralPath $keyConfig -Raw -Encoding UTF8 | ConvertFrom-Json
$env:OPENQS_INTERNAL_KEYSTORE_PASSWORD = $signing.password
$keystore = Join-Path $project 'private/android-internal.keystore'
if (-not (Test-Path -LiteralPath $keystore)) {
    & (Join-Path $java 'bin/keytool.exe') -genkeypair -keystore $keystore -alias $signing.alias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=OpenQS Internal Preview, O=OpenQS, C=CN' -storepass:env OPENQS_INTERNAL_KEYSTORE_PASSWORD -keypass:env OPENQS_INTERNAL_KEYSTORE_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Internal signing key generation failed' }
}
$env:APPDATA = Join-Path $project 'work/appdata'
$env:LOCALAPPDATA = $env:APPDATA
$env:JAVA_HOME = $java
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GODOT_ANDROID_KEYSTORE_DEBUG_PATH = $keystore
$env:GODOT_ANDROID_KEYSTORE_DEBUG_USER = $signing.alias
$env:GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD = $signing.password
$escapedJava = $java.Replace('\','/')
$escapedSdk = $sdk.Replace('\','/')
@('[gd_resource type="EditorSettings" format=3]','','[resource]',('export/android/java_sdk_path = "'+$escapedJava+'"'),('export/android/android_sdk_path = "'+$escapedSdk+'"')) | Set-Content -LiteralPath (Join-Path $env:APPDATA 'Godot/editor_settings-4.7.tres') -Encoding utf8
# Google's Windows SDK utilities reject non-ASCII archive arguments. Keep their
# staging arguments ASCII; Godot's project and final delivery may remain Chinese.
$stage = [IO.Path]::GetFullPath((Join-Path $project ('../../work/native-android-0.2.0-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))))
New-Item -ItemType Directory -Force $stage | Out-Null
$apk = Join-Path $stage 'qisheng-native-0.2.0-android-arm64-internal.apk'
try {
    & $GodotBin --headless --path $project --export-debug 'Android Internal arm64' $apk
    if ($LASTEXITCODE -ne 0) { throw 'Godot Android internal export failed' }
    $unsigned = Join-Path $stage 'android-sdk-levels-unsigned.apk'
    $aligned = Join-Path $stage 'android-sdk-levels-aligned.apk'
    & $python (Join-Path $project 'scripts/set-android-sdk.py') $apk $unsigned --min-sdk 29 --target-sdk 35 --report (Join-Path $project 'work/android-manifest-report-0.2.0.json')
    if ($LASTEXITCODE -ne 0) { throw 'APK minimum SDK preparation failed' }
    & (Join-Path $sdk 'build-tools/35.0.1/zipalign.exe') -f -P 16 4 $unsigned $aligned
    if ($LASTEXITCODE -ne 0) { throw 'APK page alignment failed' }
    & (Join-Path $sdk 'build-tools/35.0.1/apksigner.bat') sign --ks $keystore --ks-key-alias $signing.alias --ks-pass env:OPENQS_INTERNAL_KEYSTORE_PASSWORD --key-pass env:OPENQS_INTERNAL_KEYSTORE_PASSWORD --out $apk $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Internal APK signing failed' }
    & (Join-Path $sdk 'build-tools/35.0.1/apksigner.bat') verify --verbose --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
    & (Join-Path $sdk 'build-tools/35.0.1/zipalign.exe') -c -P 16 4 $apk
    if ($LASTEXITCODE -ne 0) { throw 'Final APK alignment verification failed' }
    $metadata = & (Join-Path $sdk 'build-tools/35.0.1/aapt.exe') dump badging $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK metadata inspection failed' }
    $description = $metadata -join "`n"
    if ($description -notmatch "sdkVersion:'29'" -or $description -notmatch "targetSdkVersion:'35'" -or $description -notmatch "native-code: 'arm64-v8a'" -or $description -notmatch "package: name='org.openqs.qisheng.nativepreview'" -or $description -notmatch 'android.permission.INTERNET') { throw 'Unexpected APK platform, ABI, package or network permission' }
    if ($description -notmatch "versionName='0.2.0-internal'" -or $description -notmatch "versionCode='200'") { throw 'Unexpected Android Preview 0.2.0 version identity' }
    $auditFile = Join-Path $project ('work/android-package-audit-0.2.0-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.json')
    & $python (Join-Path $project 'scripts/audit-android-apk.py') $apk --report $auditFile --project $project
    if ($LASTEXITCODE -ne 0) { throw 'Android package boundary, raw map, native dependencies or licenses failed audit' }
    $audit = Get-Content -LiteralPath $auditFile -Raw | ConvertFrom-Json
    $afterText = & $node (Join-Path $project 'scripts/native-export-preflight.mjs') android
    if ($LASTEXITCODE -ne 0) { throw 'Android source identity verification failed after export' }
    $after = $afterText | ConvertFrom-Json
    if ($after.sourceHash -ne $preflight.sourceHash -or $after.physics.binary.sha256 -ne $preflight.physics.binary.sha256 -or $after.sdk.binary.sha256 -ne $preflight.sdk.binary.sha256) { throw 'Native source or physics changed during Android export; candidate not delivered' }
    Write-Output 'APK verified: internal signature, Android 10+, target API 35, arm64-v8a, both native extensions, 16 KiB alignment and runtime licenses.'
    New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($delivery)) | Out-Null
    Copy-Item -LiteralPath $apk -Destination $delivery -Force
    $hashStream = [IO.File]::OpenRead($delivery)
    $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $hashAlgorithm.Dispose()
        $hashStream.Dispose()
    }
    $receipt = @{schema=1;kind='native-package';platform='android';version='0.2.0';profile='production';stage='internal';published=$false;formalAssets=$true;file=[IO.Path]::GetFileName($delivery);bytes=(Get-Item -LiteralPath $delivery).Length;sha256=$hash;artifact=@{file=[IO.Path]::GetFileName($delivery);bytes=(Get-Item -LiteralPath $delivery).Length;sha256=$hash};sourceHash=$preflight.sourceHash;protocolVersion=$preflight.protocolVersion;mapIdentity=$preflight.mapIdentity;physics=$preflight.physics;sdk=$preflight.sdk;signatureVerified=$true;pageAlignmentKiB=16;minimumSdk=29;targetSdk=35;abi='arm64-v8a';deviceVerified=$false;signing='internal-preview';checkedAt=[DateTime]::UtcNow.ToString('o');audit=$audit}
    $receiptJson = $receipt | ConvertTo-Json -Depth 12
    $utf8 = New-Object Text.UTF8Encoding $false
    [IO.File]::WriteAllText(($delivery+'.json'),$receiptJson,$utf8)
    [IO.File]::WriteAllText(($delivery+'.sha256'),($hash+'  '+[IO.Path]::GetFileName($delivery)+[Environment]::NewLine),$utf8)
    [IO.File]::WriteAllText((Join-Path $project 'work/android-export-report-0.2.0.json'),$receiptJson,$utf8)
    Write-Output ('APK SHA-256 '+$hash)
} finally {
    Remove-Item Env:OPENQS_INTERNAL_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD -ErrorAction SilentlyContinue
}
