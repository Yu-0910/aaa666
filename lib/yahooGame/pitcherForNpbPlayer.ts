import type { CanonicalGameDocument, PitchingLine } from "./types"
import { findNpbIdForYahooBatting, type RosterRow } from "./rosterCsv"
import { loadCanonicalGameDocument } from "./loadCanonicalGame"

/** Phase 6 PoC: canonical が無い試合・または照合失敗時の Yahoo 投手ID（fetch_game_pitch_types 出力と対応） */
const YAHOO_PITCHER_ID_OVERRIDES: Record<string, Record<string, string>> = {
  "2021040084": { "71175132": "2103788" },
}

function teamForYahooPlayerId(canonical: CanonicalGameDocument, yahooId: string): string {
  for (const t of canonical.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

export type MatchedGamePitching = {
  line: PitchingLine
  teamName: string
}

/**
 * canonical の投球行から、名簿の npb_player_id に一致する1行を返す（Phase 6）
 */
export function findPitchingLineForNpbPlayer(
  canonical: CanonicalGameDocument,
  roster: RosterRow[],
  npbPlayerId: string
): MatchedGamePitching | null {
  const target = String(npbPlayerId).trim()
  if (!target) return null
  for (const p of canonical.domain.pitchingLines) {
    const teamHint = teamForYahooPlayerId(canonical, p.yahooPlayerId)
    const match = findNpbIdForYahooBatting(roster, p.playerName, teamHint)
    const pid = match?.npbPlayerId ?? ""
    if (pid === target) {
      return { line: p, teamName: match?.team ?? teamHint }
    }
  }
  return null
}

/**
 * 試合ID + NPB選手ID → Yahoo 投手ID（canonical 照合 → なければ PoC オーバーライド）
 */
export function resolveYahooPitcherIdForGame(
  projectRoot: string,
  gameId: string,
  npbPlayerId: string,
  roster: RosterRow[]
): string | null {
  const gid = String(gameId).trim()
  const npb = String(npbPlayerId).trim()
  if (!gid || !npb) return null

  const canonical = loadCanonicalGameDocument(projectRoot, gid)
  if (canonical) {
    const hit = findPitchingLineForNpbPlayer(canonical, roster, npb)
    if (hit) return hit.line.yahooPlayerId.trim()
  }

  const override = YAHOO_PITCHER_ID_OVERRIDES[gid]?.[npb]
  return override?.trim() || null
}
