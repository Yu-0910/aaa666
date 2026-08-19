/**
 * 順位表: 合算カウントから率・順位・ゲーム差を算出（Phase 0 §5.4–5.6）
 */

import type { PitchingSeasonAggYahoo } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import type { BattingSeasonAggYahoo } from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { teamCodeFromShort } from "@/lib/standings/teamCodes"
import type { TeamStandingRow } from "@/lib/standings/types"

export type TeamPitchingSplitCounts = {
  ipOuts: number
  er: number
  bf: number
  bb: number
  so: number
  h: number
}

export type TeamRecordCounts = {
  w: number
  l: number
  t: number
  runs: number
  runs_allowed: number
}

export function emptyPitchingSplit(): TeamPitchingSplitCounts {
  return { ipOuts: 0, er: 0, bf: 0, bb: 0, so: 0, h: 0 }
}

function eraFromSplit(split: TeamPitchingSplitCounts): number | null {
  if (split.ipOuts <= 0) return null
  return (split.er * 27) / split.ipOuts
}

function pctFromCounts(w: number, l: number): number | null {
  const d = w + l
  if (d <= 0) return null
  return w / d
}

function avgAllowedFromPitching(agg: PitchingSeasonAggYahoo): number | null {
  const abEst = Math.max(0, agg.bf - agg.bb - agg.hbp)
  if (abEst <= 0) return null
  return agg.h / abEst
}

function ipDisplayFromOuts(outs: number): string | null {
  if (outs <= 0) return null
  const whole = Math.floor(outs / 3)
  const rem = outs % 3
  if (rem === 0) return String(whole)
  return `${whole} ${rem}/3`
}

export function battingMetricsFromAgg(agg: BattingSeasonAggYahoo): Pick<
  TeamStandingRow,
  | "ops"
  | "avg"
  | "hr"
  | "sb"
  | "h"
  | "singles"
  | "doubles"
  | "triples"
  | "obp"
  | "slg"
  | "risp_avg"
  | "isod"
  | "isop"
  | "bb_pct"
  | "k_pct"
> {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const obpNum = agg.h + agg.bb + agg.hbp
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? obpNum / obpDen : null
  const slg = agg.ab > 0 ? agg.tb / agg.ab : null
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const ops =
    obp != null && slg != null ? obp + slg : null
  const risp_avg = agg.risp_ab > 0 ? agg.risp_h / agg.risp_ab : null
  const bb_pct = agg.pa > 0 ? (agg.bb / agg.pa) * 100 : null
  const k_pct = agg.pa > 0 ? (agg.so / agg.pa) * 100 : null

  return {
    ops,
    avg,
    hr: agg.hr,
    sb: agg.sb,
    h: agg.h,
    singles: h1,
    doubles: agg.h2,
    triples: agg.h3,
    obp,
    slg,
    risp_avg,
    isod: obp != null && avg != null ? obp - avg : null,
    isop: slg != null && avg != null ? slg - avg : null,
    bb_pct,
    k_pct,
  }
}

export function pitchingMetricsFromAgg(
  overall: PitchingSeasonAggYahoo,
  starter: TeamPitchingSplitCounts,
  relief: TeamPitchingSplitCounts,
  options?: { qsDenominatorGames?: number },
): Pick<
  TeamStandingRow,
  | "era"
  | "era_starter"
  | "era_relief"
  | "avg_allowed"
  | "cg"
  | "bb_pct_pitch"
  | "k_pct_pitch"
  | "k_bb_pct"
  | "qs_rate"
  | "hqs_rate"
  | "ip"
  | "so"
  | "sv"
  | "hld"
  | "hp"
  | "pitches"
  | "bf"
  | "h_allowed"
  | "hr_allowed"
  | "bb_allowed"
  | "ibb_allowed"
  | "hbp_allowed"
  | "er"
  | "whip"
> {
  const bf = overall.bf
  const nonIntentionalBb = Math.max(0, overall.bb - overall.ibb)
  const bbPct = bf > 0 ? (overall.bb / bf) * 100 : null
  /** 投手 K率（K/9）= 奪三振×9÷投球回。SO/BF ではない */
  const kPct = overall.ipOuts > 0 ? (overall.so * 27) / overall.ipOuts : null
  const kBbPct = bf > 0 ? ((overall.so - overall.bb) / bf) * 100 : null
  const qsDen =
    options?.qsDenominatorGames && options.qsDenominatorGames > 0
      ? options.qsDenominatorGames
      : overall.gamesStarted
  const qsRate = qsDen > 0 ? (overall.qsStarts / qsDen) * 100 : null
  const hqsRate = qsDen > 0 ? (overall.hqsStarts / qsDen) * 100 : null

  return {
    era: eraFromSplit({ ipOuts: overall.ipOuts, er: overall.er, bf, bb: overall.bb, so: overall.so, h: overall.h }),
    era_starter: eraFromSplit(starter),
    era_relief: eraFromSplit(relief),
    avg_allowed: avgAllowedFromPitching(overall),
    cg: overall.completeGames,
    bb_pct_pitch: bbPct,
    k_pct_pitch: kPct,
    k_bb_pct: kBbPct,
    qs_rate: qsRate,
    hqs_rate: hqsRate,
    ip: ipDisplayFromOuts(overall.ipOuts),
    so: overall.so,
    sv: overall.sv,
    hld: overall.hld,
    hp: overall.hld,
    pitches: overall.np,
    bf: overall.bf,
    h_allowed: overall.h,
    hr_allowed: overall.hr,
    bb_allowed: nonIntentionalBb,
    ibb_allowed: overall.ibb,
    hbp_allowed: overall.hbp,
    er: overall.er,
    whip: overall.ipOuts > 0 ? (overall.h + nonIntentionalBb) / (overall.ipOuts / 3) : null,
  }
}

export function formatGamesBehind(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return "0"
  if (Math.abs(gb - Math.round(gb)) < 1e-9) return String(Math.round(gb))
  return gb.toFixed(1)
}

export function computeGamesBehind(
  leader: TeamRecordCounts,
  team: TeamRecordCounts,
): string {
  const raw = (leader.w - team.w + team.l - leader.l) / 2
  if (raw <= 0) return "0"
  return formatGamesBehind(raw)
}

export type StandingsRowDraft = Omit<TeamStandingRow, "rank" | "gb"> & {
  teamShort: string
}

export function assignRanksAndGamesBehind(rows: StandingsRowDraft[]): TeamStandingRow[] {
  const sorted = [...rows].sort((a, b) => {
    const pa = pctFromCounts(a.w, a.l) ?? -1
    const pb = pctFromCounts(b.w, b.l) ?? -1
    if (pb !== pa) return pb - pa
    if (b.w !== a.w) return b.w - a.w
    return teamCodeFromShort(a.teamShort).localeCompare(teamCodeFromShort(b.teamShort))
  })

  if (!sorted[0]) return []

  return sorted.map((row, idx) => {
    const pct = pctFromCounts(row.w, row.l)
    const previous = sorted[idx - 1]
    const gb =
      idx === 0
        ? "—"
        : previous
          ? computeGamesBehind(previous, row)
          : "—"

    return {
      rank: idx + 1,
      team: teamCodeFromShort(row.teamShort),
      teamName: row.teamName,
      g: row.g,
      w: row.w,
      l: row.l,
      t: row.t,
      pct,
      gb,
      remaining: row.remaining,
      runs: row.runs,
      ops: row.ops,
      avg: row.avg,
      hr: row.hr,
      sb: row.sb,
      h: row.h,
      singles: row.singles,
      doubles: row.doubles,
      triples: row.triples,
      obp: row.obp,
      slg: row.slg,
      risp_avg: row.risp_avg,
      isod: row.isod,
      isop: row.isop,
      bb_pct: row.bb_pct,
      k_pct: row.k_pct,
      era: row.era,
      e: row.e,
      runs_allowed: row.runs_allowed,
      era_starter: row.era_starter,
      era_relief: row.era_relief,
      avg_allowed: row.avg_allowed,
      cg: row.cg,
      bb_pct_pitch: row.bb_pct_pitch,
      k_pct_pitch: row.k_pct_pitch,
      k_bb_pct: row.k_bb_pct,
      qs_rate: row.qs_rate,
      hqs_rate: row.hqs_rate,
      ip: row.ip,
      so: row.so,
      sv: row.sv,
      hld: row.hld,
      hp: row.hp,
      pitches: row.pitches,
      bf: row.bf,
      h_allowed: row.h_allowed,
      hr_allowed: row.hr_allowed,
      bb_allowed: row.bb_allowed,
      ibb_allowed: row.ibb_allowed,
      hbp_allowed: row.hbp_allowed,
      er: row.er,
      whip: row.whip,
    }
  })
}
