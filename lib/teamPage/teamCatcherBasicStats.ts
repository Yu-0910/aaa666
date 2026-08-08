/**
 * チーム捕手一覧: 個人捕手タブ「基本成績」と同型の合算指標
 * 正本: PlayerPageCatcherSeasonBody
 */

import {
  babipAgainstRatioFromCounts,
  formatGoAoFromBattedBallOuts,
  obpAgainstRatioFromCounts,
  pbPer9FromCounts,
  slgAgainstRatioFromCounts,
  type PitcherAgainstCountTotals,
} from "@/lib/catcherPitchingMetrics"
import type { CatcherDefenseBasicDerived } from "@/lib/catcherDefenseBasic"
import type {
  CatcherPitcherSeasonTotals,
  CatcherPitcherSplitRow,
} from "@/lib/catcherPitcherSplits"
import { buildCatcherPitcherSeasonTotals } from "@/lib/catcherPitcherSplits"
import type { CatcherStartingSummaryDerived } from "@/lib/catcherStartingSummary"

function ipStringToOuts(ip: string | null | undefined): number {
  const t = String(ip ?? "").trim()
  if (!t) return 0
  if (t.includes(".")) {
    const [w, frac] = t.split(".")
    const whole = parseInt(w, 10) || 0
    const f = parseInt(frac ?? "0", 10) || 0
    return whole * 3 + Math.min(2, f)
  }
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n * 3 : 0
}

export function outsToIpString(outs: number): string {
  if (outs <= 0) return "0"
  const w = Math.floor(outs / 3)
  const f = outs % 3
  return f === 0 ? String(w) : `${w}.${f}`
}

export type CatcherPitcherSplitsAggregate = {
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ipOuts: number
  wins: number
  losses: number
  qsCount: number
  era: number | null
  whip: number | null
  kPct: number | null
  avgAgainst: number | null
  babipAgainst: number | null
  obpAgainst: number | null
  slgAgainst: number | null
}

export function aggregateCatcherPitcherSplits(
  rows: readonly CatcherPitcherSplitRow[],
): CatcherPitcherSplitsAggregate {
  const sum = rows.reduce(
    (a, r) => {
      a.bf += r.bf ?? 0
      a.ab += r.ab ?? 0
      a.h += r.h ?? 0
      a.hr += r.hr ?? 0
      a.so += r.so ?? 0
      a.bb += r.bb ?? 0
      a.hbp += r.hbp ?? 0
      a.ipOuts += r.ipOuts ?? ipStringToOuts(r.ip)
      a.wins += r.wins ?? 0
      a.losses += r.losses ?? 0
      a.qsCount += r.qsCount ?? 0
      return a
    },
    {
      bf: 0,
      ab: 0,
      h: 0,
      hr: 0,
      so: 0,
      bb: 0,
      hbp: 0,
      ipOuts: 0,
      wins: 0,
      losses: 0,
      qsCount: 0,
    },
  )

  const estErSum = rows.reduce((acc, r) => {
    const outs = r.ipOuts ?? ipStringToOuts(r.ip)
    const era = r.era
    if (era == null || outs <= 0) return acc
    return acc + (era * outs) / 27
  }, 0)

  const era = sum.ipOuts > 0 ? (estErSum * 27) / sum.ipOuts : null
  const whip = sum.ipOuts > 0 ? (sum.h + sum.bb) / (sum.ipOuts / 3) : null
  const kPct = sum.bf > 0 ? (sum.so / sum.bf) * 100 : null
  const avgAgainst = sum.ab > 0 ? sum.h / sum.ab : null

  const againstCounts: PitcherAgainstCountTotals = {
    bf: sum.bf,
    h: sum.h,
    hr: sum.hr,
    so: sum.so,
    bb: sum.bb,
    hbp: sum.hbp,
  }

  const babipAgainst =
    sum.bf > 0 ? babipAgainstRatioFromCounts(againstCounts) : null
  const obpAgainst = sum.bf > 0 ? obpAgainstRatioFromCounts(againstCounts) : null
  const slgAgainst = sum.bf > 0 ? slgAgainstRatioFromCounts(againstCounts) : null

  return { ...sum, era, whip, kPct, avgAgainst, babipAgainst, obpAgainst, slgAgainst }
}

export type CatcherApiBundle = {
  gamesAsCatcher: number | null
  defense: CatcherDefenseBasicDerived | null
  starting: CatcherStartingSummaryDerived | null
  pitcherRows: CatcherPitcherSplitRow[]
  /** phase23 seasonTotals（全投手合算。チーム一覧はこちらを優先） */
  seasonTotals?: CatcherPitcherSeasonTotals | null
}

export type CatcherBasicStatsFields = {
  gamesAsCatcher: number | null
  era: number | null
  starts: number | null
  wins: number | null
  losses: number | null
  draws: number | null
  avgAgainst: number | null
  qsCount: number | null
  teamWinPct: number | null
  ipOuts: number | null
  bf: number | null
  pitches: number | null
  h: number | null
  kPct: number | null
  whip: number | null
  hr: number | null
  so: number | null
  bb: number | null
  ibb: number | null
  hbp: number | null
  er: number | null
  qsPct: number | null
  hqsPct: number | null
  sqsPct: number | null
  babipAgainst: number | null
  obpAgainst: number | null
  slgAgainst: number | null
  goAo: number | null
  csPct: number | null
  pbPer9: number | null
}

export function buildCatcherBasicStatsFields(api: CatcherApiBundle): CatcherBasicStatsFields {
  const pitching =
    api.seasonTotals ?? buildCatcherPitcherSeasonTotals(api.pitcherRows) ?? null
  const agg =
    api.pitcherRows.length > 0 ? aggregateCatcherPitcherSplits(api.pitcherRows) : null
  const starting = api.starting
  const defense = api.defense
  const hasStarting = starting != null

  const goAo = (() => {
    const bbOut = defense?.battedBallOuts
    if (!bbOut) return null
    const s = formatGoAoFromBattedBallOuts(bbOut.ground, bbOut.air)
    if (s === "—") return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  })()

  const ipOuts = pitching && pitching.ipOuts > 0 ? pitching.ipOuts : null
  const pbPer9 = (() => {
    if (ipOuts == null) return null
    return pbPer9FromCounts(defense?.pb ?? 0, ipOuts)
  })()

  const era = pitching?.era ?? agg?.era ?? null
  const whip = pitching?.whip ?? agg?.whip ?? null
  const kPct = pitching?.kPct ?? agg?.kPct ?? null
  const avgAgainst =
    pitching && pitching.ab > 0 ? pitching.h / pitching.ab : agg?.avgAgainst ?? null

  const againstCounts: PitcherAgainstCountTotals | null =
    pitching && pitching.bf > 0
      ? {
          bf: pitching.bf,
          h: pitching.h,
          hr: pitching.hr,
          so: pitching.so,
          bb: pitching.bb,
          hbp: pitching.hbp,
        }
      : agg
        ? {
            bf: agg.bf,
            h: agg.h,
            hr: agg.hr,
            so: agg.so,
            bb: agg.bb,
            hbp: agg.hbp,
          }
        : null

  const babipAgainst =
    againstCounts && againstCounts.bf > 0
      ? babipAgainstRatioFromCounts(againstCounts)
      : null
  const obpAgainst =
    againstCounts && againstCounts.bf > 0
      ? obpAgainstRatioFromCounts(againstCounts)
      : null
  const slgAgainst =
    againstCounts && againstCounts.bf > 0
      ? slgAgainstRatioFromCounts(againstCounts)
      : null

  return {
    gamesAsCatcher: api.gamesAsCatcher,
    era,
    starts: hasStarting ? starting.starts : null,
    wins: hasStarting ? starting.teamWins : null,
    losses: hasStarting ? starting.teamLosses : null,
    draws: hasStarting ? starting.teamDraws ?? null : null,
    avgAgainst,
    qsCount: hasStarting ? starting.qsCount : pitching?.qsCount ?? agg?.qsCount ?? null,
    teamWinPct: hasStarting ? starting.teamWinPct : null,
    ipOuts,
    bf: pitching && pitching.bf > 0 ? pitching.bf : null,
    pitches: defense?.pitches && defense.pitches > 0 ? defense.pitches : null,
    h: pitching && pitching.h > 0 ? pitching.h : null,
    kPct,
    whip,
    hr: pitching && pitching.hr > 0 ? pitching.hr : null,
    so: pitching && pitching.so > 0 ? pitching.so : null,
    bb: pitching && pitching.bb > 0 ? pitching.bb : null,
    ibb: pitching != null ? pitching.ibb : null,
    hbp: pitching && pitching.hbp > 0 ? pitching.hbp : null,
    er: pitching != null ? Math.round(pitching.er) : null,
    qsPct: hasStarting ? starting.qsPct : null,
    hqsPct: hasStarting ? starting.hqsPct : null,
    sqsPct: hasStarting ? starting.sqsPct : null,
    babipAgainst,
    obpAgainst,
    slgAgainst,
    goAo,
    csPct: defense?.csPct ?? null,
    pbPer9,
  }
}
