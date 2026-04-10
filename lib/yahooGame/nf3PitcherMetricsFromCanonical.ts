/**
 * nf3 系の「援護」「NHB」に必要なデータを canonical から抽出する。
 * 出典: docs/pitching_personal_page_metrics_impl_plan.md（nf3 ヘルプ準拠の式・用語）
 */

import type { CanonicalGameDocument, PitchingLine, PlateAppearance } from "./types"
import {
  comparePlateAppearances,
  inferPitcherTeamForNf3Line,
  inferPitcherTeamFromPlateAppearance,
  parsePaId,
  resolveNpbForPitcherLine,
  teamForYahooPlayerId,
} from "./pitcherPocHelpers"
import type { RosterRow } from "./rosterCsv"

function ipToOuts(ip: string | undefined): number {
  if (!ip || typeof ip !== "string") return 0
  const s = ip.trim()
  if (!s) return 0
  const m = s.match(/^(\d+)(?:\.([12]))?$/)
  if (!m) return 0
  const whole = parseInt(m[1]!, 10)
  const frac = m[2] === "1" ? 1 : m[2] === "2" ? 2 : 0
  return whole * 3 + frac
}

export function pitchingLineHasStats(pl: PitchingLine): boolean {
  const bf = pl.bf
  if (bf != null && bf > 0) return true
  return ipToOuts(pl.ip) > 0
}

/** スコアボードの 1 イニングセル → 得点（延長 "1X" は 1、空/"x" は 0） */
export function parseInningCell(cell: string | undefined): number {
  if (cell == null) return 0
  const t = String(cell).trim().toUpperCase()
  if (t === "" || t === "X") return 0
  const m = t.match(/^(\d+)/)
  if (!m) return 0
  return parseInt(m[1]!, 10) || 0
}

/**
 * 投球成績テーブルの並びはサイトによって逆順（延長のみ登板の救援が先頭等）になり得るため、
 * 打席ログの時系列で「各チームで最初にマウンドに立った投手」を先発とする。
 * 打席が無い・投手 ID が欠ける場合は、実績行の出現順にフォールバックする。
 */
function collectStartersFromPitchingLineOrderByTeam(
  doc: CanonicalGameDocument
): Map<string, string> {
  const lines = doc.domain?.pitchingLines ?? []
  const substantive = lines.filter(pitchingLineHasStats)
  const byTeam = new Map<string, { yid: string; origIdx: number }[]>()
  substantive.forEach((pl, i) => {
    const yid = (pl.yahooPlayerId ?? "").trim()
    if (!yid) return
    const tn = teamForYahooPlayerId(doc, yid) || inferPitcherTeamForNf3Line(doc, yid) || ""
    if (!tn) return
    const arr = byTeam.get(tn) ?? []
    arr.push({ yid, origIdx: i })
    byTeam.set(tn, arr)
  })
  const out = new Map<string, string>()
  for (const [tn, arr] of byTeam) {
    arr.sort((a, b) => a.origIdx - b.origIdx)
    const f = arr[0]?.yid
    if (f) out.set(tn, f)
  }
  return out
}

function collectStartersFromPlateAppearances(doc: CanonicalGameDocument): Map<string, string> {
  const byTeam = new Map<string, string>()
  const sorted = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
  for (const pa of sorted) {
    const yid = (pa.yahooPitcherId ?? "").trim()
    if (!yid) continue
    const team = inferPitcherTeamFromPlateAppearance(doc, yid, pa)
    if (!team) continue
    if (!byTeam.has(team)) byTeam.set(team, yid)
  }
  return byTeam
}

export function collectStartersYahooIdsFromStatLines(doc: CanonicalGameDocument): Set<string> {
  const fromPa = collectStartersFromPlateAppearances(doc)
  const fromLines = collectStartersFromPitchingLineOrderByTeam(doc)
  const merged = new Map<string, string>()
  for (const [tn, yid] of fromLines) merged.set(tn, yid)
  for (const [tn, yid] of fromPa) merged.set(tn, yid)
  return new Set(merged.values())
}

/** 打席順序キー（大きいほど試合後半）。parsePaId と同じ inning*2+half（表=0,裏=1） */
function halfOrderFromPa(pa: PlateAppearance): number {
  const p = parsePaId(pa.paId)
  if (p) return p.inning * 2 + p.half
  const ih = pa.inningHalf ?? ""
  const m = ih.match(/(\d+)回(表|裏)/)
  if (!m) return -1
  const inn = parseInt(m[1]!, 10)
  const half = m[2] === "表" ? 0 : 1
  return inn * 2 + half
}

/**
 * 先発の「援護点」近似: 投手の最後のマウンド打席までに、自チームが取った得点の合計。
 * スコアボードのチーム行は、ビジターは「表」、ホームは「裏」でそのイニングの得点。
 * 最後のマウンドが i 回表なら、その回の裏以降の自チーム得点は含めない（先に裏が来るため、表の直後の裏は含める）。
 */
export function runSupportPointsForStarter(
  doc: CanonicalGameDocument,
  yahooPitcherId: string,
  pitcherTeamName: string
): number | null {
  const board = doc.game?.scoreboard ?? []
  if (board.length < 1) return null
  const pas = (doc.domain?.plateAppearances ?? []).filter(
    (p) => (p.yahooPitcherId ?? "").trim() === yahooPitcherId
  )
  if (pas.length === 0) return null
  const sorted = [...pas].sort(comparePlateAppearances)
  const lastPa = sorted[sorted.length - 1]!
  const lastOrder = halfOrderFromPa(lastPa)
  if (lastOrder < 0) return null

  const teamRow = board.find((r) => (r.teamName ?? "").trim() === pitcherTeamName.trim())
  if (!teamRow) return null

  const visitorRow = board[0]
  const homeRow = board[1]
  if (!visitorRow || !homeRow) return null

  const isVisitor = (visitorRow.teamName ?? "").trim() === pitcherTeamName.trim()
  const innings = (teamRow.innings ?? []).map(parseInningCell)

  let total = 0
  for (let inn = 1; inn <= innings.length; inn++) {
    const runs = innings[inn - 1] ?? 0
    if (runs === 0) continue
    // ビジター打線の得点は各回「表」、ホーム打線は各回「裏」。半順序は parsePaId と同じ inning*2+half（表=0,裏=1）。
    const offensiveHalfOrder = isVisitor ? inn * 2 + 0 : inn * 2 + 1
    // その攻撃があった時点までにマウンドにいたとみなす: 最後の投球がその攻撃半より後なら援護に含める
    if (lastOrder >= offensiveHalfOrder) total += runs
  }
  return total
}

export type PitchingLineNf3Row = {
  gameId: string
  /** 元配列での出現順（救援の並び判別用） */
  lineIndex: number
  yahooPlayerId: string
  playerName: string
  npbPlayerId: string | null
  teamName: string
  /** 当該行が先発登板か（チーム先発かつ同一投手の先頭の実績行） */
  isStarterStint: boolean
  /** 当該行が救援登板か（nf3 NHB の分母に入る行） */
  isReliefStint: boolean
  ipOuts: number
  bf: number
  h: number
  bb: number
  hbp: number
  /** 当該行の失点（救援 IPR の分子・分母集計用） */
  r: number
  /** nf3: 救援かつ安打・与四死球を一切許さなかった（NHB の 1 カウント） */
  nhbEligible: boolean
}

/**
 * 同一投手の複数行: チーム先発の「最初の実績行」だけ isStarterStint。2 行目以降は救援扱い（再登板）。
 */
export function extractNf3PitchingLineRows(
  doc: CanonicalGameDocument,
  roster: RosterRow[],
  gameId: string
): PitchingLineNf3Row[] {
  const lines = doc.domain?.pitchingLines ?? []
  const starters = collectStartersYahooIdsFromStatLines(doc)
  const out: PitchingLineNf3Row[] = []

  const firstStatLineSeen = new Set<string>()

  lines.forEach((pl, lineIndex) => {
    if (!pitchingLineHasStats(pl)) return
    const yid = (pl.yahooPlayerId ?? "").trim()
    if (!yid) return
    const teamName = teamForYahooPlayerId(doc, yid) || inferPitcherTeamForNf3Line(doc, yid) || ""
    if (!teamName) return

    const hit = resolveNpbForPitcherLine(roster, doc, pl)
    const npb = hit?.npbPlayerId ?? null

    const isTeamStarter = starters.has(yid)
    const isFirstStat = !firstStatLineSeen.has(yid)
    if (isFirstStat) firstStatLineSeen.add(yid)

    const isStarterStint = isTeamStarter && isFirstStat
    const isReliefStint = !isStarterStint

    const h = pl.h ?? 0
    const bb = pl.bb ?? 0
    const hbp = pl.hbp ?? 0
    const nhbEligible = isReliefStint && h + bb + hbp === 0

    out.push({
      gameId,
      lineIndex,
      yahooPlayerId: yid,
      playerName: pl.playerName,
      npbPlayerId: npb,
      teamName,
      isStarterStint,
      isReliefStint,
      ipOuts: ipToOuts(pl.ip),
      bf: pl.bf ?? 0,
      h,
      bb,
      hbp,
      r: pl.r ?? 0,
      nhbEligible,
    })
  })

  return out
}

export type StarterRunSupportRow = {
  gameId: string
  yahooPlayerId: string
  playerName: string
  npbPlayerId: string | null
  teamName: string
  runSupportPoints: number | null
  ipOuts: number
}

/** 先発ごとに援護点（1 試合あたり最大 1 行） */
export function extractRunSupportForStarters(
  doc: CanonicalGameDocument,
  roster: RosterRow[],
  gameId: string
): StarterRunSupportRow[] {
  const lines = doc.domain?.pitchingLines ?? []
  const starters = collectStartersYahooIdsFromStatLines(doc)
  const seen = new Set<string>()
  const out: StarterRunSupportRow[] = []

  for (const pl of lines) {
    if (!pitchingLineHasStats(pl)) continue
    const yid = (pl.yahooPlayerId ?? "").trim()
    if (!yid || !starters.has(yid)) continue
    if (seen.has(yid)) continue
    seen.add(yid)

    const teamName = teamForYahooPlayerId(doc, yid)
    if (!teamName) continue
    const hit = resolveNpbForPitcherLine(roster, doc, pl)
    const rs = runSupportPointsForStarter(doc, yid, teamName)

    out.push({
      gameId,
      yahooPlayerId: yid,
      playerName: pl.playerName,
      npbPlayerId: hit?.npbPlayerId ?? null,
      teamName,
      runSupportPoints: rs,
      ipOuts: ipToOuts(pl.ip),
    })
  }
  return out
}
