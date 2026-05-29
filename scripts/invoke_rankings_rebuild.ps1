$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
Write-Host "[invoke_rankings_rebuild] repoRoot=$repoRoot"
& npm run rankings:rebuild
exit $LASTEXITCODE
