/**
 * Phase 19（投手ランキング）と phase_pitcher_poc1 のコア指標を同一式に固定する。
 * 入力は canonicalPitchingSeasonAgg の PitchingSeasonAggYahoo のみ。
 */

import type { PitchingSeasonAggYahoo } from "./canonicalPitchingSeasonAgg"

/** scripts/phase19_build_pitching_rankings_from_canonical.ts の buildPitchingRow と同じ計算（選手メタ・metric 以外） */
export function pitchingSeasonRowStatsFromAgg(agg: PitchingSeasonAggYahoo): Record<string, unknown> {
  const outs = agg.ipOuts
  const ipDec = outs / 3
  const bf = agg.bf
  const era = outs > 0 ? (agg.er * 27) / outs : 0
  const whip = ipDec > 0 ? (agg.bb + agg.h) / ipDec : 0
  const kPct = bf > 0 ? (agg.so / bf) * 100 : 0
  const bbPct = bf > 0 ? (agg.bb / bf) * 100 : 0
  const kBbPct = bf > 0 ? ((agg.so - agg.bb) / bf) * 100 : 0
  const wpct = agg.w + agg.l > 0 ? agg.w / (agg.w + agg.l) : 0
  const pIp = ipDec > 0 ? agg.np / ipDec : 0
  const abEst = Math.max(0, bf - agg.bb - agg.hbp)
  const avgAgainst = abEst > 0 ? agg.h / abEst : 0
  const obpAgainst = bf > 0 ? (agg.h + agg.bb + agg.hbp) / bf : 0
  const tbEst = agg.h + agg.hr * 3
  const slgAgainst = abEst > 0 ? tbEst / abEst : 0
  const babipDenom = bf - agg.bb - agg.hbp - agg.so - agg.hr
  const babipAgainst = babipDenom > 0 ? (agg.h - agg.hr) / babipDenom : 0

  const gs = agg.gamesStarted
  const qsRate = gs > 0 ? (agg.qsStarts / gs) * 100 : 0
  const hqsRate = gs > 0 ? (agg.hqsStarts / gs) * 100 : 0
  const sqsRate = gs > 0 ? (agg.sqsStarts / gs) * 100 : 0

  return {
    era,
    k_bb_pct: kBbPct,
    w: agg.w,
    l: agg.l,
    hld: agg.hld,
    sv: agg.sv,
    hp: 0,
    g: agg.gameIds.size,
    gs,
    cg: agg.completeGames,
    sho: agg.shutouts,
    wpct,
    ip: ipDec,
    bf,
    np: agg.np,
    p_ip: pIp,
    ha: agg.h,
    hra: agg.hr,
    so: agg.so,
    bb: agg.bb,
    whip,
    k_pct: kPct,
    bb_pct: bbPct,
    qs_rate: qsRate,
    hqs_rate: hqsRate,
    sqs_rate: sqsRate,
    avg_against: avgAgainst,
    babip_against: babipAgainst,
    obp_against: obpAgainst,
    slg_against: slgAgainst,
  }
}
