$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
Write-Host "[invoke_derive_and_rankings] repoRoot=$repoRoot"
& npm run daily:npb-pipeline -- --derive-only
exit $LASTEXITCODE
