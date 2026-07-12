import {
  findRosterPlayerByPublicId,
  getNpbRoster2026,
  rosterJaNameLookupKeys,
  type NpbRosterPlayer,
} from "@/lib/npbRoster"
import { rosterNameMatchKey } from "@/lib/playerNameNormalize"

export type ResolvedPitcher = {
  pitcherNpbId: string
  pitcherPublicId: string
  pitcherNameJa: string
}

function isPitcherPosition(position: string): boolean {
  return String(position ?? "").includes("投")
}

function pitcherAliasKeys(nameJa: string): string[] {
  const normalized = String(nameJa ?? "").trim()
  const compact = rosterNameMatchKey(normalized)
  const withoutInitial = compact
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.．]/u, "")
  const surname = normalized.match(/^[^\s\u3000]+/)?.[0] ?? compact
  const spaced = normalized.match(/^([^\s\u3000]+)[\s\u3000]+([^\s\u3000])/)
  const familyGivenInitial = spaced ? rosterNameMatchKey(`${spaced[1]}${spaced[2]}`) : ""

  return [...new Set([compact, withoutInitial, rosterNameMatchKey(surname), familyGivenInitial].filter(Boolean))]
}

function resolvePitcherFromTeamRoster(name: string, teamCode: string): NpbRosterPlayer | null {
  const inputKey = rosterNameMatchKey(name)
  const candidates = getNpbRoster2026().filter(
    (player) => player.team_code === teamCode && isPitcherPosition(player.position),
  )

  return (
    candidates.find((player) => rosterNameMatchKey(player.name_ja) === inputKey) ??
    candidates.find((player) => rosterJaNameLookupKeys(player.name_ja).includes(inputKey)) ??
    candidates.find((player) => pitcherAliasKeys(player.name_ja).includes(inputKey)) ??
    null
  )
}

/** 投手名 + 球団コードから名簿を解決 */
export function resolvePitcherFromRoster(
  pitcherNameJa: string | null | undefined,
  teamCode: string,
): ResolvedPitcher | null {
  const name = String(pitcherNameJa ?? "").trim()
  const code = String(teamCode ?? "").trim()
  if (!name || !code) return null

  const player = findRosterPlayerByPublicId(name) ?? resolvePitcherFromTeamRoster(name, code)
  if (!player || player.team_code !== code || !isPitcherPosition(player.position)) {
    return null
  }

  return {
    pitcherNpbId: player.npb_player_id,
    pitcherPublicId: player.npb_player_id,
    pitcherNameJa: player.name_ja.replace(/\s+/g, ""),
  }
}
