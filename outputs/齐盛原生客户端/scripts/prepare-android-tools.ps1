$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work = Join-Path $project 'work'
$downloads = Join-Path $work 'android-direct'
$sdk = Join-Path $work 'android-sdk'
New-Item -ItemType Directory -Force $downloads,$sdk | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $work '.gdignore'))) { New-Item -ItemType File -Path (Join-Path $work '.gdignore') | Out-Null }
function Get-VerifiedArchive([string]$Url,[string]$Name,[string]$Algorithm,[string]$Expected,[hashtable]$Headers=@{}) {
    $file = Join-Path $downloads $Name
    if ((Test-Path -LiteralPath $file) -and (Get-FileHash -LiteralPath $file -Algorithm $Algorithm).Hash.ToLowerInvariant() -eq $Expected) { return $file }
    Invoke-WebRequest $Url -Headers $Headers -OutFile $file -TimeoutSec 600
    if ((Get-FileHash -LiteralPath $file -Algorithm $Algorithm).Hash.ToLowerInvariant() -ne $Expected) { throw ('Official archive checksum mismatch: '+$Name) }
    return $file
}
$jdkFile = Join-Path $downloads 'jdk17-windows.zip'
$jdkHash = 'e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0'
if (-not ((Test-Path -LiteralPath $jdkFile) -and (Get-FileHash -LiteralPath $jdkFile).Hash.ToLowerInvariant() -eq $jdkHash)) {
    $release = Invoke-RestMethod 'https://api.github.com/repos/adoptium/temurin17-binaries/releases/tags/jdk-17.0.20.1%2B1'
    $asset = $release.assets | Where-Object {$_.name -eq 'OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip'}
    if (-not $asset -or $asset.size -ne 190817615) { throw 'Pinned Temurin 17 asset not found' }
    $jdkFile = Get-VerifiedArchive ($asset.url+'?download=1') 'jdk17-windows.zip' 'SHA256' $jdkHash @{Accept='application/octet-stream';'X-GitHub-Api-Version'='2022-11-28'}
}
$base = 'https://dl.google.com/android/repository/'
$packages = @(
    @{name='build-tools_r35.0.1_windows.zip';hash='1cbfa5564b62504a1111352edda35914cf723a20';stage='build-tools';target='build-tools/35.0.1'},
    @{name='platform-35_r02.zip';hash='0bb560a90a7a2cbd0dd8348224d518b638fe7949';stage='platform';target='platforms/android-35'},
    @{name='platform-tools_r37.0.1-win.zip';hash='e03e78b1d80b396f1c3358e31251cb31740e1110';stage='platform-tools';target='platform-tools'}
)
foreach ($package in $packages) {
    $archive = Get-VerifiedArchive ($base+$package.name) $package.name 'SHA1' $package.hash
    $stage = Join-Path $work ('android-staging/'+$package.stage)
    Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
    $source = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
    if (-not $source) { throw ('Invalid official SDK layout: '+$package.name) }
    $target = Join-Path $sdk $package.target
    New-Item -ItemType Directory -Force $target | Out-Null
    Copy-Item -Path (Join-Path $source.FullName '*') -Destination $target -Recurse -Force
}
Expand-Archive -LiteralPath $jdkFile -DestinationPath (Join-Path $work 'jdk17') -Force
$java = (Get-ChildItem (Join-Path $work 'jdk17') -Directory | Select-Object -First 1).FullName
@{javaSdk=$java;androidSdk=$sdk;jdkVersion='17.0.20.1+1';jdkSha256=$jdkHash;buildTools='35.0.1';platform=35;platformTools='37.0.1'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $work 'android-toolchain.json') -Encoding utf8
Write-Output 'Verified local Android export toolchain prepared. Global Java and PATH unchanged.'
