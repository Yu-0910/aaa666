/**
 * Phase 2: 週間ランキング JSON からトップ「今週」用スナップショットを生成
 *
 * 前提: npm run phase28:build:weekly-rankings
 *
 * Usage:
 *   npx tsx scripts/build_top_weekly_leaders_snapshot.ts [--year 2026]
 *   npx tsx scripts/build_top_weekly_leaders_snapshot.ts --year 2026 --week 2026-05-13
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { buildWeeklyTopLeadersSnapshots, listWeeklyRankingWeekKeys } from "@/lib/topPage/weeklyLeadersSnapshotBuild"
import { writeWeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"
import { todayYmdJst, weekKeysToBuild } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { tuesdayWeekKeyFromYmd } from "@/lib/yahooGame/jstPeriodKeys"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; week?: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  let week: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--week" && args[i + 1]) {
      week = args[i + 1]!
      i++
    }
  }
  return { year, week }
}

function main(): void {
  process.chdir(projectRoot)
  const { year, week } = parseArgs()

  if (year !== "2026") {
    console.error("[top-weekly-leaders] v1 は --year 2026 のみ")
    process.exit(1)
  }

  const weekKeys = week ? [tuesdayWeekKeyFromYmd(week) ?? week] : undefined

  console.log(`[top-weekly-leaders] building snapshots for ${year}...`)
  const { written, skipped } = buildWeeklyTopLeadersSnapshots(projectRoot, year, weekKeys)

  for (const p of written) {
    console.log(`[top-weekly-leaders] wrote ${p}`)
  }
  for (const s of skipped) {
    console.warn(
      `[top-weekly-leaders] skipped ${s.weekKey || "?"} ${s.league} ${s.category}: ${s.reason}`
    )
  }

  if (written.length === 0) {
    console.error(
      "[top-weekly-leaders] no files written. Run: npm run phase28:build:weekly-rankings"
    )
    process.exit(1)
  }

  const builtWeekKeys = listWeeklyRankingWeekKeys(projectRoot, year)
  const calendarKey = weekKeysToBuild(todayYmdJst())[0]
  if (calendarKey && builtWeekKeys.length > 0) {
    writeWeeklyCurrentWeekJson(projectRoot, year, calendarKey, builtWeekKeys)
  }

  if (skipped.length > 0 && written.length > 0) {
    console.warn(`[top-weekly-leaders] ${skipped.length} skip(s); display week updated in current-week.json`)
  } else if (skipped.length > 0) {
    process.exit(2)
  }

  console.log(`[top-weekly-leaders] done (${written.length} files)`)
}

main()
