# 球場名付き日程の再取得 + Phase13 再生成（リポジトリルートから実行）
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "..")
Write-Host "[run_rebuild_stadium_context] cwd=$((Get-Location).Path)"
npm run rebuild:stadium-context:2026
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[run_rebuild_stadium_context] done"
