param(
  [string]$Year = "2026",
  [string]$From = "2026-03-27",
  [string]$To = "2026-04-22"
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
Write-Host "[invoke_daily_pipeline] repoRoot=$repoRoot year=$Year from=$From to=$To"
& npm run daily:npb-pipeline -- --year $Year --from $From --to $To
exit $LASTEXITCODE
