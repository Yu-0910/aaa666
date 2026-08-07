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
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): {
  year: string
  week?: string
  anchor?: string
  from?: string
  to?: string
  leagues?: string[]
  categories?: TopLeadersCategory[]
} {
  const args = process.argv.slice(2)
  let year = "2026"
  let week: string | undefined
  let anchor: string | undefined
  let from: string | undefined
  let to: string | undefined
  let leagues: string[] | undefined
  let categories: TopLeadersCategory[] | undefined
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
    } else if (args[i] === "--from" && args[i + 1]) {
      from = args[i + 1]!
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = args[i + 1]!
      i++
    } else if (args[i] === "--league" && args[i + 1]) {
      leagues = args[i + 1]!
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
      i++
    } else if (args[i] === "--category" && args[i + 1]) {
      categories = args[i + 1]!
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is TopLeadersCategory => v === "batting" || v === "pitching")
      i++
    }
  }
  return { year, week, anchor, from, to, leagues, categories }
}

function main(): void {
  process.chdir(projectRoot)
  const { year, week, anchor, from, to, leagues, categories } = parseArgs()

  if (year !== "2026") {
    console.error("[top-weekly-leaders] v1 は --year 2026 のみ")
    process.exit(1)
  }

  let weekKeys: string[] | undefined
  if (week) {
    weekKeys = [tuesdayWeekKeyFromYmd(week) ?? week]
  } else if (from || to) {
    const keys = new Set<string>()
    if (from) {
      const wk = tuesdayWeekKeyFromYmd(from) ?? from
      keys.add(wk)
    }
    if (to) {
      const wk = tuesdayWeekKeyFromYmd(to) ?? to
      keys.add(wk)
    }
    weekKeys = [...keys].sort()
  } else if (anchor) {
    weekKeys = weekKeysToBuild(anchor)
  }

  console.log(`[top-weekly-leaders] building snapshots for ${year}...`)
  const { written, skipped } = buildWeeklyTopLeadersSnapshots(projectRoot, year, weekKeys, {
    leagues,
    categories,
  })

  for (const p of written) {
    console.log(`[top-weekly-leaders] wrote ${p}`)
  }
  for (const s of skipped) {
    console.warn(
      `[top-weekly-leaders] skipped ${s.weekKey || "?"} ${s.league} ${s.category}: ${s.reason}`
    )
  }

  if (written.length === 0) {
    const explicitScope = Boolean(week || anchor || from || to)
    if (explicitScope) {
      console.warn("[top-weekly-leaders] no files written for requested week scope; skipping")
    } else {
      console.error(
        "[top-weekly-leaders] no files written. Run: npm run phase28:build:weekly-rankings"
      )
      process.exit(1)
    }
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
