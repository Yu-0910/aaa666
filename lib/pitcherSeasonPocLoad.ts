/**
 * Phase 1 派生: `_data/derived/player_season_pitching_poc/{year}/npb_{id}.json` を読む（サーバー専用）
 */

import path from "path"
import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from "@/lib/derived/fetchDerivedJsonServer"
import type { PitcherSeasonPocPayload } from "./pitcherSeasonPocTypes"
import {
  PILOT_DERIVED_FALLBACK_NPB,
  withPilotPitcherPocFallbackShell,
} from "./pitcherSeasonPocPilotFallback"
import { nf3IprFromReliefIpRuns } from "./nf3LeaguePitchingFallback"
import { getProjectRoot } from "./projectRoot"
import {
  aggregatePitchingSeasonByYahooPlayer,
  sumPitchingSeasonAggYahoo,
  type PitchingSeasonAggYahoo,
} from "./yahooGame/canonicalPitchingSeasonAgg"
import { parseGameDateYmdFromCanonical } from "./yahooGame/gameDateFromCanonical"
import { loadCanonicalGameDocument } from "./yahooGame/loadCanonicalGame"
import { isRegularSeasonCanonicalGame } from "./npbRegularSeason"

/** 援護率（nf3 近似）: (援護点合計×9)÷先発投球回 */
function nf3EnGoRateDisplay(
  starterGames: number,
  runSupportPointsSum: number,
  starterIpOutsSum: number
): string {
  if (starterGames <= 0 || starterIpOutsSum <= 0) return "—"
  const ipInnings = starterIpOutsSum / 3
  if (ipInnings <= 0) return "—"
  return ((runSupportPointsSum * 9) / ipInnings).toFixed(2)
}

type Nf3AggregatePayload = {
  byNpbPlayerId?: Record<
    string,
    {
      reliefAppearances?: number
      nhbCount?: number
      reliefIpOutsSum?: number
      reliefRunsSum?: number
      starterGames?: number
      runSupportPointsSum?: number
      starterIpOutsSum?: number
    }
  >
}

function safeYearSegment(year: string): string {
  return String(year).replace(/[^\d]/g, "") || "2026"
}

/**
 * `build_pitcher_nf3_metrics.ts` の aggregate を読み、投手 PoC に nf3 列用フィールドを付与する。
 */
function mergeNf3MetricsFromAggregate(
  payload: PitcherSeasonPocPayload,
  projectRoot: string,
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload {
  try {
    const safeYear = safeYearSegment(year)
    const j = readDerivedJsonLocalSync<Nf3AggregatePayload>(
      "pitcher_nf3_metrics",
      safeYear,
      "aggregate_by_npb.json"
    )
    return mergeNf3MetricsRow(payload, j?.byNpbPlayerId?.[npbPlayerId])
  } catch {
    return payload
  }
}

function mergeNf3MetricsRow(
  payload: PitcherSeasonPocPayload,
  row: NonNullable<Nf3AggregatePayload["byNpbPlayerId"]>[string] | undefined
): PitcherSeasonPocPayload {
  if (!row) return payload

  const reliefAppearances = Number(row.reliefAppearances ?? 0)
  const nhbCount = Number(row.nhbCount ?? 0)
  const reliefIpOutsSum = Number(row.reliefIpOutsSum ?? 0)
  const reliefRunsSum = Number(row.reliefRunsSum ?? 0)
  const starterGames = Number(row.starterGames ?? 0)
  const runSupportPointsSum = Number(row.runSupportPointsSum ?? 0)
  const starterIpOutsSum = Number(row.starterIpOutsSum ?? 0)
  const nhbPct =
    reliefAppearances > 0
      ? `${((nhbCount / reliefAppearances) * 100).toFixed(1)}%`
      : "—"
  const ipr = nf3IprFromReliefIpRuns(reliefIpOutsSum, reliefRunsSum)
  const enGoRate = nf3EnGoRateDisplay(
    starterGames,
    runSupportPointsSum,
    starterIpOutsSum
  )

  return {
    ...payload,
    nf3Metrics: {
      reliefAppearances,
      nhbCount,
      reliefIpOutsSum,
      reliefRunsSum,
      nhbPct,
      ipr,
      enGoRate,
    },
  }
}

function qualityStartRatesFromCounts(
  b: PitcherSeasonPocPayload["basic"]
): PitcherSeasonPocPayload["basic"] {
  const gs = b.gamesStarted ?? 0
  if (gs <= 0) return b
  const qsCount = b.qsCount ?? 0
  const hqsCount = b.hqsCount ?? 0
  const sqsCount = b.sqsCount ?? 0
  return {
    ...b,
    qsCount,
    hqsCount,
    sqsCount,
    qsRate: b.qsRate ?? qsCount / gs,
    hqsRate: b.hqsRate ?? hqsCount / gs,
    sqsRate: b.sqsRate ?? sqsCount / gs,
  }
}

/**
 * 旧派生 JSON や stale な派生 JSON 向けに、canonical からシーズン基幹カウントを補完する。
 * 勝敗・先発/救援・S/H・完投/完封・QS 系は canonical を正として上書きする。
 * canonical が読めない本番 API では、JSON に載っている回数から率だけ算出する。
 */
function mergeSeasonCoreCountsFromCanonical(
  payload: PitcherSeasonPocPayload,
  projectRoot: string
): PitcherSeasonPocPayload {
  const b = payload.basic
  const gameIds = payload.source?.canonicalGames ?? []
  if (gameIds.length === 0 || payload.yahooPitcherIds.length === 0) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const docs = []
  for (const gid of gameIds) {
    const doc = loadCanonicalGameDocument(projectRoot, gid)
    if (!doc) continue
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd) continue
    if (!isRegularSeasonCanonicalGame(payload.seasonYear, ymd, doc.game?.meta?.documentTitle)) {
      continue
    }
    docs.push(doc)
  }
  if (docs.length === 0) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const seasonMap = aggregatePitchingSeasonByYahooPlayer(docs)
  const aggs: PitchingSeasonAggYahoo[] = []
  for (const yid of payload.yahooPitcherIds) {
    const agg = seasonMap.get(yid)?.agg
    if (agg) aggs.push(agg)
  }
  if (aggs.length === 0) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const core = sumPitchingSeasonAggYahoo(aggs)
  const gamesStarted = core.gamesStarted
  const qsCount = core.qsStarts
  const hqsCount = core.hqsStarts
  const sqsCount = core.sqsStarts
  const denom = gamesStarted > 0 ? gamesStarted : 0

  const mergedBasic: PitcherSeasonPocPayload["basic"] = {
    ...b,
    gamesAppeared: core.gameIds.size,
    gamesStarted,
    gamesInRelief: core.gamesInRelief,
    holds: core.hld,
    completeGames: core.completeGames,
    shutouts: core.shutouts,
    winCount: core.w,
    lossCount: core.l,
    saveCount: core.sv,
    qsCount,
    hqsCount,
    sqsCount,
    qsRate: denom > 0 ? qsCount / denom : null,
    hqsRate: denom > 0 ? hqsCount / denom : null,
    sqsRate: denom > 0 ? sqsCount / denom : null,
  }

  return { ...payload, basic: qualityStartRatesFromCounts(mergedBasic) }
}

function enrichPitcherSeasonPocPayload(
  payload: PitcherSeasonPocPayload,
  projectRoot: string,
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload {
  const withCoreCounts = mergeSeasonCoreCountsFromCanonical(payload, projectRoot)
  return mergeNf3MetricsFromAggregate(withCoreCounts, projectRoot, year, npbPlayerId)
}

async function enrichPitcherSeasonPocPayloadAsync(
  payload: PitcherSeasonPocPayload,
  projectRoot: string,
  year: string,
  npbPlayerId: string
): Promise<PitcherSeasonPocPayload> {
  const withCoreCounts = mergeSeasonCoreCountsFromCanonical(payload, projectRoot)
  const safeYear = safeYearSegment(year)
  const aggregate = await fetchDerivedJsonServer<Nf3AggregatePayload>(
    "pitcher_nf3_metrics",
    safeYear,
    "aggregate_by_npb.json"
  )
  return mergeNf3MetricsRow(withCoreCounts, aggregate?.byNpbPlayerId?.[npbPlayerId])
}

export function pitcherSeasonPocFilePath(
  projectRoot: string,
  year: string,
  npbPlayerId: string
): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, "")
  return path.join(
    projectRoot,
    "_data",
    "derived",
    "player_season_pitching_poc",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadPitcherSeasonPocPayload(
  projectRoot: string,
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload | null {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, "")
  const j = readDerivedJsonLocalSync<PitcherSeasonPocPayload>(
    "player_season_pitching_poc",
    safeYear,
    `npb_${safeNpb}.json`
  )
  if (j?.schemaVersion !== "phase-pitcher-poc-season-v1" || !j.npbPlayerId) return null
  return j
}

async function loadPitcherSeasonPocPayloadAsync(
  year: string,
  npbPlayerId: string
): Promise<PitcherSeasonPocPayload | null> {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, "")
  const j = await fetchDerivedJsonServer<PitcherSeasonPocPayload>(
    "player_season_pitching_poc",
    safeYear,
    `npb_${safeNpb}.json`
  )
  if (j?.schemaVersion !== "phase-pitcher-poc-season-v1" || !j.npbPlayerId) return null
  return j
}

/** `getProjectRoot()` を使う短縮形（API ルートと同じルート解決） */
export function loadPitcherSeasonPocPayloadFromRepo(
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload | null {
  const root = getProjectRoot()
  const direct = loadPitcherSeasonPocPayload(root, year, npbPlayerId)
  if (direct) return enrichPitcherSeasonPocPayload(direct, root, year, npbPlayerId)
  const altNpb = PILOT_DERIVED_FALLBACK_NPB[npbPlayerId]
  if (!altNpb) return null
  const base = loadPitcherSeasonPocPayload(root, year, altNpb)
  if (!base) return null
  const shelled = withPilotPitcherPocFallbackShell(base, npbPlayerId)
  return enrichPitcherSeasonPocPayload(shelled, root, year, npbPlayerId)
}

export async function loadPitcherSeasonPocPayloadFromRepoAsync(
  year: string,
  npbPlayerId: string
): Promise<PitcherSeasonPocPayload | null> {
  const root = getProjectRoot()
  const direct = await loadPitcherSeasonPocPayloadAsync(year, npbPlayerId)
  if (direct) return enrichPitcherSeasonPocPayloadAsync(direct, root, year, npbPlayerId)
  const altNpb = PILOT_DERIVED_FALLBACK_NPB[npbPlayerId]
  if (!altNpb) return null
  const base = await loadPitcherSeasonPocPayloadAsync(year, altNpb)
  if (!base) return null
  const shelled = withPilotPitcherPocFallbackShell(base, npbPlayerId)
  return enrichPitcherSeasonPocPayloadAsync(shelled, root, year, npbPlayerId)
}
