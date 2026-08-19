/**
 * Phase 28: Phase 17 / Phase 7 派生を読み、週間ランキング JSON を生成（再集計しない）
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { SeasonStatsRow } from "@/lib/seasonStatsPilot"
import type { PitcherSeasonPitchingPeriodRow } from "@/lib/pitcherSeasonPocTypes"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { resolveYahooPilotIdForStats } from "@/lib/yahooNpbBatterIdMap"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { rosterTeamToRankingShort } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import { loadMetricsFromRecordPitching } from "@/lib/ranking/recordPitching"
import { getJsonKey, getPitchingJsonKey } from "@/lib/ranking/metricMap"
import { sanitizeMetricForPath } from "@/lib/ranking/url"
import { getRomanNameMap } from "@/lib/ranking/romanNameFromCsv"
import {
  buildBattingRankingRowBase,
  sortValueForBattingMetricKey,
} from "@/lib/ranking/battingRankingRowFromSeasonStats"
import {
  buildPitchingRankingRowFromPeriodRow,
  pitchingMetricSortAsc,
  sortValueForPitchingMetricKey,
} from "@/lib/ranking/pitchingRankingRowFromPeriod"
import {
  todayYmdJst,
  weekKeysToBuild,
  weekLabelForKey,
  WEEKLY_RANKINGS_WEEKS_TO_KEEP,
} from "@/lib/ranking/weeklyRankingsWeekKeys"
import { writeWeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"
import { aggregateWeeklyTeamGamesFromCanonical } from "@/lib/yahooGame/aggregateTeamGamesFromCanonical"
import { writeWeeklyTeamGamesFromAggregate } from "@/lib/ranking/teamGamesJson"
import {
  assignRanks,
  filterBattingRowsForQualifyingAtBuild,
  filterPitchingRowsForQualifyingAtBuild,
} from "@/lib/ranking/filterRankingsByQualifyingAtBuild"
import {
  metaForRankingRow,
  resolveBattingRankingLeagueBucket,
  resolvePitchingRankingLeagueBucket,
  resolveRomanNameForRanking,
  yahooMetaFromCanonical,
} from "@/lib/ranking/yahooPlayerMetaForRankings"

export type BuildWeeklyRankingsOptions = {
  year: string
  /** 省略時は JST 今日から今週 + 直近週 */
  weekKeys?: string[]
  anchorYmd?: string
  affectedYahooIds?: readonly string[]
  affectedNpbIds?: readonly string[]
}

export type BuildWeeklyRankingsResult = {
  weekKeys: string[]
  battingFiles: number
  pitchingFiles: number
  excludedBatters: number
  excludedPitchers: number
  skippedPitchersNoYahoo: number
}

type PeriodBattingFile = {
  yahooBatterId?: string
  rows?: SeasonStatsRow[]
}

type PeriodPitchingFile = {
  npbPlayerId?: string
  rows?: PitcherSeasonPitchingPeriodRow[]
}

function sleepMsSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function isRetryableWriteError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "").trim().toUpperCase()
  return code === "UNKNOWN" || code === "EPERM" || code === "EBUSY" || code === "EMFILE" || code === "ENFILE"
}

function canReadJsonFile(filePath: string): boolean {
  try {
    JSON.parse(readFileSync(filePath, "utf8"))
    return true
  } catch {
    return false
  }
}

function writeJsonFileWithRetry(
  filePath: string,
  value: unknown,
  options: { allowExistingFallback?: boolean } = {}
): boolean {
  const body = JSON.stringify(value, null, 2)
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, body, "utf8")
      return true
    } catch (error) {
      lastError = error
      if (!isRetryableWriteError(error) || attempt === 8) break
      const delayMs = attempt <= 3 ? 150 : attempt <= 6 ? 400 : 800
      console.warn(
        `[phase28] write retry ${attempt}/8: ${filePath} code=${String((error as { code?: string } | null)?.code ?? "UNKNOWN")} wait=${delayMs}ms`
      )
      sleepMsSync(delayMs)
    }
  }
  if (options.allowExistingFallback && existsSync(filePath) && canReadJsonFile(filePath)) {
    console.warn(`[phase28] WARN existing file kept due to locked write target: ${filePath}`)
    return false
  }
  throw lastError
}

function loadBattingWeekRows(
  periodDir: string,
  weekKey: string,
  onlyYahooIds?: readonly string[]
): Array<{ yahooId: string; row: SeasonStatsRow }> {
  if (!existsSync(periodDir)) return []
  const out: Array<{ yahooId: string; row: SeasonStatsRow }> = []
  const targetIds = onlyYahooIds?.length
    ? [...new Set(onlyYahooIds.map((v) => String(v).trim()).filter(Boolean))].sort()
    : null
  const files = targetIds
    ? targetIds.map((yahooId) => `yahoo_${yahooId}.json`)
    : readdirSync(periodDir).filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
  for (const f of files) {
    const yahooId = f.slice("yahoo_".length, -".json".length)
    try {
      const raw = JSON.parse(readFileSync(join(periodDir, f), "utf8")) as PeriodBattingFile
      const row = (raw.rows ?? []).find(
        (r) => r.split_type === "calendar_week" && r.split_value === weekKey && (r.pa ?? 0) > 0
      )
      if (row) out.push({ yahooId, row })
    } catch {
      // skip corrupt file
    }
  }
  return out
}

function loadPitchingWeekRows(
  periodDir: string,
  weekKey: string,
  onlyNpbIds?: readonly string[]
): Array<{ npbId: string; row: PitcherSeasonPitchingPeriodRow }> {
  if (!existsSync(periodDir)) return []
  const out: Array<{ npbId: string; row: PitcherSeasonPitchingPeriodRow }> = []
  const targetIds = onlyNpbIds?.length
    ? [...new Set(onlyNpbIds.map((v) => String(v).trim()).filter(Boolean))].sort()
    : null
  const files = targetIds
    ? targetIds.map((npbId) => `npb_${npbId}.json`)
    : readdirSync(periodDir).filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
  for (const f of files) {
    const npbId = f.slice("npb_".length, -".json".length)
    try {
      const raw = JSON.parse(readFileSync(join(periodDir, f), "utf8")) as PeriodPitchingFile
      const row = (raw.rows ?? []).find(
        (r) => r.split_type === "calendar_week" && r.split_value === weekKey
      )
      if (row && (row.ipOuts > 0 || row.bf > 0)) out.push({ npbId, row })
    } catch {
      // skip
    }
  }
  return out
}

function readRankingRows(filePath: string): Record<string, unknown>[] | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown
    return Array.isArray(raw) ? raw.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : null
  } catch {
    return null
  }
}

function metaForPitcher(yahooId: string, npbId: string, metaMap: Map<string, { name: string; team: string }>) {
  const fromYahoo = metaForRankingRow(yahooId, metaMap)
  if (fromYahoo.name !== yahooId && fromYahoo.team) return fromYahoo
  const roster = findRosterPlayerByPublicId(npbId)
  if (roster) {
    return {
      name: roster.name_ja.trim() || fromYahoo.name,
      team: rosterTeamToRankingShort(roster.team) || fromYahoo.team,
    }
  }
  return metaForRankingRow(yahooId, metaMap)
}

export function buildWeeklyRankingsFromPeriod(
  projectRoot: string,
  options: BuildWeeklyRankingsOptions
): BuildWeeklyRankingsResult {
  const { year } = options
  const anchor = options.anchorYmd ?? todayYmdJst()
  const affectedYahooIds =
    options.affectedYahooIds && options.affectedYahooIds.length > 0
      ? [...new Set(options.affectedYahooIds.map((v) => String(v).trim()).filter(Boolean))]
      : null
  const affectedNpbIds =
    options.affectedNpbIds && options.affectedNpbIds.length > 0
      ? [...new Set(options.affectedNpbIds.map((v) => String(v).trim()).filter(Boolean))]
      : null
  const affectedYahooIdSet = affectedYahooIds ? new Set(affectedYahooIds) : null
  const affectedPitcherYahooIdSet = affectedNpbIds
    ? new Set(
        affectedNpbIds
          .map((npbId) => resolveYahooPilotIdForStats(npbId))
          .map((yahooId) => String(yahooId ?? "").trim())
          .filter(Boolean)
      )
    : null
  const weekKeys =
    options.weekKeys && options.weekKeys.length > 0
      ? options.weekKeys
      : weekKeysToBuild(anchor, WEEKLY_RANKINGS_WEEKS_TO_KEEP)

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  const metaMap = docs.length > 0 ? yahooMetaFromCanonical(docs) : new Map()

  const battingPeriodDir = join(projectRoot, "_data", "derived", "player_season_batting_period", year)
  const pitchingPeriodDir = join(projectRoot, "_data", "derived", "player_season_pitching_period", year)
  const metricsBat = loadMetricsFromRecord()
  const metricsPitch = loadMetricsFromRecordPitching()
  const romanCL = getRomanNameMap(year, "CL")
  const romanPL = getRomanNameMap(year, "PL")

  let battingFiles = 0
  let pitchingFiles = 0
  let excludedBatters = 0
  let excludedPitchers = 0
  let skippedPitchersNoYahoo = 0

  const calendarWeekKey = weekKeys[0]

  for (const weekKey of weekKeys) {
    const weekLabel = weekLabelForKey(weekKey)
    const weekTeamGames =
      docs.length > 0 ? aggregateWeeklyTeamGamesFromCanonical(docs, year, weekKey) : { CL: {}, PL: {} }
    writeWeeklyTeamGamesFromAggregate(projectRoot, year, weekKey, weekTeamGames)

    const batters = loadBattingWeekRows(battingPeriodDir, weekKey, affectedYahooIds)
    const byLeagueBat: Record<"CL" | "PL", Array<{ yahooId: string; row: SeasonStatsRow }>> = {
      CL: [],
      PL: [],
    }
    for (const b of batters) {
      const meta = metaForRankingRow(b.yahooId, metaMap)
      const bucket = resolveBattingRankingLeagueBucket(b.yahooId, meta)
      if (bucket === "CL") byLeagueBat.CL.push(b)
      else if (bucket === "PL") byLeagueBat.PL.push(b)
      else excludedBatters += 1
    }

    for (const lg of ["CL", "PL"] as const) {
      const outDir = join(projectRoot, "public", "data", "rankings", "weekly", year, weekKey, lg)
      mkdirSync(outDir, { recursive: true })
      const list = byLeagueBat[lg]
      const romanMap = lg === "CL" ? romanCL : romanPL
      const incremental = Boolean(affectedYahooIdSet && affectedYahooIdSet.size > 0)
      const affectedRowsBase = list.map(({ yahooId, row }) => {
        const meta = metaForRankingRow(yahooId, metaMap)
        const roman = resolveRomanNameForRanking(yahooId, meta.name, meta.team, romanMap)
        return buildBattingRankingRowBase(yahooId, row, meta, roman)
      })

      for (const m of metricsBat) {
        const metricKey = getJsonKey(m.label)
        const rows = affectedRowsBase.map((base) => {
          const row = { ...base }
          row.metric = m.label
          return row
        })
        const fileBase = sanitizeMetricForPath(m.label)
        const publicPath = join(outDir, `${fileBase}.json`)
        const allPath = join(outDir, `${fileBase}_all.json`)
        const seedRows =
          incremental
            ? (() => {
                const existingAll = readRankingRows(allPath)
                if (!existingAll) return rows
                return [
                  ...existingAll.filter((row) => !affectedYahooIdSet?.has(String(row.playerId ?? "").trim())),
                  ...rows,
                ]
              })()
            : rows
        const sorted = [...seedRows].sort(
          (a, b) => sortValueForBattingMetricKey(metricKey, b) - sortValueForBattingMetricKey(metricKey, a)
        )
        const teamGames = weekTeamGames[lg]
        const filtered = filterBattingRowsForQualifyingAtBuild(sorted, metricKey, year, lg, teamGames)
        const allRanked = assignRanks(sorted)
        const ranked = assignRanks(filtered)
        writeJsonFileWithRetry(publicPath, ranked)
        writeJsonFileWithRetry(allPath, allRanked, {
          allowExistingFallback: true,
        })
        battingFiles += 2
      }
    }

    const pitchers = loadPitchingWeekRows(pitchingPeriodDir, weekKey, affectedNpbIds)
    const byLeaguePitch: Record<
      "CL" | "PL",
      Array<{ yahooId: string; npbId: string; row: PitcherSeasonPitchingPeriodRow }>
    > = { CL: [], PL: [] }

    for (const { npbId, row } of pitchers) {
      const yahooId = resolveYahooPilotIdForStats(npbId)
      if (!yahooId) {
        skippedPitchersNoYahoo += 1
        continue
      }
      const meta = metaForPitcher(yahooId, npbId, metaMap)
      const bucket = resolvePitchingRankingLeagueBucket(yahooId, meta)
      if (bucket === "CL") byLeaguePitch.CL.push({ yahooId, npbId, row })
      else if (bucket === "PL") byLeaguePitch.PL.push({ yahooId, npbId, row })
      else excludedPitchers += 1
    }

    for (const lg of ["CL", "PL"] as const) {
      const outDir = join(
        projectRoot,
        "public",
        "data",
        "rankings",
        "pitching",
        "weekly",
        year,
        weekKey,
        lg
      )
      mkdirSync(outDir, { recursive: true })
      const list = byLeaguePitch[lg]
      const romanMap = lg === "CL" ? romanCL : romanPL
      const incremental = Boolean(affectedPitcherYahooIdSet && affectedPitcherYahooIdSet.size > 0)
      const affectedRowsBase = list.map(({ yahooId, npbId, row }) => {
        const meta = metaForPitcher(yahooId, npbId, metaMap)
        const roman = resolveRomanNameForRanking(yahooId, meta.name, meta.team, romanMap)
        return buildPitchingRankingRowFromPeriodRow(yahooId, row, meta, roman)
      })

      for (const m of metricsPitch) {
        const metricKey = getPitchingJsonKey(m.label)
        const asc = pitchingMetricSortAsc(metricKey)
        const rows = affectedRowsBase.map((base) => {
          const row = { ...base }
          row.metric = m.label
          return row
        })
        const fileBase = sanitizeMetricForPath(m.label)
        const publicPath = join(outDir, `${fileBase}.json`)
        const allPath = join(outDir, `${fileBase}_all.json`)
        const seedRows =
          incremental
            ? (() => {
                const existingAll = readRankingRows(allPath)
                if (!existingAll) return rows
                return [
                  ...existingAll.filter((row) => !affectedPitcherYahooIdSet?.has(String(row.playerId ?? "").trim())),
                  ...rows,
                ]
              })()
            : rows
        const sorted = [...seedRows].sort((a, b) => {
          const av = sortValueForPitchingMetricKey(metricKey, a)
          const bv = sortValueForPitchingMetricKey(metricKey, b)
          return asc ? av - bv : bv - av
        })
        const teamGames = weekTeamGames[lg]
        const filtered = filterPitchingRowsForQualifyingAtBuild(sorted, metricKey, year, teamGames)
        const allRanked = assignRanks(sorted)
        const ranked = assignRanks(filtered)
        writeJsonFileWithRetry(publicPath, ranked)
        writeJsonFileWithRetry(allPath, allRanked, {
          allowExistingFallback: true,
        })
        pitchingFiles += 2
      }
    }

    console.log(
      `[phase28] ${weekKey} (${weekLabel}): batting CL=${byLeagueBat.CL.length} PL=${byLeagueBat.PL.length}, pitching CL=${byLeaguePitch.CL.length} PL=${byLeaguePitch.PL.length}, team-games CL=${JSON.stringify(weekTeamGames.CL)} PL=${JSON.stringify(weekTeamGames.PL)}`
    )
  }

  if (calendarWeekKey) {
    writeWeeklyCurrentWeekJson(projectRoot, year, calendarWeekKey, weekKeys)
  }

  return {
    weekKeys,
    battingFiles,
    pitchingFiles,
    excludedBatters,
    excludedPitchers,
    skippedPitchersNoYahoo,
  }
}
