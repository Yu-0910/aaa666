import type { BattingLine, CanonicalGameDocument } from "./types"
import { findNpbIdForYahooBatting, type RosterRow } from "./rosterCsv"

function teamForYahooPlayerId(canonical: CanonicalGameDocument, yahooId: string): string {
  for (const t of canonical.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

export type MatchedGameBatting = {
  line: BattingLine
  teamName: string
}

/**
 * canonical の打撃行から、名簿の npb_player_id に一致する1行を返す（Phase 5 個人ページ用）
 */
export function findBattingLineForNpbPlayer(
  canonical: CanonicalGameDocument,
  roster: RosterRow[],
  npbPlayerId: string
): MatchedGameBatting | null {
  const target = String(npbPlayerId).trim()
  if (!target) return null
  for (const b of canonical.domain.battingLines) {
    const teamHint = teamForYahooPlayerId(canonical, b.yahooPlayerId)
    const match = findNpbIdForYahooBatting(roster, b.playerName, teamHint)
    const pid = match?.npbPlayerId ?? ""
    if (pid === target) {
      return { line: b, teamName: match?.team ?? teamHint }
    }
  }
  return null
}
