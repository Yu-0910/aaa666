# 20:30 JST 先行取得（Phase0〜2b。派生・Phase4 は試合終了後の watch / finalize で実行）
param(
  [string]$Year = "2026"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot

Write-Host "[invoke_daily_prefetch_2030] repoRoot=$repoRoot year=$Year"
& npm run daily:npb-pipeline:prefetch -- --year $Year
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
