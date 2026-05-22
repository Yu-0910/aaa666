/**
 * Phase 2: player_season_pitching_poc ペイロード → 既存投手 UI のセル文字列（基本成績の列は page と一致させる）
 */

import type {
  PitcherSeasonPocPaAgg,
  PitcherSeasonPocPayload,
  PitcherSeasonPocStadiumRow,
} from "./pitcherSeasonPocTypes"
import { formatEra } from "./formatStat"
import {
  nf3IprDisplay,
  nf3LeagueEraFallback,
  nf3LobPctDisplay,
  nf3PrDisplay,
  nf3RsaaRswinDisplay,
} from "./nf3LeaguePitchingFallback"
import { STADIUM_VENUE_UI_ROWS_PITCHER } from "@/lib/stadiumVenueNormalize"

function pctStr(num: number, den: number): string {
  if (den <= 0) return "ー"
  return `${((num / den) * 100).toFixed(1)}%`
}

/**
 * QS（クオリティ・スタート）: 6回以上の登板かつ自責点3以下。
 * 複数試合を1行に合算した集計では参考値（球場別 split と同じ定義）。
 */
function basicQsReached(b: PitcherSeasonPocPayload["basic"]): boolean {
  const outs = b.ipOuts ?? 0
  const er = b.er ?? 0
  return outs >= 18 && er <= 3
}

/** 基本成績 1 行目（10 列・2〜3 行目と同数） */
export function pitcherPocBasicRow1(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const games =
    b.gamesAppeared ?? Math.max(1, pp.source.canonicalGames?.length ?? 1)
  let w = "—"
  let l = "—"
  let s = "—"
  const hp = b.holds != null ? String(b.holds) : "—"
  if (b.decision === "win") w = "1"
  if (b.decision === "loss") l = "1"
  if (b.decision === "save") s = "1"
  const era = formatEra(b.era)
  const avgVs = (b.avgAgainstApprox ?? "").trim() || "—"
  const startStr = b.gamesStarted != null ? String(b.gamesStarted) : "—"
  const reliefStr = b.gamesInRelief != null ? String(b.gamesInRelief) : "—"
  const qsCell =
    b.qsCount != null
      ? String(b.qsCount)
      : basicQsReached(b)
        ? "1"
        : "0"
  return [era, String(games), startStr, reliefStr, w, l, s, hp, avgVs, qsCell]
}

/** 基本成績 2 行目（10 列） */
export function pitcherPocBasicRow2(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const ipNum = b.ipOuts / 3
  const pIp = ipNum > 0 ? (b.pitches / ipNum).toFixed(1) : "—"
  let wins = 0
  let losses = 0
  if (typeof b.winCount === "number") {
    wins = b.winCount
    losses = b.lossCount ?? 0
  } else {
    if (b.decision === "win") wins = 1
    if (b.decision === "loss") losses = 1
  }
  const winPct =
    wins + losses > 0 ? (wins / (wins + losses)).toFixed(3) : "—"
  const mu4 = b.bb === 0 && b.hbp === 0 ? "1" : "—"
  const kPct = b.bf > 0 ? `${((b.so / b.bf) * 100).toFixed(1)}%` : "—"
  const cg = b.completeGames != null ? String(b.completeGames) : "—"
  const sho = b.shutouts != null ? String(b.shutouts) : "—"
  return [cg, sho, mu4, winPct, b.ip, String(b.bf), String(b.pitches), pIp, String(b.h), kPct]
}

/** 基本成績 3 行目（10 列・1〜2 行目と同数） */
export function pitcherPocBasicRow3(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const ibb = b.intentionalWalks != null ? String(b.intentionalWalks) : "—"
  const qsPct =
    b.qsRate != null ? `${(b.qsRate * 100).toFixed(1)}%` : "—"
  return [
    String(b.hr),
    String(b.so),
    String(b.bb),
    ibb,
    String(b.hbp),
    String(b.bk),
    String(b.r),
    String(b.er),
    b.whip != null ? b.whip.toFixed(2) : "—",
    qsPct,
  ]
}

export type TeamVsRow = {
  team: string
  era: string
  ip: string
  wl: string
  qs_pct: string
  k_pct: string
  k_bb_pct: string
  whip: string
}

export type HvRow = {
  label: "ホーム" | "アウェー"
  era: string
  wl: string
  ip: string
  k_bb_pct: string
  k_pct: string
  whip: string
  avg: string
}

export function pitcherPocHomeAwayRows(pp: PitcherSeasonPocPayload): HvRow[] {
  const b = pp.basic
  const kind = pp.gameMeta?.homeAway ?? null
  const era = formatEra(b.era)
  const ip = b.ip || "—"
  // 勝敗が付かない登板（decision=null）でも「0-0」で埋める（空欄にしない）
  let wl = "0-0"
  if (b.decision === "win") wl = "1-0"
  if (b.decision === "loss") wl = "0-1"
  const kPct = b.bf > 0 ? `${((b.so / b.bf) * 100).toFixed(1)}%` : "—"
  const kBbPct = b.bf > 0 ? `${(((b.so - b.bb) / b.bf) * 100).toFixed(1)}%` : "—"
  const whip = b.whip != null ? b.whip.toFixed(2) : "—"
  const avg = b.avgAgainstApprox || "—"

  return (["ホーム", "アウェー"] as const).map((label) => {
    const fill = (label === "ホーム" && kind === "home") || (label === "アウェー" && kind === "away")
    return {
      label,
      era: fill ? era : "—",
      wl: fill ? wl : "—",
      ip: fill ? ip : "—",
      k_bb_pct: fill ? kBbPct : "—",
      k_pct: fill ? kPct : "—",
      whip: fill ? whip : "—",
      avg: fill ? avg : "—",
    }
  })
}

export type DayNightRow = {
  label: "デー" | "ナイター"
  era: string
  wl: string
  ip: string
  k_bb_pct: string
  k_pct: string
  whip: string
  qs_pct: string
}

function dayNightSplitRow(
  rows: PitcherSeasonPocStadiumRow[],
  key: "day" | "night"
): PitcherSeasonPocStadiumRow | undefined {
  return rows.find((r) => r.key === key)
}

export function pitcherPocDayNightRows(pp: PitcherSeasonPocPayload): DayNightRow[] {
  const b = pp.basic
  const kind = pp.gameMeta?.dayNight ?? null
  const era = formatEra(b.era)
  const ip = b.ip || "—"
  // 勝敗が付かない登板（decision=null）でも「0-0」で埋める（空欄にしない）
  let wl = "0-0"
  if (b.decision === "win") wl = "1-0"
  if (b.decision === "loss") wl = "0-1"
  const kPct = b.bf > 0 ? `${((b.so / b.bf) * 100).toFixed(1)}%` : "—"
  const kBbPct = b.bf > 0 ? `${(((b.so - b.bb) / b.bf) * 100).toFixed(1)}%` : "—"
  const whip = b.whip != null ? b.whip.toFixed(2) : "—"

  const dnRows = pp.splits.byDayNight ?? []
  const daySplit = dayNightSplitRow(dnRows, "day")
  const nightSplit = dayNightSplitRow(dnRows, "night")

  return (["デー", "ナイター"] as const).map((label) => {
    const fill = (label === "デー" && kind === "day") || (label === "ナイター" && kind === "night")
    const split = label === "デー" ? daySplit : nightSplit
    const qs_pct =
      split && split.games > 0 ? `${((split.qsCount / split.games) * 100).toFixed(1)}%` : "ー"
    return {
      label,
      era: fill ? era : "—",
      wl: fill ? wl : "—",
      ip: fill ? ip : "—",
      k_bb_pct: fill ? kBbPct : "—",
      k_pct: fill ? kPct : "—",
      whip: fill ? whip : "—",
      qs_pct,
    }
  })
}

const TEAM_ROWS: Omit<TeamVsRow, "era" | "ip" | "wl" | "qs_pct" | "k_pct" | "k_bb_pct" | "whip">[] =
  [
    { team: "日本ハム" },
    { team: "楽天" },
    { team: "西武" },
    { team: "ロッテ" },
    { team: "オリックス" },
    { team: "ソフトバンク" },
    { team: "巨人" },
    { team: "ヤクルト" },
    { team: "ＤｅＮＡ" },
    { team: "中日" },
    { team: "阪神" },
    { team: "広島" },
  ]

function teamRowMatchesOpponent(uiTeam: string, opponentName: string): boolean {
  if (!opponentName) return false
  if (uiTeam === opponentName) return true
  if (opponentName.includes(uiTeam)) return true
  if (uiTeam === "ＤｅＮＡ" && opponentName.includes("DeNA")) return true
  return false
}

function findOpponentTeamSplitRow(
  rows: PitcherSeasonPocStadiumRow[],
  uiTeam: string
): PitcherSeasonPocStadiumRow | null {
  for (const r of rows) {
    if (teamRowMatchesOpponent(uiTeam, r.key) || teamRowMatchesOpponent(uiTeam, r.label)) {
      return r
    }
  }
  return null
}

export const EMPTY_TEAM_VS_ROWS: TeamVsRow[] = TEAM_ROWS.map(({ team }) => ({
  team,
  era: "ー",
  ip: "ー",
  wl: "ー",
  qs_pct: "ー",
  k_pct: "ー",
  k_bb_pct: "ー",
  whip: "ー",
}))

/** 球場別投球成績（固定行順・メタの表記ゆれは dataKeys で吸収） */
export type StadiumVsRow = {
  venue: string
  teamLabel: string
  era: string
  ip: string
  wl: string
  qs_pct: string
  k_pct: string
  k_bb_pct: string
  whip: string
}

const STADIUM_VENUE_ROWS = STADIUM_VENUE_UI_ROWS_PITCHER

function findStadiumRow(
  rows: PitcherSeasonPocStadiumRow[],
  dataKeys: string[]
): PitcherSeasonPocStadiumRow | null {
  const map = new Map(rows.map((r) => [r.key, r]))
  for (const dk of dataKeys) {
    const hit = map.get(dk)
    if (hit) return hit
  }
  for (const r of rows) {
    for (const dk of dataKeys) {
      if (r.key.includes(dk) || dk.includes(r.key)) return r
    }
  }
  return null
}

function fmtStadiumVsCells(r: PitcherSeasonPocStadiumRow): Omit<StadiumVsRow, "venue" | "teamLabel"> {
  const era = r.era != null ? formatEra(r.era) : "ー"
  const ip = r.ip || "ー"
  // 勝敗が付かない登板でも、登板がある球場行は 0-0 で埋める（空欄にしない）
  let wl = "ー"
  if ((r.games ?? 0) > 0) wl = `${r.wins}-${r.losses}`
  const kPct = r.bf > 0 ? pctStr(r.so, r.bf) : "ー"
  const kBbPct = r.bf > 0 ? pctStr(r.so - r.bb, r.bf) : "ー"
  const whip = r.whip != null ? r.whip.toFixed(2) : "ー"
  const qsPct = r.games > 0 ? `${((r.qsCount / r.games) * 100).toFixed(1)}%` : "ー"
  return { era, ip, wl, qs_pct: qsPct, k_pct: kPct, k_bb_pct: kBbPct, whip }
}

export const EMPTY_STADIUM_VS_ROWS: StadiumVsRow[] = STADIUM_VENUE_ROWS.map(({ display, teamLabel }) => ({
  venue: display,
  teamLabel,
  era: "ー",
  ip: "ー",
  wl: "ー",
  qs_pct: "ー",
  k_pct: "ー",
  k_bb_pct: "ー",
  whip: "ー",
}))

export function pitcherPocStadiumRows(pp: PitcherSeasonPocPayload): StadiumVsRow[] {
  const rows = pp.splits.byStadium ?? []
  return STADIUM_VENUE_ROWS.map((item) => {
    const r = findStadiumRow(rows, item.dataKeys)
    if (!r) {
      return {
        venue: item.display,
        teamLabel: item.teamLabel,
        era: "ー",
        ip: "ー",
        wl: "ー",
        qs_pct: "ー",
        k_pct: "ー",
        k_bb_pct: "ー",
        whip: "ー",
      }
    }
    return { venue: item.display, teamLabel: item.teamLabel, ...fmtStadiumVsCells(r) }
  })
}

export function pitcherPocTeamVsRows(pp: PitcherSeasonPocPayload): TeamVsRow[] {
  const b = pp.basic
  const opp = pp.opponentTeamName || ""
  const era = formatEra(b.era)
  const ip = b.ip || "ー"
  // 勝敗が付かない登板（decision=null）でも「0-0」（対戦相手行に当てはまるときだけ表示）
  let wl = "0-0"
  if (b.decision === "win") wl = "1-0"
  if (b.decision === "loss") wl = "0-1"
  if (b.decision === "hold" || b.decision === "save") wl = "0-0"
  const kPct = pctStr(b.so, b.bf)
  const kBbPct = pctStr(b.so - b.bb, b.bf)
  const whip = b.whip != null ? b.whip.toFixed(2) : "ー"
  const oppRows = pp.splits.byOpponentTeam ?? []
  return TEAM_ROWS.map(({ team }) => {
    const fill = teamRowMatchesOpponent(team, opp)
    const split = findOpponentTeamSplitRow(oppRows, team)
    const qsPct =
      split && split.games > 0 ? `${((split.qsCount / split.games) * 100).toFixed(1)}%` : "ー"
    return {
      team,
      era: fill ? era : "ー",
      ip: fill ? ip : "ー",
      wl: fill ? wl : "ー",
      qs_pct: qsPct,
      k_pct: fill ? kPct : "ー",
      k_bb_pct: fill ? kBbPct : "ー",
      whip: fill ? whip : "ー",
    }
  })
}

/** 左右別 1 行分（打数, 被安打, K-BB%, K%, BB%, 被打率, 被本） */
export function pitcherPocHandCells(a: PitcherSeasonPocPaAgg): string[] {
  const empty = a.bf <= 0
  return [
    empty ? "—" : String(a.ab),
    empty ? "—" : String(a.h),
    pctStr(a.so - a.bb, a.bf),
    pctStr(a.so, a.bf),
    pctStr(a.bb, a.bf),
    a.avg ?? "—",
    String(a.hr),
  ]
}

const SIT_UI_KEYS = [
  "none",
  "r1",
  "r2",
  "r3",
  "r12",
  "r13",
  "r23",
  "loaded",
  "no_risp",
  "risp",
] as const

const SIT_LABELS: Record<string, string> = {
  none: "無し",
  r1: "1塁",
  r2: "2塁",
  r3: "3塁",
  r12: "1・2塁",
  r13: "1・3塁",
  r23: "2・3塁",
  loaded: "満塁",
  no_risp: "非得点圏",
  risp: "得点圏",
}

export type SitRowUi = { label: string; cells: string[] }

export function pitcherPocSituationRows(pp: PitcherSeasonPocPayload): SitRowUi[] {
  const m = new Map(pp.splits.bySituation.map((s) => [s.key, s]))
  return SIT_UI_KEYS.map((key) => {
    const s = m.get(key)
    const label = SIT_LABELS[key] ?? key
    if (!s || s.bf <= 0) {
      return { label, cells: Array.from({ length: 7 }, () => "ー") }
    }
    return {
      label,
      cells: [
        String(s.h),
        String(s.ab),
        pctStr(s.so - s.bb, s.bf),
        pctStr(s.so, s.bf),
        pctStr(s.bb, s.bf),
        s.avg ?? "—",
        String(s.hr),
      ],
    }
  })
}

/** 捕手別（Phase 6）。列: 防御率, 勝敗, 回数, K-BB%, K%, WHIP, QS% */
export function pitcherPocCatcherRows(pp: PitcherSeasonPocPayload): {
  label: string
  cells: string[]
}[] {
  const rows = pp.splits.byCatcher ?? []
  if (rows.length === 0) {
    return [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }]
  }
  return rows.map((r) => ({
    label: r.label,
    cells: [
      formatEra(r.era),
      r.wl,
      r.ip,
      r.kBbPct != null ? `${r.kBbPct.toFixed(1)}%` : "—",
      r.kPct != null ? `${r.kPct.toFixed(1)}%` : "—",
      r.whip != null ? r.whip.toFixed(2) : "—",
      r.qsPct != null ? `${r.qsPct.toFixed(1)}%` : "—",
    ],
  }))
}

export function pitcherPocInningRow(pp: PitcherSeasonPocPayload, inning: number): string[] {
  const row = pp.splits.byInning.find((r) => r.inning === inning)
  if (!row || row.bf <= 0) {
    return Array.from({ length: 8 }, () => "—")
  }
  return [
    formatEra(row.era),
    String(row.ab),
    pctStr(row.so - row.bb, row.bf),
    pctStr(row.so, row.bf),
    pctStr(row.bb, row.bf),
    row.whip != null ? row.whip.toFixed(2) : "—",
    row.avg ?? "—",
    String(row.hr),
  ]
}

/**
 * Phase 8: FIP のリーグ定数（スケール合わせ）。1 試合 PoC 用の固定値（NPB 実数値ではない）。
 * 式: ((13*HR)+3*(BB+HBP)-2*SO)/IP + c
 */
const FIP_CONSTANT_POC = 3.2

/**
 * Phase 8: 集計行が HQS/SQS 条件を満たすか（満たせば 100%、さもなければ 0%）。
 * HQS: 7回以上かつ自責2以下 / SQS: 8回以上かつ自責1以下。複数試合を1行に足し込んだ場合は参考値。
 */
function hqsSqsRates(pp: PitcherSeasonPocPayload): { hqs: string; sqs: string } {
  const b = pp.basic
  const outs = b.ipOuts
  const er = b.er ?? 0
  const hqsHit = outs >= 21 && er <= 2
  const sqsHit = outs >= 24 && er <= 1
  return {
    hqs: hqsHit ? "100.0%" : "0.0%",
    sqs: sqsHit ? "100.0%" : "0.0%",
  }
}

/** 投球指標 1 行目（7 列） */
export function pitcherPocMetricRow1(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const bf = b.bf
  const qsPct =
    b.qsRate != null ? `${(b.qsRate * 100).toFixed(1)}%` : "—"
  const { hqs, sqs } = hqsSqsRates(pp)
  const obpAgainst = bf > 0 ? ((b.h + b.bb + b.hbp) / bf).toFixed(3) : "—"

  const abApprox = bf - b.bb - b.hbp
  let babip = "—"
  if (abApprox > 0) {
    const denom = abApprox - b.so - b.hr
    if (denom > 0) {
      babip = ((b.h - b.hr) / denom).toFixed(3)
    }
  }

  let slgAgainst = "—"
  if (abApprox > 0) {
    const tbMin = b.h + 3 * b.hr
    slgAgainst = (tbMin / abApprox).toFixed(3)
  }

  return [
    qsPct,
    hqs,
    sqs,
    b.avgAgainstApprox || "—",
    babip,
    obpAgainst,
    slgAgainst,
  ]
}

/** 投球指標 2 行目（7 列）: GO/AO, 援護率, IPR, NHB%, FIP, HR/9, K-BB%。IPR は純救援のみ nf3 式。 */
export function pitcherPocMetricRow2(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const bf = b.bf
  const ipNum = b.ipOuts / 3

  const hr9 =
    ipNum > 0 ? ((b.hr / ipNum) * 9).toFixed(2) : "—"

  let fip = "—"
  if (ipNum > 0) {
    const numer = 13 * b.hr + 3 * (b.bb + b.hbp) - 2 * b.so
    fip = (numer / ipNum + FIP_CONSTANT_POC).toFixed(2)
  }

  const bbOut = pp.basic.battedBallOuts
  let goAo = "—"
  if (bbOut && (bbOut.ground > 0 || bbOut.air > 0)) {
    if (bbOut.air > 0) goAo = (bbOut.ground / bbOut.air).toFixed(2)
    else if (bbOut.ground > 0) goAo = "—"
  }

  const ipr =
    pp.nf3Metrics?.ipr ??
    nf3IprDisplay(b.gamesStarted, b.gamesInRelief, b.ipOuts, b.r ?? 0)
  const nhbPctStr = pp.nf3Metrics?.nhbPct ?? "—"

  return [
    goAo,
    "—",
    ipr,
    nhbPctStr,
    fip,
    hr9,
    pctStr(b.so - b.bb, bf),
  ]
}

/**
 * 投球指標 3 行目（7 列）: K%・BB%・LOB%・PR・NHB・RSAA・RSWIN。
 * K/BB は bf ベース。LOB/PR/RSAA/RSWIN は nf3 定義＋リーグ近似（`nf3LeaguePitchingFallback`）。
 * NHB は `nf3Metrics`（canonical 集計）が無いとき「—」。
 */
export function pitcherPocMetricRow3(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const bf = b.bf
  const leagueEra = nf3LeagueEraFallback(pp.seasonYear)
  const { rsaa, rswin } = nf3RsaaRswinDisplay(pp.seasonYear, b.r ?? 0, b.ipOuts)
  const nhbStr =
    pp.nf3Metrics != null ? String(pp.nf3Metrics.nhbCount) : "—"
  return [
    pctStr(b.so, bf),
    pctStr(b.bb, bf),
    nf3LobPctDisplay(b.h, b.bb, b.hbp, b.r ?? 0, b.hr),
    nf3PrDisplay(leagueEra, b.era, b.ipOuts),
    nhbStr,
    rsaa,
    rswin,
  ]
}

/** @deprecated pitcherPocMetricRow2 の先頭列と同じ（互換用） */
export function pitcherPocHr9(pp: PitcherSeasonPocPayload): string {
  const b = pp.basic
  const ipNum = b.ipOuts / 3
  if (ipNum <= 0) return "—"
  return ((b.hr / ipNum) * 9).toFixed(2)
}
