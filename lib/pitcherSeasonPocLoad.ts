/**
 * Phase 1 派生: `_data/derived/player_season_pitching_poc/{year}/npb_{id}.json` を読む（サーバー専用）
 */

import fs from "fs"
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
import { loadCanonicalGameDocument } from "./yahooGame/loadCanonicalGame"

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

function nf3MetricsPath(projectRoot: string, year: string): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  return path.join(
    projectRoot,
    "_data",
    "derived",
    "pitcher_nf3_metrics",
    safeYear,
    "aggregate_by_npb.json"
  )
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
  const p = nf3MetricsPath(projectRoot, year)
  if (!fs.existsSync(p)) return payload
  try {
    const raw = fs.readFileSync(p, "utf8")
    const j = JSON.parse(raw) as {
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
    const row = j.byNpbPlayerId?.[npbPlayerId]
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
  } catch {
    return payload
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

function needsQualityStartMergeFromCanonical(b: PitcherSeasonPocPayload["basic"]): boolean {
  return (
    b.qsRate == null ||
    b.hqsRate == null ||
    b.sqsRate == null ||
    b.qsCount == null ||
    b.hqsCount == null ||
    b.sqsCount == null
  )
}

/**
 * 旧派生 JSON（QS/HQS/SQS 率・回数未収録）向けに canonical から先発ベースの QS 系を補完する。
 * canonical が読めない本番 API では、JSON に載っている回数から率だけ算出する。
 */
function mergeQualityStartFromCanonical(
  payload: PitcherSeasonPocPayload,
  projectRoot: string
): PitcherSeasonPocPayload {
  const b = payload.basic
  if (!needsQualityStartMergeFromCanonical(b)) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const gameIds = payload.source?.canonicalGames ?? []
  if (gameIds.length === 0 || payload.yahooPitcherIds.length === 0) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const docs = []
  for (const gid of gameIds) {
    const doc = loadCanonicalGameDocument(projectRoot, gid)
    if (doc) docs.push(doc)
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
  const gs = core.gamesStarted
  if (gs <= 0) {
    return { ...payload, basic: qualityStartRatesFromCounts(b) }
  }

  const gamesStarted = b.gamesStarted ?? gs
  const qsCount = b.qsCount ?? core.qsStarts
  const hqsCount = b.hqsCount ?? core.hqsStarts
  const sqsCount = b.sqsCount ?? core.sqsStarts
  const denom = gamesStarted > 0 ? gamesStarted : gs

  const mergedBasic: PitcherSeasonPocPayload["basic"] = {
    ...b,
    gamesStarted: b.gamesStarted ?? gs,
    gamesInRelief: b.gamesInRelief ?? core.gamesInRelief,
    qsCount,
    hqsCount,
    sqsCount,
    qsRate: b.qsRate ?? qsCount / denom,
    hqsRate: b.hqsRate ?? hqsCount / denom,
    sqsRate: b.sqsRate ?? sqsCount / denom,
  }

  return { ...payload, basic: qualityStartRatesFromCounts(mergedBasic) }
}

function enrichPitcherSeasonPocPayload(
  payload: PitcherSeasonPocPayload,
  projectRoot: string,
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload {
  const withQualityStart = mergeQualityStartFromCanonical(payload, projectRoot)
  return mergeNf3MetricsFromAggregate(withQualityStart, projectRoot, year, npbPlayerId)
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
  if (direct) return enrichPitcherSeasonPocPayload(direct, root, year, npbPlayerId)
  const altNpb = PILOT_DERIVED_FALLBACK_NPB[npbPlayerId]
  if (!altNpb) return null
  const base = await loadPitcherSeasonPocPayloadAsync(year, altNpb)
  if (!base) return null
  const shelled = withPilotPitcherPocFallbackShell(base, npbPlayerId)
  return enrichPitcherSeasonPocPayload(shelled, root, year, npbPlayerId)
}
