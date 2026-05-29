/**
 * Phase 28: Phase 17 / Phase 7 派生から週間ランキング JSON を生成（再集計しない）
 *
 * 前提: phase17:build:period / phase7:build:pitcher-period 済み
 *
 * Usage:
 *   npx tsx scripts/phase28_build_weekly_rankings_from_period.ts --year 2026
 *   npx tsx scripts/phase28_build_weekly_rankings_from_period.ts --year 2026 --week 2026-05-13
 *   npx tsx scripts/phase28_build_weekly_rankings_from_period.ts --year 2026 --anchor 2026-05-19
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"
import { buildWeeklyRankingsFromPeriod } from "@/lib/ranking/buildWeeklyRankingsFromPeriod"
import { tuesdayWeekKeyFromYmd } from "@/lib/yahooGame/jstPeriodKeys"
import { weekKeysToBuild } from "@/lib/ranking/weeklyRankingsWeekKeys"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; week?: string; anchor?: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  let week: string | undefined
  let anchor: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--week" && args[i + 1]) {
      week = args[i + 1]!
      i++
    } else if (args[i] === "--anchor" && args[i + 1]) {
      anchor = args[i + 1]!
      i++
    }
  }
  return { year, week, anchor }
}

function main(): void {
  process.chdir(projectRoot)
  const { year, week, anchor } = parseArgs()

  if (year !== "2026") {
    console.error("[phase28] v1 は --year 2026 のみ")
    process.exit(1)
  }

  const battingDir = join(projectRoot, "_data", "derived", "player_season_batting_period", year)
  if (!existsSync(battingDir)) {
    console.error("[phase28] missing:", battingDir)
    console.error("  run: npm run phase17:build:period")
    process.exit(1)
  }

  let weekKeys: string[] | undefined
  if (week) {
    const wk = tuesdayWeekKeyFromYmd(week) ?? week
    weekKeys = [wk]
  } else if (anchor) {
    weekKeys = weekKeysToBuild(anchor)
  }

  console.log(`[phase28] building weekly rankings for ${year}...`)
  const result = buildWeeklyRankingsFromPeriod(projectRoot, { year, weekKeys, anchorYmd: anchor })

  console.log(`[phase28] weeks: ${result.weekKeys.join(", ")}`)
  console.log(
    `[phase28] wrote ${result.battingFiles} batting + ${result.pitchingFiles} pitching metric files`
  )
  if (result.excludedBatters > 0) {
    console.warn(`[phase28] excluded batters (league unresolved): ${result.excludedBatters}`)
  }
  if (result.excludedPitchers > 0) {
    console.warn(`[phase28] excluded pitchers (league unresolved): ${result.excludedPitchers}`)
  }
  if (result.skippedPitchersNoYahoo > 0) {
    console.warn(`[phase28] skipped pitchers (no yahoo id in bridge): ${result.skippedPitchersNoYahoo}`)
  }
  console.log("[phase28] done")
}

main()
