/**
 * Phase 7 週間行 → 投手ランキング JSON 1 行（Phase 28）
 * 勝利・セーブ等は週次 JSON に無いため 0（週間は登板実績ベース指標が主）
 */

import type { PitcherSeasonPitchingPeriodRow } from "@/lib/pitcherSeasonPocTypes"

export function buildPitchingRankingRowFromPeriodRow(
  yahooId: string,
  row: PitcherSeasonPitchingPeriodRow,
  meta: { name: string; team: string },
  romanName?: string
): Record<string, unknown> {
  const name = meta.name.trim() || yahooId
  const team = meta.team.trim()
  const bf = row.bf
  const ipDec = row.ipOuts / 3
  const kPct = bf > 0 ? (row.so / bf) * 100 : 0
  const bbPct = bf > 0 ? (row.bb / bf) * 100 : 0
  const kBbPct = bf > 0 ? ((row.so - row.bb) / bf) * 100 : 0
  const abEst = Math.max(0, bf - row.bb - row.hbp)
  const avgAgainst = abEst > 0 ? row.h / abEst : 0

  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: "防御率",
    era: row.era ?? 0,
    whip: row.whip ?? 0,
    k_bb_pct: kBbPct,
    w: 0,
    l: 0,
    hld: 0,
    sv: 0,
    hp: 0,
    g: row.g,
    gs: 0,
    cg: 0,
    sho: 0,
    wpct: 0,
    ip: ipDec,
    bf,
    np: row.pitches,
    p_ip: ipDec > 0 ? row.pitches / ipDec : 0,
    ha: row.h,
    hra: row.hr,
    so: row.so,
    bb: row.bb,
    k_pct: kPct,
    bb_pct: bbPct,
    qs_rate: 0,
    hqs_rate: 0,
    sqs_rate: 0,
    avg_against: avgAgainst,
    babip_against: 0,
    obp_against: bf > 0 ? (row.h + row.bb + row.hbp) / bf : 0,
    slg_against: 0,
  }
  if (romanName) base.romanName = romanName
  return base
}

const LOWER_BETTER = new Set([
  "era",
  "whip",
  "avg_against",
  "babip_against",
  "obp_against",
  "slg_against",
  "p_ip",
  "bb_pct",
])

export function pitchingMetricSortAsc(metricKey: string): boolean {
  if (metricKey === "bb_pct") return true
  return LOWER_BETTER.has(metricKey)
}

export function sortValueForPitchingMetricKey(metricKey: string, row: Record<string, unknown>): number {
  const v = row[metricKey]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
