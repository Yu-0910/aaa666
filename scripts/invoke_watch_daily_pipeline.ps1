# 試合終了待ち → 日次一括パイプライン起動
# タスク スケジューラ: 毎日 18:00 JST にこのスクリプトを実行すると、
#   土日は 18:00 から監視、平日は 21:00 まで待ってから監視を開始する。
param(
  [string]$Year = "2026",
  [switch]$DryRun,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot

$npmArgs = @("run", "watch:daily-pipeline", "--", "--year", $Year)
if ($DryRun) { $npmArgs += "--dry-run" }
if ($Once) { $npmArgs += "--once" }

Write-Host "[invoke_watch_daily_pipeline] repoRoot=$repoRoot"
& npm @npmArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
