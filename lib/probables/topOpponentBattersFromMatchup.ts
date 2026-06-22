import { loadPlayerMatchupFromRepo } from "@/lib/playerMatchupLoad"
import { compareMatchupOpponentsByOpsDesc } from "@/lib/playerMatchupSeasonTab"
import type { TopProbablesOpponentBatter } from "@/lib/probables/types"

const TOP_N = 6

export function topOpponentBattersFromMatchup(
  year: string,
  pitcherNpbId: string,
  opponentTeamCode: string,
): TopProbablesOpponentBatter[] {
  const derived = loadPlayerMatchupFromRepo(year, pitcherNpbId, "pitcher")
  if (!derived) return []

  const block = derived.teams.find((t) => t.teamCode === opponentTeamCode)
  if (!block) return []

  return [...block.opponents]
    .filter((o) => o.ab >= 1)
    .sort(compareMatchupOpponentsByOpsDesc)
    .slice(0, TOP_N)
    .map((o) => ({
      opponentName: o.opponentName,
      opponentPublicId: o.opponentPublicId || null,
      ops: o.ops,
      avg: o.avg,
      hr: o.hr,
      ab: o.ab,
    }))
}
