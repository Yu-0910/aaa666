/**
 * Phase 2: player_season_pitching_poc ペイロード → 既存投手 UI のセル文字列（基本成績の列は page と一致させる）
 */

import type {
  PitcherSeasonPocPaAgg,
  PitcherSeasonPocPayload,
  PitcherSeasonPocPitchTypesSplitRow,
  PitcherSeasonPocStadiumRow,
} from "./pitcherSeasonPocTypes"
import { formatEra, formatRankingStatDisplay } from "./formatStat"
import { formatSlashStatDisplay } from "./battingRateFormat"
import {
  nf3IprDisplay,
  nf3LeagueEraFallback,
  nf3LobPctDisplay,
  nf3PrDisplay,
  nf3RsaaRswinDisplay,
} from "./nf3LeaguePitchingFallback"
import { STADIUM_VENUE_UI_ROWS_PITCHER, formatPlayerPageStadiumDisplay } from "@/lib/stadiumVenueNormalize"
import { playerVsTeamNamesMatch } from "@/lib/standings/teamCodes"
import { fmtAvg } from "./yahooGame/pitcherPaResultCommon"
import { ORDERED_PITCH_COUNT_KEYS } from "./yahooGame/pitchCountSim"

function pctStr(num: number, den: number): string {
  if (den <= 0) return "ー"
  return `${((num / den) * 100).toFixed(1)}%`
}

function pctRank(metricLabel: string, num: number, den: number): string {
  if (den <= 0) return "—"
  return formatRankingStatDisplay(metricLabel, (num / den) * 100)
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
  let wins = 0
  let losses = 0
  let saves = 0
  if (typeof b.winCount === "number") {
    wins = b.winCount
    losses = b.lossCount ?? 0
    saves = b.saveCount ?? 0
  } else {
    if (b.decision === "win") wins = 1
    if (b.decision === "loss") losses = 1
    if (b.decision === "save") saves = 1
  }
  const w = String(wins)
  const l = String(losses)
  const s = String(saves)
  const hp = b.holds != null ? String(b.holds) : "—"
  const era = formatEra(b.era)
  const rawAvg = (b.avgAgainstApprox ?? "").trim()
  const avgVs = rawAvg ? formatSlashStatDisplay(rawAvg) : "—"
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
  const pIp =
    ipNum > 0 ? formatRankingStatDisplay("P/IP", b.pitches / ipNum) : "—"
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
    wins + losses > 0
      ? formatRankingStatDisplay("勝率", wins / (wins + losses))
      : "—"
  const mu4 = b.bb === 0 && b.hbp === 0 ? "1" : "—"
  const kPct = b.bf > 0 ? pctRank("K％", b.so, b.bf) : "—"
  const cg = b.completeGames != null ? String(b.completeGames) : "—"
  const sho = b.shutouts != null ? String(b.shutouts) : "—"
  return [cg, sho, mu4, winPct, b.ip, String(b.bf), String(b.pitches), pIp, String(b.h), kPct]
}

/** 基本成績 3 行目（10 列・1〜2 行目と同数） */
export function pitcherPocBasicRow3(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const ibb = b.intentionalWalks != null ? String(b.intentionalWalks) : "—"
  const qsPct = formatQualityStartRatePct("QS率", b.qsRate, b.qsCount, b.gamesStarted)
  return [
    String(b.hr),
    String(b.so),
    String(b.bb),
    ibb,
    String(b.hbp),
    String(b.bk),
    String(b.r),
    String(b.er),
    b.whip != null ? formatRankingStatDisplay("WHIP", b.whip) : "—",
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

function fmtHomeAwayCells(r: PitcherSeasonPocStadiumRow): Omit<HvRow, "label"> {
  const era = r.era != null ? formatEra(r.era) : "—"
  const ip = r.ip || "—"
  let wl = "—"
  if ((r.games ?? 0) > 0) wl = `${r.wins}-${r.losses}`
  const kPct = r.bf > 0 ? pctStr(r.so, r.bf) : "—"
  const kBbPct = r.bf > 0 ? pctStr(r.so - r.bb, r.bf) : "—"
  const whip = r.whip != null ? r.whip.toFixed(2) : "—"
  const ab = Math.max(0, r.bf - r.bb - r.hbp)
  const avg = ab > 0 ? fmtAvg(ab, r.h) : "—"
  return { era, wl, ip, k_bb_pct: kBbPct, k_pct: kPct, whip, avg }
}

export function pitcherPocHomeAwayRows(pp: PitcherSeasonPocPayload): HvRow[] {
  const rows = pp.splits.byHomeAway ?? []
  const homeRow = rows.find((r) => r.key === "home")
  const awayRow = rows.find((r) => r.key === "away")

  return (["ホーム", "アウェー"] as const).map((label) => {
    const split = label === "ホーム" ? homeRow : awayRow
    if (!split || (split.ipOuts <= 0 && split.bf <= 0)) {
      return {
        label,
        era: "—",
        wl: "—",
        ip: "—",
        k_bb_pct: "—",
        k_pct: "—",
        whip: "—",
        avg: "—",
      }
    }
    return { label, ...fmtHomeAwayCells(split) }
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

function fmtDayNightCells(r: PitcherSeasonPocStadiumRow): Omit<DayNightRow, "label"> {
  const era = r.era != null ? formatEra(r.era) : "—"
  const ip = r.ip || "—"
  let wl = "—"
  if ((r.games ?? 0) > 0) wl = `${r.wins}-${r.losses}`
  const kPct = r.bf > 0 ? pctStr(r.so, r.bf) : "—"
  const kBbPct = r.bf > 0 ? pctStr(r.so - r.bb, r.bf) : "—"
  const whip = r.whip != null ? r.whip.toFixed(2) : "—"
  const qs_pct = r.games > 0 ? `${((r.qsCount / r.games) * 100).toFixed(1)}%` : "ー"
  return { era, wl, ip, k_bb_pct: kBbPct, k_pct: kPct, whip, qs_pct }
}

export function pitcherPocDayNightRows(pp: PitcherSeasonPocPayload): DayNightRow[] {
  const rows = pp.splits.byDayNight ?? []
  const dayRow = rows.find((r) => r.key === "day")
  const nightRow = rows.find((r) => r.key === "night")

  return (["デー", "ナイター"] as const).map((label) => {
    const split = label === "デー" ? dayRow : nightRow
    if (!split || (split.ipOuts <= 0 && split.bf <= 0)) {
      return {
        label,
        era: "—",
        wl: "—",
        ip: "—",
        k_bb_pct: "—",
        k_pct: "—",
        whip: "—",
        qs_pct: "ー",
      }
    }
    return { label, ...fmtDayNightCells(split) }
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
    { team: "横浜" },
    { team: "中日" },
    { team: "阪神" },
    { team: "広島" },
  ]

function teamRowMatchesOpponent(uiTeam: string, opponentName: string): boolean {
  return playerVsTeamNamesMatch(uiTeam, opponentName)
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
  venue: formatPlayerPageStadiumDisplay(display),
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
        venue: formatPlayerPageStadiumDisplay(item.display),
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
    return { venue: formatPlayerPageStadiumDisplay(item.display), teamLabel: item.teamLabel, ...fmtStadiumVsCells(r) }
  })
}

export function pitcherPocTeamVsRows(pp: PitcherSeasonPocPayload): TeamVsRow[] {
  const oppRows = pp.splits.byOpponentTeam ?? []
  return TEAM_ROWS.map(({ team }) => {
    const split = findOpponentTeamSplitRow(oppRows, team)
    if (!split || (split.ipOuts <= 0 && split.bf <= 0)) {
      return {
        team,
        era: "ー",
        ip: "ー",
        wl: "ー",
        qs_pct: "ー",
        k_pct: "ー",
        k_bb_pct: "ー",
        whip: "ー",
      }
    }
    return { team, ...fmtStadiumVsCells(split) }
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

/** 巡目別球種一覧の行 key 順 */
export const PA_ROUND_ORDERED_KEYS = ["1", "2", "3", "4", "5"] as const

export type PaRoundPitchTypeSplitField =
  | "byPaRoundPitchTypes"
  | "byPaRoundPitchTypesVsL"
  | "byPaRoundPitchTypesVsR"

function hasPitchTypesSplitRows(
  rows: PitcherSeasonPocPitchTypesSplitRow[] | null | undefined,
): boolean {
  return (rows?.length ?? 0) > 0 && rows.some((r) => r.pitches_total > 0)
}

/** 巡目別・カウント別の対左右球種 UI（折りたたみ）を出せるか */
export function hasPitchTypeVsHandSidePanelData(
  payload: PitcherSeasonPocPayload | null | undefined,
): boolean {
  if (!payload?.splits) return false
  const s = payload.splits
  return (
    hasPitchTypesSplitRows(s.byPaRoundPitchTypesVsL) ||
    hasPitchTypesSplitRows(s.byPaRoundPitchTypesVsR) ||
    hasPitchTypesSplitRows(s.byCountPitchTypesVsL) ||
    hasPitchTypesSplitRows(s.byCountPitchTypesVsR)
  )
}

/**
 * 巡目別球種 split（実データ優先。未生成時はシーズン通算 or 試合別球種で全巡目に同割合を暫定表示）。
 * 対左／対右は payload のみ（暫定フォールバックなし）。
 */
export function resolvePaRoundPitchTypeSplits(
  payload: PitcherSeasonPocPayload | null | undefined,
  seasonRows: { pitch_type: string; pitches: number; pct: number }[] | null | undefined,
  gameRows: { pitch_type: string; pct: number }[] | null | undefined,
  field: PaRoundPitchTypeSplitField = "byPaRoundPitchTypes",
): PitcherSeasonPocPitchTypesSplitRow[] | null {
  const roundRows = payload?.splits?.[field]
  if (field !== "byPaRoundPitchTypes") {
    return roundRows?.some((r) => r.pitches_total > 0) ? roundRows : null
  }
  if (roundRows?.some((r) => r.pitches_total > 0)) {
    return roundRows
  }
  const fallbackSource = seasonRows?.length
    ? seasonRows.map((r) => ({
        pitch_type: r.pitch_type,
        pitches: r.pitches,
        pct: r.pct,
      }))
    : gameRows?.length
      ? gameRows.map((r) => ({
          pitch_type: r.pitch_type,
          pitches: Math.round(r.pct * 10),
          pct: r.pct,
        }))
      : []
  if (fallbackSource.length === 0) return null
  const pitches_total = fallbackSource.reduce((s, r) => s + r.pitches, 0)
  return PA_ROUND_ORDERED_KEYS.map((key) => ({
    key,
    label: key === "5" ? "5巡目以上" : `${key}巡目`,
    pitches_total,
    rows: fallbackSource,
  }))
}

/** カウント別: 被打率, 打数, 安打, 二塁打, 本塁打, IsoP */
export function pitcherPocCountRows(pp: PitcherSeasonPocPayload): SitRowUi[] {
  const m = new Map((pp.splits.byCount ?? []).map((s) => [s.key, s]))
  return ORDERED_PITCH_COUNT_KEYS.map((key) => {
    const s = m.get(key)
    if (!s || s.bf <= 0) {
      return { label: key, cells: Array.from({ length: 6 }, () => "ー") }
    }
    const isop =
      typeof s.isop === "string"
        ? formatRankingStatDisplay("IsoP", s.isop)
        : typeof s.tb === "number" && s.ab > 0
          ? formatRankingStatDisplay("IsoP", (s.tb - s.h) / s.ab)
          : "—"
    return {
      label: key,
      cells: [
        s.avg ?? "—",
        String(s.ab),
        String(s.h),
        s.h2 != null ? String(s.h2) : "—",
        String(s.hr),
        isop,
      ],
    }
  })
}

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

/** 先発試合ベースのクオリティスタート系率（QS/HQS/SQS）を表示用文字列にする */
export function formatQualityStartRatePct(
  metricLabel: "QS率" | "HQS率" | "SQS率",
  rate: number | null | undefined,
  count: number | undefined,
  gamesStarted: number | undefined
): string {
  let pct: number | null = null
  if (rate != null) pct = rate * 100
  else {
    const gs = gamesStarted ?? 0
    if (gs > 0 && count != null) pct = (count / gs) * 100
  }
  return pct == null ? "—" : formatRankingStatDisplay(metricLabel, pct)
}

/** 投球指標 1 行目（7 列） */
export function pitcherPocMetricRow1(pp: PitcherSeasonPocPayload): string[] {
  const b = pp.basic
  const bf = b.bf
  const qsPct = formatQualityStartRatePct("QS率", b.qsRate, b.qsCount, b.gamesStarted)
  const hqsPct = formatQualityStartRatePct("HQS率", b.hqsRate, b.hqsCount, b.gamesStarted)
  const sqsPct = formatQualityStartRatePct("SQS率", b.sqsRate, b.sqsCount, b.gamesStarted)
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
    hqsPct,
    sqsPct,
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
    pp.nf3Metrics?.enGoRate ?? "—",
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
