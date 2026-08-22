param(
  [string]$Year = "2026",
  [string]$From = "",
  [string]$To = "",
  [switch]$NoAutoDeployProduction
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot

function RunNpm([string]$label, [string[]]$npmArgs) {
  Write-Host ""
  Write-Host ("[{0}] npm {1}" -f $label, ($npmArgs -join " "))
  if (-not $npmArgs -or $npmArgs.Count -lt 1) {
    throw ("{0} failed: empty npm args" -f $label)
  }
  & npm @npmArgs
  if ($LASTEXITCODE -ne 0) {
    throw ("{0} failed (exit_code={1})" -f $label, $LASTEXITCODE)
  }
}

function RunNpmSoft([string]$label, [string[]]$npmArgs) {
  Write-Host ""
  Write-Host ("[{0}] npm {1}" -f $label, ($npmArgs -join " "))
  if (-not $npmArgs -or $npmArgs.Count -lt 1) {
    throw ("{0} failed: empty npm args" -f $label)
  }
  & npm @npmArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Warning ("{0} reported mismatches (exit_code={1}) but bulk update will continue" -f $label, $LASTEXITCODE)
  }
}

Write-Host "[invoke_bulk_update_selfheal] repoRoot=$repoRoot year=$Year from=$From to=$To autoDeployProduction=$(-not $NoAutoDeployProduction)"

# 1) 取得（raw/canonical 等）
$dailyArgs = @("run","daily:npb-pipeline","--","--year",$Year)
if ($From) { $dailyArgs += @("--from",$From) }
if ($To)   { $dailyArgs += @("--to",$To) }
if (-not $NoAutoDeployProduction) { $dailyArgs += "--auto-deploy-production" }
RunNpm -label "daily:npb-pipeline" -npmArgs $dailyArgs

# 1.5) 未来日付の先取り取得で「HTMLは200だが中身が空」になっていたゲームを回復させる
# - only-incomplete: 欠損のみ再取得（軽量）
$refetchArgs = @("run","phase2:sportsnavi:stats-text:refetch-incomplete","--","--year",$Year)
if ($From) { $refetchArgs += @("--from",$From) }
if ($To)   { $refetchArgs += @("--to",$To) }
RunNpm -label "phase2:sportsnavi:stats-text:refetch-incomplete" -npmArgs $refetchArgs

# raw から canonical を再生成（refetch の反映）
# NOTE: raw stats/text を refetch した場合、既存 canonical を更新するため --force が必要
$canonicalArgs = @("run","phase2:sportsnavi:canonical","--","--year",$Year,"--force")
if ($From) { $canonicalArgs += @("--from",$From) }
if ($To)   { $canonicalArgs += @("--to",$To) }
RunNpm -label "phase2:sportsnavi:canonical" -npmArgs $canonicalArgs

# 投手表の列ずれをここで止める（例: 投球回に投球数が入り、防御率ランキングが壊れる）
RunNpm -label "validate:canonical-pitching-lines-sanity" -npmArgs @("run","validate:canonical-pitching-lines-sanity","--","--year",$Year,"--fail")

# 2) 自己修復: テキスト速報から plateAppearances を埋める（PA=0 を残さない）
$backfillArgs = @("run","backfill:canonical:plate-appearances-from-text","--","--year",$Year)
if ($From) { $backfillArgs += @("--from",$From) }
if ($To)   { $backfillArgs += @("--to",$To) }
RunNpm -label "backfill:canonical:plate-appearances-from-text" -npmArgs $backfillArgs

# 2.5) 日程にある完了試合とcanonicalを突合し、欠落試合を取得からやり直す
$scheduleRepairArgs = @("run","repair:canonical-from-schedule","--","--year",$Year)
if ($From) { $scheduleRepairArgs += @("--from",$From) }
if ($To)   { $scheduleRepairArgs += @("--to",$To) }
RunNpm -label "repair:canonical-from-schedule" -npmArgs $scheduleRepairArgs

# 3) 検証（警告の有無はログ/JSONに残る。ここでは運用を止めない）
$validateBattingArgs = @("run","validate:canonical-batting-completeness","--","--year",$Year)
if ($From) { $validateBattingArgs += @("--from",$From) }
if ($To)   { $validateBattingArgs += @("--to",$To) }
RunNpm -label "validate:canonical-batting-completeness" -npmArgs $validateBattingArgs

# 4) 派生 + ランキング再生成（各種ページ数値更新）
$derivedArgs = @("run","phase3:derived:2026","--")
if ($From) { $derivedArgs += @("--from",$From) }
if ($To)   { $derivedArgs += @("--to",$To) }
RunNpm -label "phase3:derived:2026" -npmArgs $derivedArgs

$phase28Args = @("run","phase28:build:weekly-rankings","--","--year",$Year)
if ($From) { $phase28Args += @("--from",$From) }
if ($To)   { $phase28Args += @("--to",$To) }

$phase11Args = @("run","phase11:build:batting","--","--year",$Year)
if ($From) { $phase11Args += @("--from",$From) }
if ($To)   { $phase11Args += @("--to",$To) }

$phase29Args = @("run","phase29:build:standings","--","--year",$Year)
if ($From) { $phase29Args += @("--from",$From) }
if ($To)   { $phase29Args += @("--to",$To) }

$topWeeklyArgs = @("run","top-weekly-leaders:build:2026","--","--year",$Year)
if ($From) { $topWeeklyArgs += @("--from",$From) }
if ($To)   { $topWeeklyArgs += @("--to",$To) }

RunNpm -label "phase12:build:rankings" -npmArgs @("run","phase12:build:rankings")
RunNpm -label "phase19:build:pitching-rankings" -npmArgs @("run","phase19:build:pitching-rankings")
RunNpm -label "phase28:build:weekly-rankings" -npmArgs $phase28Args
RunNpm -label "phase11:build:batting:range" -npmArgs $phase11Args
RunNpm -label "phase29:build:standings" -npmArgs $phase29Args
$standingsFreshnessArgs = @("run","validate:standings-window-freshness","--","--year",$Year,"--fail")
if ($From) { $standingsFreshnessArgs += @("--from",$From) }
if ($To)   { $standingsFreshnessArgs += @("--to",$To) }
RunNpm -label "validate:standings-window-freshness" -npmArgs $standingsFreshnessArgs
RunNpm -label "top-leaders:build:2026" -npmArgs @("run","top-leaders:build:2026")
RunNpm -label "top-weekly-leaders:build:2026" -npmArgs $topWeeklyArgs
$phase36Args = @("run","phase36:build:top-probables","--","--year",$Year)
if ($To) {
  $phase36Args += @("--as-of",$To)
} elseif ($From) {
  $phase36Args += @("--as-of",$From)
}
RunNpm -label "phase36:build:top-probables" -npmArgs $phase36Args

# 5) 打撃の最終整合性チェック
# - appearance slots 側の表記ゆれ（例: 捕２）で phase11 と battingLines がズレていないか確認
$validatePhase11Args = @("run","validate:batting-phase11-vs-batting-lines","--","--year",$Year)
if ($From) { $validatePhase11Args += @("--from",$From) }
if ($To)   { $validatePhase11Args += @("--to",$To) }
RunNpmSoft -label "validate:phase11-vs-batting-lines-totals" -npmArgs $validatePhase11Args

Write-Host ""
Write-Host "[invoke_bulk_update_selfheal] done"

