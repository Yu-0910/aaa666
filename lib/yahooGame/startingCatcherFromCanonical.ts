/**
 * Phase 6: スタメンの守備位置「捕」から、その試合の先発捕手の Yahoo ID を返す。
 * 代走・捕手交替は canonical に無い限り追えない（PoC は先発固定）。
 */

import type { CanonicalGameDocument } from "./types"

/**
 * イニングの表／裏から「守備側」のチーム名を返す。
 * Yahoo canonical の scoreboard は [0]=先攻（ビジター）,[1]=後攻（ホーム）とみなす。
 * 表＝先攻の攻撃 → 後攻が守備、裏＝後攻の攻撃 → 先攻が守備。
 */
export function fieldingTeamNameFromInningHalf(
  doc: CanonicalGameDocument,
  inningHalf: string
): string | null {
  const m = (inningHalf ?? "").match(/(表|裏)/)
  if (!m) return null
  const board = doc.game.scoreboard ?? []
  if (board.length < 2) return null
  const visitor = (board[0].teamName ?? "").trim()
  const home = (board[1].teamName ?? "").trim()
  if (!visitor || !home) return null
  return m[1] === "表" ? home : visitor
}

function normalizeTeamHint(h: string): string {
  return (h ?? "").trim()
}

/** チーム名のゆるい一致（「広島」と「広島東洋カープ」等） */
export function teamsRoughlyMatch(teamName: string, hint: string): boolean {
  const a = normalizeTeamHint(teamName)
  const b = normalizeTeamHint(hint)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
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
