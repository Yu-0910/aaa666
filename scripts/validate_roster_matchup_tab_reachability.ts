/**
 * Phase 5: 2026 名簿全員で今季サブタブ「対戦成績」が出ることの静的検証
 *
 *   npx tsx scripts/validate_roster_matchup_tab_reachability.ts --year 2026 [--fail]
 */

import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  evaluateMatchupTabReachability,
  getRosterPlayersForMatchupTabCheck,
} from "@/lib/rosterMatchupPlayerPageReachability"
import { isPitcherRegistrationPosition } from "@/lib/rosterPitcher"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; fail: boolean } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--fail") fail = true
  }
  return { year, fail }
}

function derivedExists(
  year: string,
  category: "player_matchup_batting" | "player_matchup_pitching",
  npbId: string,
): boolean {
  const safe = npbId.replace(/[^\d]/g, "")
  return existsSync(
    join(projectRoot, "_data", "derived", category, year, `npb_${safe}.json`),
  )
}

function main() {
  const { year, fail } = parseArgs()
  const players = getRosterPlayersForMatchupTabCheck()

  const uiFailures: string[] = []
  let pitchers = 0
  let fielders = 0
  let withBattingDerived = 0
  let withPitchingDerived = 0
  let noDerivedExpected = 0

  for (const p of players) {
    const r = evaluateMatchupTabReachability(p)
    if (!r.ok) {
      uiFailures.push(`${p.name_ja} (${p.npb_player_id}): ${r.issues.map((i) => i.message).join("; ")}`)
      continue
    }

    const isPitcher = isPitcherRegistrationPosition(p.position, {
      rosterNpbPlayerId: p.npb_player_id,
    })
    if (r.showPitcherSeasonUi) pitchers += 1
    if (r.showFielderSeasonUi) fielders += 1

    const hasBat = derivedExists(year, "player_matchup_batting", p.npb_player_id)
    const hasPit = derivedExists(year, "player_matchup_pitching", p.npb_player_id)

    if (r.showFielderSeasonUi && hasBat) withBattingDerived += 1
    if (r.showPitcherSeasonUi && hasPit) withPitchingDerived += 1
    if (!hasBat && !hasPit) noDerivedExpected += 1
  }

  const reportPath = join(projectRoot, "docs", "roster_matchup_tab_coverage.md")
  const lines = [
    "# 名簿選手・対戦成績タブ到達性（Phase 5）",
    "",
    `生成: validate_roster_matchup_tab_reachability.ts（${new Date().toISOString().slice(0, 10)}）`,
    "",
    "| 指標 | 件数 |",
    "|------|------|",
    `| 名簿選手 | ${players.length} |`,
    `| UI 到達 OK | ${players.length - uiFailures.length} |`,
    `| 投手今季 UI | ${pitchers} |`,
    `| 野手今季 UI | ${fielders} |`,
    `| 野手派生あり | ${withBattingDerived} |`,
    `| 投手派生あり | ${withPitchingDerived} |`,
    `| 派生 JSON なし（出場なし等） | ${noDerivedExpected} |`,
    "",
  ]
  if (uiFailures.length > 0) {
    lines.push("## UI 到達 NG", "")
    for (const f of uiFailures) lines.push(`- ${f}`)
    lines.push("")
  }
  writeFileSync(reportPath, lines.join("\n"), "utf8")

  if (uiFailures.length > 0) {
    console.error("[validate_roster_matchup_tab_reachability] UI failures:")
    for (const f of uiFailures.slice(0, 20)) console.error(" ", f)
    if (fail) process.exit(1)
    return
  }

  console.log(
    `[validate_roster_matchup_tab_reachability] OK roster=${players.length} ` +
      `pitcherUi=${pitchers} fielderUi=${fielders} battingDerived=${withBattingDerived} ` +
      `pitchingDerived=${withPitchingDerived} report=${reportPath}`,
  )
}

main()
