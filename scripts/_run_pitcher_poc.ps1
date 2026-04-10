# Resolves repo root from this file location (works even when cwd / env paths are wrong).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
Write-Host "phase:pitcher-poc1 from: $(Get-Location)"
npm run phase:pitcher-poc1
exit $LASTEXITCODE
