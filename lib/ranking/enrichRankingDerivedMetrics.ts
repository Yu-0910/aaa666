import { calculateRCNf3 } from "@/lib/rc"

function finiteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "")
    if (!normalized || normalized === "—" || normalized === "-") return 0
    const n = Number.parseFloat(normalized.startsWith(".") ? `0${normalized}` : normalized)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function maybeRate(n: number | null): number {
  return n != null && Number.isFinite(n) ? n : 0
}

export function enrichBattingRankingDerivedMetrics<T extends Record<string, unknown>>(row: T): T {
  const pa = finiteNumber(row.pa)
  const ab = finiteNumber(row.ab)
  const h = finiteNumber(row.hits ?? row.h)
  const doubles = finiteNumber(row.doubles)
  const triples = finiteNumber(row.triples)
  const hr = finiteNumber(row.hr)
  const tb = finiteNumber(row.tb) || Math.max(0, h + doubles + triples * 2 + hr * 3)
  const bb = finiteNumber(row.bb)
  const ibb = finiteNumber(row.ibb)
  const hbp = finiteNumber(row.hbp)
  const so = finiteNumber(row.so)
  const sb = finiteNumber(row.sb)
  const cs = finiteNumber(row.cs)
  const sh = finiteNumber(row.sh)
  const sf = finiteNumber(row.sf)
  const gidp = finiteNumber(row.gidp)

  if (pa <= 0 && ab <= 0) return row

  const avg = ab > 0 ? h / ab : null
  const obpDen = ab + bb + hbp + sf
  const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null
  const slg = ab > 0 ? tb / ab : null
  const babipDen = ab - so - hr + sf
  const babip = babipDen > 0 ? (h - hr) / babipDen : null
  const bbk = so > 0 ? bb / so : null
  const gpa = obp != null && slg != null ? (1.8 * obp + slg) / 4 : null
  const rc = calculateRCNf3({ h, bb, hbp, cs, gidp, tb, sf, sh, sb, so, ab })
  const singles = Math.max(0, h - doubles - triples - hr)
  const inPlayOuts = ab - h - so
  const xr =
    0.5 * singles +
    0.72 * doubles +
    1.04 * triples +
    1.44 * hr +
    0.34 * (bb + hbp - ibb) +
    0.25 * ibb +
    0.18 * sb -
    0.32 * cs -
    0.09 * inPlayOuts -
    0.098 * so -
    0.37 * gidp +
    0.37 * sf +
    0.04 * sh
  const seca = ab > 0 ? (bb + (tb - h) + (sb - cs)) / ab : null
  const taDen = ab - h + cs + gidp
  const ta = taDen > 0 ? (tb + bb + hbp + sb - cs) / taDen : null
  const noi = obp != null && slg != null ? (obp + slg / 3) * 1000 : null

  return {
    ...row,
    avg: maybeRate(avg),
    obp: maybeRate(obp),
    slg: maybeRate(slg),
    ops: maybeRate(obp) + maybeRate(slg),
    isop: avg != null && slg != null ? slg - avg : 0,
    isod: avg != null && obp != null ? obp - avg : 0,
    bbPct: pa > 0 ? (bb / pa) * 100 : 0,
    kPct: pa > 0 ? (so / pa) * 100 : 0,
    bbk: maybeRate(bbk),
    rc: maybeRate(rc),
    xr: Number.isFinite(xr) ? xr : 0,
    babip: maybeRate(babip),
    seca: maybeRate(seca),
    ta: maybeRate(ta),
    noi: maybeRate(noi),
    gpa: maybeRate(gpa),
  }
}

export function enrichPitchingRankingDerivedMetrics<T extends Record<string, unknown>>(row: T): T {
  const bf = finiteNumber(row.bf)
  const h = finiteNumber(row.ha ?? row.h)
  const hr = finiteNumber(row.hra ?? row.hr)
  const so = finiteNumber(row.so)
  const bb = finiteNumber(row.bb)
  const hbp = finiteNumber(row.hbp)
  const abEst = Math.max(0, bf - bb - hbp)

  if (bf <= 0 && abEst <= 0) return row

  const tbEst = h + hr * 3
  const babipDen = bf - bb - hbp - so - hr

  return {
    ...row,
    k_pct: bf > 0 ? (so / bf) * 100 : 0,
    bb_pct: bf > 0 ? (bb / bf) * 100 : 0,
    k_bb_pct: bf > 0 ? ((so - bb) / bf) * 100 : 0,
    avg_against: abEst > 0 ? h / abEst : 0,
    babip_against: babipDen > 0 ? (h - hr) / babipDen : 0,
    obp_against: bf > 0 ? (h + bb + hbp) / bf : 0,
    slg_against: abEst > 0 ? tbEst / abEst : 0,
  }
}
