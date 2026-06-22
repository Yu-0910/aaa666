import { findRosterPlayerByPublicId } from "@/lib/npbRoster"

export type ResolvedPitcher = {
  pitcherNpbId: string
  pitcherPublicId: string
  pitcherNameJa: string
}

function isPitcherPosition(position: string): boolean {
  return String(position ?? "").includes("投")
}

/** 投手名 + 球団コードから名簿を解決 */
export function resolvePitcherFromRoster(
  pitcherNameJa: string | null | undefined,
  teamCode: string,
): ResolvedPitcher | null {
  const name = String(pitcherNameJa ?? "").trim()
  const code = String(teamCode ?? "").trim()
  if (!name || !code) return null

  const player = findRosterPlayerByPublicId(name)
  if (!player || player.team_code !== code || !isPitcherPosition(player.position)) {
    return null
  }

  return {
    pitcherNpbId: player.npb_player_id,
    pitcherPublicId: player.npb_player_id,
    pitcherNameJa: player.name_ja.replace(/\s+/g, ""),
  }
}
