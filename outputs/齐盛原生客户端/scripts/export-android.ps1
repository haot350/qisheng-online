param([string]$GodotBin = '', [string]$ToolchainFile = '')
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $GodotBin) { $GodotBin = [IO.Path]::GetFullPath((Join-Path $project '../../work/Godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe')) }
if (-not $ToolchainFile) { $ToolchainFile = Join-Path $project 'work/android-toolchain.json' }
if (-not (Test-Path -LiteralPath $ToolchainFile)) { throw 'Prepare the verified JDK 17 and Android SDK toolchain first; see docs/android-build.md' }
$toolchain = Get-Content -LiteralPath $ToolchainFile -Raw | ConvertFrom-Json
$java = [IO.Path]::GetFullPath($toolchain.javaSdk)
$sdk = [IO.Path]::GetFullPath($toolchain.androidSdk)
foreach ($tool in @((Join-Path $java 'bin/java.exe'),(Join-Path $java 'bin/keytool.exe'),(Join-Path $java 'bin/jarsigner.exe'),(Join-Path $sdk 'build-tools/35.0.1/apksigner.bat'),(Join-Path $sdk 'platform-tools/adb.exe'),$GodotBin)) {
    if (-not (Test-Path -LiteralPath $tool)) { throw ('Required export tool missing: '+$tool) }
}
if (-not (Test-Path -LiteralPath (Join-Path $project 'work/templates/android_debug.apk'))) { throw 'Missing official Godot 4.7.2 Android debug template' }
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
$signing = Get-Content -LiteralPath $keyConfig -Raw | ConvertFrom-Json
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
$stage = [IO.Path]::GetFullPath((Join-Path $project '../../work/native-android-export'))
New-Item -ItemType Directory -Force $stage | Out-Null
$apk = Join-Path $stage 'qisheng-online-native-m1-arm64-internal.apk'
$delivery = Join-Path $project 'dist/qisheng-online-native-m1-arm64-internal.apk'
try {
    & $GodotBin --headless --path $project --export-debug 'Android Internal arm64' $apk
    if ($LASTEXITCODE -ne 0) { throw 'Godot Android internal export failed' }
    $unsigned = Join-Path $stage 'android-sdk-levels-unsigned.apk'
    $aligned = Join-Path $stage 'android-sdk-levels-aligned.apk'
    $python = if ($toolchain.python) { $toolchain.python } else { (Get-Command python -ErrorAction Stop).Source }
    & $python (Join-Path $project 'scripts/set-android-sdk.py') $apk $unsigned --min-sdk 29 --target-sdk 35 --report (Join-Path $project 'work/android-manifest-report.json')
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
    Write-Output 'APK verified: internal signature, Android 10+, target API 35, arm64-v8a, network permission.'
    Copy-Item -LiteralPath $apk -Destination $delivery -Force
    $hash = (Get-FileHash -LiteralPath $delivery -Algorithm SHA256).Hash.ToLowerInvariant()
    @{artifact='dist/qisheng-online-native-m1-arm64-internal.apk';bytes=(Get-Item -LiteralPath $delivery).Length;sha256=$hash;signatureVerified=$true;pageAlignmentKiB=16;minimumSdk=29;targetSdk=35;abi='arm64-v8a';deviceVerified=$false;signing='internal-preview';checkedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $project 'work/android-export-report.json') -Encoding utf8
    Write-Output ('APK SHA-256 '+$hash)
} finally {
    Remove-Item Env:OPENQS_INTERNAL_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD -ErrorAction SilentlyContinue
}
