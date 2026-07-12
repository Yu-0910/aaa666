param(
  [string]$Year = "2026",
  [string]$From = "",
  [string]$To = ""
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

Write-Host "[invoke_bulk_update_selfheal] repoRoot=$repoRoot year=$Year from=$From to=$To"

# 1) 取得（raw/canonical 等）
$dailyArgs = @("npm","run","daily:npb-pipeline","--","--year",$Year)
if ($From) { $dailyArgs += @("--from",$From) }
if ($To)   { $dailyArgs += @("--to",$To) }
RunNpm -label "daily:npb-pipeline" -npmArgs (@("run","daily:npb-pipeline","--","--year",$Year) + ($(if($From){@("--from",$From)}else{@()}) ) + ($(if($To){@("--to",$To)}else{@()}) ))

# 1.5) 未来日付の先取り取得で「HTMLは200だが中身が空」になっていたゲームを回復させる
# - only-incomplete: 欠損のみ再取得（軽量）
RunNpm -label "phase2:sportsnavi:stats-text:refetch-incomplete" -npmArgs @("run","phase2:sportsnavi:stats-text:refetch-incomplete","--","--year",$Year)

# raw から canonical を再生成（refetch の反映）
# NOTE: raw stats/text を refetch した場合、既存 canonical を更新するため --force が必要
RunNpm -label "phase2:sportsnavi:canonical" -npmArgs @("run","phase2:sportsnavi:canonical","--","--year",$Year,"--force")

# 投手表の列ずれをここで止める（例: 投球回に投球数が入り、防御率ランキングが壊れる）
RunNpm -label "validate:canonical-pitching-lines-sanity" -npmArgs @("run","validate:canonical-pitching-lines-sanity","--","--year",$Year,"--fail")

# 2) 自己修復: テキスト速報から plateAppearances を埋める（PA=0 を残さない）
RunNpm -label "backfill:canonical:plate-appearances-from-text" -npmArgs @("run","backfill:canonical:plate-appearances-from-text")

# 3) 検証（警告の有無はログ/JSONに残る。ここでは運用を止めない）
RunNpm -label "validate:canonical-batting-completeness" -npmArgs @("run","validate:canonical-batting-completeness")

# 4) 派生 + ランキング再生成（各種ページ数値更新）
RunNpm -label "phase3:derived:2026:and-rankings" -npmArgs @("run","phase3:derived:2026:and-rankings")

# 5) 打撃の最終整合性チェック
# - appearance slots 側の表記ゆれ（例: 捕２）で phase11 と battingLines がズレていないか確認
RunNpmSoft -label "validate:phase11-vs-batting-lines-totals" -npmArgs @("run","validate:batting-phase11-vs-batting-lines","--","--year",$Year)

Write-Host ""
Write-Host "[invoke_bulk_update_selfheal] done"

