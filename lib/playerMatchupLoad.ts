import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import { PLAYER_MATCHUP_SCHEMA_VERSION } from "@/lib/playerMatchupTypes"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"

function matchupCategory(role: "batter" | "pitcher"): string {
  return role === "batter" ? "player_matchup_batting" : "player_matchup_pitching"
}

function parsePlayerMatchupDerived(
  j: PlayerMatchupDerived | null,
  npbPlayerId: string,
  role: "batter" | "pitcher",
): PlayerMatchupDerived | null {
  if (!j || j.schemaVersion !== PLAYER_MATCHUP_SCHEMA_VERSION) return null
  if (String(j.npbPlayerId ?? "").trim() !== String(npbPlayerId).trim()) return null
  if (j.role !== role) return null
  return j
}

export function loadPlayerMatchupFromRepo(
  year: string,
  npbPlayerId: string,
  role: "batter" | "pitcher",
): PlayerMatchupDerived | null {
  return parsePlayerMatchupDerived(
    loadDerivedNpbJsonSync<PlayerMatchupDerived>(matchupCategory(role), year, npbPlayerId),
    npbPlayerId,
    role,
  )
}

export async function loadPlayerMatchupFromRepoAsync(
  year: string,
  npbPlayerId: string,
  role: "batter" | "pitcher",
): Promise<PlayerMatchupDerived | null> {
  return parsePlayerMatchupDerived(
    await loadDerivedNpbJsonAsync<PlayerMatchupDerived>(
      matchupCategory(role),
      year,
      npbPlayerId,
    ),
    npbPlayerId,
    role,
  )
}
