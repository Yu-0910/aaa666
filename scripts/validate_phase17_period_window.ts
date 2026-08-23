/**
 * Phase17 差分再生成の健全性検証。
 *
 * 差分対象打者について、対象日付範囲で触れた calendar_week / calendar_month 行を
 * 年間 canonical から再計算した値と突き合わせる。
 *
 * Usage:
 *   npx tsx scripts/validate_phase17_period_window.ts --year 2026 --from 2026-08-21 --to 2026-08-21 --only-yahoo-ids 2000051,1100082
 *   npx tsx scripts/validate_phase17_period_window.ts --year 2026 --from 2026-08-21 --to 2026-08-21 --only-yahoo-ids 2000051 --fail
 */

import { existsSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import { monthKeyFromYmd, tuesdayWeekKeyFromYmd } from "@/lib/yahooGame/jstPeriodKeys"
import {
  aggregateBattingForBatterInGameForProfiles,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Args = {
  year: string
  from: string | null
  to: string | null
  onlyYahooIds: string[]
  fail: boolean
}

type PeriodRow = {
  split_type?: string
  split_value?: string
  g?: number
  pa?: number
  ab?: number
  h?: number
  hr?: number
  bb?: number
  hbp?: number
  sh?: number
  sf?: number
  r?: number
  rbi?: number
  sb?: number
  cs?: number
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyYahooIds: string[] = []
  let fail = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
      i++
    } else if (args[i] === "--fail") {
      fail = true
    }
  }
  return { year, from, to, onlyYahooIds, fail }
}

function readPeriodRows(year: string, yahooId: string): PeriodRow[] {
  const filePath = join(projectRoot, "_data", "derived", "player_season_batting_period", year, `yahoo_${yahooId}.json`)
  if (!existsSync(filePath)) return []
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as { rows?: PeriodRow[] }
    return Array.isArray(raw.rows) ? raw.rows : []
  } catch {
    return []
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function hasVisibleBattingPeriodStats(agg: ReturnType<typeof emptyBattingSeasonAggYahoo>): boolean {
  return (
    agg.pa > 0 ||
    agg.ab > 0 ||
    agg.h > 0 ||
    agg.hr > 0 ||
    agg.bb > 0 ||
    agg.hbp > 0 ||
    agg.sh > 0 ||
    agg.sf > 0 ||
    agg.r > 0 ||
    agg.rbi > 0 ||
    agg.sb > 0 ||
    agg.cs > 0
  )
}

function main(): void {
  const { year, from, to, onlyYahooIds, fail } = parseArgs()
  if (onlyYahooIds.length === 0) {
    console.log("[validate:phase17-period-window] no target ids; skipping")
    return
  }

  const scopeDocs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, {
    year,
    from: from ?? undefined,
    to: to ?? undefined,
  })
  const fullDocs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })

  const targetSet = new Set(onlyYahooIds)
  const touchedWeeksById = new Map<string, Set<string>>()
  const touchedMonthsById = new Map<string, Set<string>>()
  for (const doc of scopeDocs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    const weekKey = tuesdayWeekKeyFromYmd(ymd)
    const monthKey = monthKeyFromYmd(ymd)
    if (!weekKey) continue
    const batterIds = new Set<string>()
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid && targetSet.has(bid)) batterIds.add(bid)
    }
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (bid && targetSet.has(bid)) batterIds.add(bid)
    }
    for (const bid of batterIds) {
      const weekSet = touchedWeeksById.get(bid) ?? new Set<string>()
      weekSet.add(weekKey)
      touchedWeeksById.set(bid, weekSet)
      const monthSet = touchedMonthsById.get(bid) ?? new Set<string>()
      monthSet.add(monthKey)
      touchedMonthsById.set(bid, monthSet)
    }
  }

  const errors: string[] = []
  const checked: string[] = []

  for (const yahooId of onlyYahooIds) {
    const touchedWeeks = touchedWeeksById.get(yahooId) ?? new Set<string>()
    const touchedMonths = touchedMonthsById.get(yahooId) ?? new Set<string>()
    if (touchedWeeks.size === 0 && touchedMonths.size === 0) continue

    const periodRows = readPeriodRows(year, yahooId)
    const periodMap = new Map<string, PeriodRow>()
    for (const row of periodRows) {
      const splitType = String(row.split_type ?? "").trim()
      const splitValue = String(row.split_value ?? "").trim()
      if (!splitType || !splitValue) continue
      periodMap.set(`${splitType}:${splitValue}`, row)
    }

    const byWeek = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
    const byMonth = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
    for (const doc of fullDocs) {
      const ymd = parseGameDateYmdFromCanonical(doc)
      if (!ymd) continue
      const weekKey = tuesdayWeekKeyFromYmd(ymd)
      if (!weekKey) continue
      const monthKey = monthKeyFromYmd(ymd)
      if (!touchedWeeks.has(weekKey) && !touchedMonths.has(monthKey)) continue
      const agg = aggregateBattingForBatterInGameForProfiles(doc, yahooId)
      if (!agg) continue
      if (touchedWeeks.has(weekKey)) {
        const target = byWeek.get(weekKey) ?? emptyBattingSeasonAggYahoo()
        mergeBattingSeasonAggYahoo(target, agg)
        byWeek.set(weekKey, target)
      }
      if (touchedMonths.has(monthKey)) {
        const target = byMonth.get(monthKey) ?? emptyBattingSeasonAggYahoo()
        mergeBattingSeasonAggYahoo(target, agg)
        byMonth.set(monthKey, target)
      }
    }

    for (const weekKey of touchedWeeks) {
      checked.push(`${yahooId}:calendar_week:${weekKey}`)
      const row = periodMap.get(`calendar_week:${weekKey}`)
      const agg = byWeek.get(weekKey) ?? emptyBattingSeasonAggYahoo()
      if (!row) {
        if (hasVisibleBattingPeriodStats(agg)) {
          errors.push(`${yahooId} calendar_week ${weekKey}: row missing`)
        }
        continue
      }
      const mismatches = [
        ["g", num(row.g), agg.gameIds.size],
        ["pa", num(row.pa), agg.pa],
        ["ab", num(row.ab), agg.ab],
        ["h", num(row.h), agg.h],
        ["hr", num(row.hr), agg.hr],
        ["bb", num(row.bb), agg.bb],
        ["hbp", num(row.hbp), agg.hbp],
        ["sh", num(row.sh), agg.sh],
        ["sf", num(row.sf), agg.sf],
        ["r", num(row.r), agg.r],
        ["rbi", num(row.rbi), agg.rbi],
        ["sb", num(row.sb), agg.sb],
        ["cs", num(row.cs), agg.cs],
      ].filter(([, actual, expected]) => actual !== expected)
      if (mismatches.length > 0) {
        errors.push(
          `${yahooId} calendar_week ${weekKey}: ${mismatches
            .map(([k, actual, expected]) => `${k} actual=${actual} expected=${expected}`)
            .join(", ")}`
        )
      }
    }

    for (const monthKey of touchedMonths) {
      checked.push(`${yahooId}:calendar_month:${monthKey}`)
      const row = periodMap.get(`calendar_month:${monthKey}`)
      const agg = byMonth.get(monthKey) ?? emptyBattingSeasonAggYahoo()
      if (!row) {
        if (hasVisibleBattingPeriodStats(agg)) {
          errors.push(`${yahooId} calendar_month ${monthKey}: row missing`)
        }
        continue
      }
      const mismatches = [
        ["g", num(row.g), agg.gameIds.size],
        ["pa", num(row.pa), agg.pa],
        ["ab", num(row.ab), agg.ab],
        ["h", num(row.h), agg.h],
        ["hr", num(row.hr), agg.hr],
        ["bb", num(row.bb), agg.bb],
        ["hbp", num(row.hbp), agg.hbp],
        ["sh", num(row.sh), agg.sh],
        ["sf", num(row.sf), agg.sf],
      ].filter(([, actual, expected]) => actual !== expected)
      if (mismatches.length > 0) {
        errors.push(
          `${yahooId} calendar_month ${monthKey}: ${mismatches
            .map(([k, actual, expected]) => `${k} actual=${actual} expected=${expected}`)
            .join(", ")}`
        )
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[error] ${error}`)
    console.error(
      `[validate:phase17-period-window] FAILED checked=${checked.length} errors=${errors.length}`
    )
    if (fail) process.exit(1)
    return
  }

  console.log(`[validate:phase17-period-window] OK checked=${checked.length} ids=${onlyYahooIds.length}`)
}

main()
