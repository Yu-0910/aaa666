/**
 * Phase 3: 名簿捕手の捕手派生 JSON カバレッジ検証
 *
 *   npx tsx scripts/validate_roster_catchers_derived_coverage.ts --year 2026 [--fail]
 */

import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { getRosterCatchersFromCsv } from "@/lib/rosterCatcherPlayerPageReachability"
import type { CatcherAppearancesDerived } from "@/lib/catcherAppearances"

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

type DerivedKind =
  | "appearances"
  | "pitcher_splits"
  | "defense_basic"
  | "starting_summary"
  | "pa_round_pitch_types"

const DERIVED_DIRS: Record<DerivedKind, string> = {
  appearances: "player_catcher_appearances",
  pitcher_splits: "player_catcher_pitcher_splits",
  defense_basic: "player_catcher_defense_basic",
  starting_summary: "player_catcher_starting_summary",
  pa_round_pitch_types: "player_catcher_pa_round_pitch_types",
}

function derivedPath(year: string, kind: DerivedKind, npbId: string): string {
  const safeNpb = npbId.replace(/[^\d]/g, "")
  return join(projectRoot, "_data", "derived", DERIVED_DIRS[kind], year, `npb_${safeNpb}.json`)
}

function loadAppearances(path: string): CatcherAppearancesDerived | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CatcherAppearancesDerived
  } catch {
    return null
  }
}

function main() {
  const { year, fail } = parseArgs()
  const catchers = getRosterCatchersFromCsv()

  const noAppearancesJson: string[] = []
  const zeroGames: string[] = []
  const withGames: Array<{ name: string; npb: string; games: number }> = []
  const missingOther: Array<{ name: string; npb: string; kind: DerivedKind }> = []

  for (const p of catchers) {
    const npb = p.npb_player_id.trim()
    const label = `${p.name_ja} (${npb})`
    const appPath = derivedPath(year, "appearances", npb)
    const app = loadAppearances(appPath)

    if (!app) {
      noAppearancesJson.push(label)
      continue
    }
    if (app.gamesAsCatcher <= 0) {
      zeroGames.push(label)
      continue
    }
    withGames.push({ name: p.name_ja, npb, games: app.gamesAsCatcher })

    for (const kind of [
      "pitcher_splits",
      "defense_basic",
      "starting_summary",
      "pa_round_pitch_types",
    ] as const) {
      if (!existsSync(derivedPath(year, kind, npb))) {
        missingOther.push({ name: p.name_ja, npb, kind })
      }
    }
  }

  console.log(`[validate_roster_catchers_derived_coverage] year=${year} roster catchers=${catchers.length}`)
  console.log(`  with appearances JSON & games>=1: ${withGames.length}`)
  console.log(`  appearances JSON missing: ${noAppearancesJson.length}`)
  console.log(`  appearances JSON but games=0: ${zeroGames.length}`)
  console.log(`  missing secondary derived (among with games): ${missingOther.length}`)

  if (withGames.length > 0) {
    console.log("\n  sample with data:")
    for (const r of withGames.slice(0, 5)) {
      console.log(`    ${r.name} (${r.npb}): ${r.games} games`)
    }
  }

  if (noAppearancesJson.length) {
    console.log("\n  no appearances JSON (likely no season catching yet):")
    for (const s of noAppearancesJson.slice(0, 10)) console.log(`    - ${s}`)
    if (noAppearancesJson.length > 10) console.log(`    ... +${noAppearancesJson.length - 10}`)
  }

  if (missingOther.length) {
    console.log("\n  missing derived for active catchers:")
    for (const m of missingOther.slice(0, 15)) {
      console.log(`    - ${m.name} (${m.npb}): ${m.kind}`)
    }
  }

  const reportPath = join(projectRoot, "docs", "roster_catcher_derived_coverage.md")
  const md = [
    "# 名簿捕手 派生カバレッジ（Phase 3 自動生成）",
    "",
    `年度: ${year} / 名簿捕手: ${catchers.length} 名`,
    "",
    "| 区分 | 件数 |",
    "|------|------|",
    `| 出場あり（phase22 games>=1） | ${withGames.length} |`,
    `| phase22 JSON なし | ${noAppearancesJson.length} |`,
    `| phase22 あり・試合 0 | ${zeroGames.length} |`,
    `| 出場ありだが phase23〜26 欠損 | ${missingOther.length} |`,
    "",
    "## 出場あり捕手",
    "",
    "| 選手 | NPB ID | 試合 |",
    "|------|--------|------|",
    ...withGames.map((r) => `| ${r.name} | ${r.npb} | ${r.games} |`),
    "",
  ].join("\n")
  writeFileSync(reportPath, md, "utf8")
  console.log(`\n  wrote ${reportPath}`)

  if (fail && missingOther.length > 0) {
    process.exit(1)
  }
}

main()
