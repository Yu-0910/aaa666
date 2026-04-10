/**
 * Phase 1 派生: `_data/derived/player_season_pitching_poc/{year}/npb_{id}.json` を読む（サーバー専用）
 */

import fs from "fs"
import path from "path"
import type { PitcherSeasonPocPayload } from "./pitcherSeasonPocTypes"
import {
  PILOT_DERIVED_FALLBACK_NPB,
  withPilotPitcherPocFallbackShell,
} from "./pitcherSeasonPocPilotFallback"
import { nf3IprFromReliefIpRuns } from "./nf3LeaguePitchingFallback"
import { getProjectRoot } from "./projectRoot"

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
  const p = pitcherSeasonPocFilePath(projectRoot, year, npbPlayerId)
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, "utf8")
    const j = JSON.parse(raw) as PitcherSeasonPocPayload
    if (j?.schemaVersion !== "phase-pitcher-poc-season-v1" || !j.npbPlayerId) return null
    return j
  } catch {
    return null
  }
}

/** `getProjectRoot()` を使う短縮形（API ルートと同じルート解決） */
export function loadPitcherSeasonPocPayloadFromRepo(
  year: string,
  npbPlayerId: string
): PitcherSeasonPocPayload | null {
  const root = getProjectRoot()
  const direct = loadPitcherSeasonPocPayload(root, year, npbPlayerId)
  if (direct) return mergeNf3MetricsFromAggregate(direct, root, year, npbPlayerId)
  const altNpb = PILOT_DERIVED_FALLBACK_NPB[npbPlayerId]
  if (!altNpb) return null
  const base = loadPitcherSeasonPocPayload(root, year, altNpb)
  if (!base) return null
  const shelled = withPilotPitcherPocFallbackShell(base, npbPlayerId)
  return mergeNf3MetricsFromAggregate(shelled, root, year, npbPlayerId)
}
