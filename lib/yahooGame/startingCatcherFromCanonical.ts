/**
 * Phase 6: スタメンの守備位置「捕」から、その試合の先発捕手の Yahoo ID を返す。
 * 代走・捕手交替の追跡は phase24（activeCatcherFromCanonical）を参照。
 */

import { normalizeTeamShort } from "../stadiumInferFromCanonical"
import { parsePregameInfoFromTextPbp } from "./inferTeamsFromTextPbp"
import type { CanonicalGameDocument } from "./types"

/** scoreboard / 試合前情報 / teams から先攻・後攻のチーム名を解決 */
function resolveVisitorHomeTeamNames(
  doc: CanonicalGameDocument,
): { visitor: string; home: string } | null {
  const board = doc.game?.scoreboard ?? []
  if (board.length >= 2) {
    const visitor = (board[0]?.teamName ?? "").trim()
    const home = (board[1]?.teamName ?? "").trim()
    if (visitor && home) return { visitor, home }
  }
  const pre = parsePregameInfoFromTextPbp(doc)
  if (pre?.visitorFullName && pre?.homeFullName) {
    return { visitor: pre.visitorFullName.trim(), home: pre.homeFullName.trim() }
  }
  const teams = doc.game?.teams ?? []
  if (teams.length >= 2) {
    const visitor = (teams[0]?.teamName ?? "").trim()
    const home = (teams[1]?.teamName ?? "").trim()
    if (visitor && home) return { visitor, home }
  }
  return null
}

/**
 * イニングの表／裏から「守備側」のチーム名を返す。
 * scoreboard が空でも試合前情報・game.teams から先攻/後攻を推定する（Phase13/Phase6 と同型）。
 * 表＝先攻の攻撃 → 後攻が守備、裏＝後攻の攻撃 → 先攻が守備。
 */
export function fieldingTeamNameFromInningHalf(
  doc: CanonicalGameDocument,
  inningHalf: string
): string | null {
  const m = (inningHalf ?? "").match(/(表|裏)/)
  if (!m) return null
  const pair = resolveVisitorHomeTeamNames(doc)
  if (!pair) return null
  return m[1] === "表" ? pair.home : pair.visitor
}

function normalizeTeamHint(h: string): string {
  return (h ?? "").trim()
}

function teamMatchTokens(name: string): string[] {
  const raw = normalizeTeamHint(name)
  if (!raw) return []
  const tokens = new Set<string>()
  tokens.add(raw.replace(/\s+/g, ""))
  const short = normalizeTeamShort(raw)
  if (short) tokens.add(short)
  return [...tokens]
}

/** チーム名のゆるい一致（「広島」と「広島東洋カープ」、「巨人」と「読売ジャイアンツ」等） */
export function teamsRoughlyMatch(teamName: string, hint: string): boolean {
  const keysA = teamMatchTokens(teamName)
  const keysB = teamMatchTokens(hint)
  if (keysA.length === 0 || keysB.length === 0) return false
  for (const a of keysA) {
    for (const b of keysB) {
      if (a === b) return true
      if (a.includes(b) || b.includes(a)) return true
    }
  }
  return false
}

export function getStartingCatcherForTeam(
  doc: CanonicalGameDocument,
  pitcherTeamName: string
): { yahooPlayerId: string; playerName: string } | null {
  const hint = normalizeTeamHint(pitcherTeamName)
  if (!hint) return null
  for (const t of doc.game.teams) {
    if (!teamsRoughlyMatch(t.teamName, hint)) continue
    for (const p of t.startingLineup) {
      const pos = (p.fieldingPosition ?? "").trim()
      if (pos === "捕" || pos.startsWith("捕")) {
        const id = (p.yahooPlayerId ?? "").trim()
        if (!id) continue
        return { yahooPlayerId: id, playerName: (p.playerName ?? "").trim() || id }
      }
    }
  }
  return null
}
