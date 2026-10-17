param([string]$Archive = '')
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expected = 'e7a0ecab03084c98033de55dfd03abb8336e02d0284af32025e53e6946f9510d'
$url = 'https://github.com/colyseus/native-sdk/releases/download/godot-v0.18.7/colyseus-godot-0.18.7.zip'
New-Item -ItemType Directory -Force (Join-Path $project 'work') | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $project 'work/.gdignore'))) { New-Item -ItemType File -Path (Join-Path $project 'work/.gdignore') | Out-Null }
if (-not $Archive) {
    $Archive = Join-Path $project 'work/colyseus-godot-0.18.7.zip'
    if (-not (Test-Path -LiteralPath $Archive)) { Invoke-WebRequest $url -OutFile $Archive }
}
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Official SDK archive checksum mismatch' }
$staging = Join-Path $project 'work/colyseus-sdk'
Expand-Archive -LiteralPath $Archive -DestinationPath $staging -Force
Copy-Item -LiteralPath (Join-Path $staging 'addons') -Destination $project -Recurse -Force
Write-Output 'Colyseus Godot 0.18.7 installed and SHA-256 verified. No credentials were used.'
