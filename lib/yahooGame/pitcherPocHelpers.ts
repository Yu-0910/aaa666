/**
 * Phase 1 / Phase 6 共通: canonical の打席並び・NPB 解決
 */

import type { CanonicalGameDocument, PitchingLine, PlateAppearance } from "./types"
import { findNpbIdForYahooBatting, type RosterRow } from "./rosterCsv"
import { MANUAL_YAHOO_TO_NPB } from "../yahooNpbBatterIdMap.manual"

export function teamForYahooPlayerId(canonical: CanonicalGameDocument, yahooId: string): string {
  for (const t of canonical.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

/**
 * この打席でマウンドにいた投手の所属チーム（防御側）。
 * スタメンに無い救援投手は、表/裏からビジター/ホームを推定する。
 */
export function inferPitcherTeamFromPlateAppearance(
  doc: CanonicalGameDocument,
  yahooPitcherId: string,
  pa: PlateAppearance
): string | null {
  const yid = (yahooPitcherId ?? "").trim()
  if (!yid) return null
  const fromLineup = teamForYahooPlayerId(doc, yid)
  if (fromLineup) return fromLineup

  const board = doc.game?.scoreboard ?? []
  const visitor =
    (board[0]?.teamName ?? "").trim() ||
    (doc.game?.teams?.[0]?.teamName ?? "").trim()
  const home =
    (board[1]?.teamName ?? "").trim() ||
    (doc.game?.teams?.[1]?.teamName ?? "").trim()
  if (!visitor || !home) return null

  let half: number | null = null
  const parsed = parsePaId(pa.paId)
  if (parsed && (parsed.half === 0 || parsed.half === 1)) {
    half = parsed.half
  } else {
    const ih = pa.inningHalf ?? ""
    const m = ih.match(/(\d+)回(表|裏)/)
    if (m) half = m[2] === "表" ? 0 : 1
  }
  if (half === null) return null
  // 表: ビジター攻撃 → ホームが守備（投手） / 裏: ホーム攻撃 → ビジターが守備
  return half === 0 ? home : visitor
}

/**
 * 投球成績行の投手の所属チーム。スタメンに無い救援は、同試合の打席ログから推定する。
 * （`teamForYahooPlayerId` のみだと救援行が丸ごと落ち IPR/NHB が集計されない原因になる）
 */
export function inferPitcherTeamForNf3Line(
  doc: CanonicalGameDocument,
  yahooPlayerId: string
): string | null {
  const yid = (yahooPlayerId ?? "").trim()
  if (!yid) return null
  const fromLineup = teamForYahooPlayerId(doc, yid)
  if (fromLineup) return fromLineup

  const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
  for (const pa of pas) {
    if ((pa.yahooPitcherId ?? "").trim() !== yid) continue
    const t = inferPitcherTeamFromPlateAppearance(doc, yid, pa)
    if (t) return t
  }
  return null
}

export function resolveNpbForPitcherLine(
  roster: RosterRow[],
  canonical: CanonicalGameDocument,
  line: PitchingLine
): { npbPlayerId: string; team: string } | null {
  const yid = (line.yahooPlayerId ?? "").trim()
  if (!yid) return null
  const hint =
    teamForYahooPlayerId(canonical, yid) ||
    inferPitcherTeamForNf3Line(canonical, yid) ||
    ""
  const m = findNpbIdForYahooBatting(roster, line.playerName, hint)
  if (m?.npbPlayerId) return { npbPlayerId: m.npbPlayerId, team: m.team }

  // 外国籍投手などで canonical 側の表示名（例: "メヒア"）と名簿の表記（例: "Ｈ．メヒア"）が一致せず
  // name ベース照合が外れることがある。Yahoo 数値IDが分かっている場合は手動マップで救済する。
  const npbFromManual = /^\d+$/.test(yid) ? MANUAL_YAHOO_TO_NPB[yid] : undefined
  if (!npbFromManual) return null
  const hit = roster.find((r) => r.npbPlayerId === npbFromManual)
  return { npbPlayerId: npbFromManual, team: hit?.team ?? "" }
}

export function comparePlateAppearances(a: PlateAppearance, b: PlateAppearance): number {
  const pa = parsePaId(a.paId)
  const pb = parsePaId(b.paId)
  if (pa && pb) {
    if (pa.inning !== pb.inning) return pa.inning - pb.inning
    if (pa.half !== pb.half) return pa.half - pb.half
    return pa.seq - pb.seq
  }
  return (a.paId ?? "").localeCompare(b.paId ?? "")
}

export function parsePaId(paId: string): { inning: number; half: number; seq: number } | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parseInt(parts[parts.length - 3], 10)
  const halfStr = parts[parts.length - 2]
  const seq = parseInt(parts[parts.length - 1], 10)
  if (!Number.isFinite(inning) || !Number.isFinite(seq)) return null
  const half = halfStr === "表" ? 0 : halfStr === "裏" ? 1 : 9
  return { inning, half, seq }
}

export function npbForYahooPitcher(
  roster: RosterRow[],
  doc: CanonicalGameDocument,
  yahooPitcherId: string
): string | null {
  const fakeLine: PitchingLine = {
    yahooPlayerId: yahooPitcherId,
    playerName: "",
    inferredFrom: "placeholder",
  }
  for (const pl of doc.domain?.pitchingLines ?? []) {
    if ((pl.yahooPlayerId ?? "").trim() !== yahooPitcherId) continue
    fakeLine.playerName = pl.playerName
    break
  }
  if (!fakeLine.playerName) return null
  const hit = resolveNpbForPitcherLine(roster, doc, fakeLine)
  return hit?.npbPlayerId ?? null
}
