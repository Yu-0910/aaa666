/**
 * Phase 12 / Phase 28 共通: SeasonStatsRow → ランキング JSON 1 行（指標列は metric.key で参照）
 */

import type { SeasonStatsRow } from "@/lib/seasonStatsPilot"

function numFromSlash(s: string): number {
  const v = String(s ?? "").trim()
  if (!v) return 0
  const n = parseFloat(v.startsWith(".") ? `0${v}` : v)
  return Number.isFinite(n) ? n : 0
}

function numFromLoose(s: string): number {
  const v = String(s ?? "").trim()
  if (!v) return 0
  const n = parseFloat(v.replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function computeObpFromCounts(h: number, bb: number, hbp: number, ab: number, sf: number): number | null {
  const den = ab + bb + hbp + sf
  if (den <= 0) return null
  return (h + bb + hbp) / den
}

function computeSlgFromCounts(tb: number, ab: number): number | null {
  if (ab <= 0) return null
  return tb / ab
}

function computeNoiFromCounts(
  h: number,
  bb: number,
  hbp: number,
  ab: number,
  sf: number,
  tb: number
): number | null {
  const obp = computeObpFromCounts(h, bb, hbp, ab, sf)
  const slg = computeSlgFromCounts(tb, ab)
  if (obp == null || slg == null) return null
  return (obp + slg / 3) * 1000
}

export function buildBattingRankingRowBase(
  yahooId: string,
  sr: SeasonStatsRow,
  meta: { name: string; team: string },
  romanName?: string
): Record<string, unknown> {
  const name = meta.name.trim() || yahooId
  const team = meta.team.trim()
  const obpRaw = computeObpFromCounts(sr.h, sr.bb, sr.hbp, sr.ab, sr.sf)
  const slgRaw = computeSlgFromCounts(sr.tb, sr.ab)
  const noiRaw = computeNoiFromCounts(sr.h, sr.bb, sr.hbp, sr.ab, sr.sf, sr.tb)
  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: "OPS",
    age: 0,
    ops: numFromSlash(sr.ops),
    avg: numFromSlash(sr.avg),
    hits: sr.h,
    hr: sr.hr,
    rbi: sr.rbi,
    games: sr.g,
    pa: sr.pa,
    ab: sr.ab,
    singles: sr.h1,
    doubles: sr.h2,
    triples: sr.h3,
    runs: sr.r,
    obp: obpRaw,
    slg: slgRaw,
    bb: sr.bb,
    ibb: sr.ibb,
    hbp: sr.hbp,
    so: sr.so,
    tb: sr.tb,
    sb: sr.sb,
    cs: sr.cs,
    e: sr.e,
    sh: sr.sh,
    sf: sr.sf,
    gidp: sr.gidp,
    isop: numFromSlash(sr.isop),
    isod: numFromSlash(sr.isod),
    bbPct: numFromSlash(sr.bb_pct),
    kPct: numFromSlash(sr.k_pct),
    bbk: numFromLoose(sr.bbk),
    rc: numFromLoose(sr.rc),
    xr: numFromLoose(sr.xr),
    babip: numFromSlash(sr.babip),
    seca: numFromLoose(sr.seca),
    ta: numFromLoose(sr.ta),
    noi: noiRaw,
    gpa: numFromLoose(sr.gpa),
  }
  if (romanName) base.romanName = romanName
  return base
}

export function sortValueForBattingMetricKey(metricKey: string, row: Record<string, unknown>): number {
  const v = row[metricKey]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
