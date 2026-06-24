import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import { loadPlayerMatchupFromRepo, loadPlayerMatchupFromRepoAsync } from "@/lib/playerMatchupLoad"
import { compareMatchupOpponentsByOpsDesc } from "@/lib/playerMatchupSeasonTab"
import type { TopProbablesOpponentBatter } from "@/lib/probables/types"

const TOP_N = 6

function topOpponentBattersFromDerived(
  derived: PlayerMatchupDerived | null,
  opponentTeamCode: string,
): TopProbablesOpponentBatter[] {
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

/** 派生 JSON 未取得時は静的 JSON の既存値を維持（本番 Vercel 向け） */
export function pickTopOpponentBatters(
  fresh: TopProbablesOpponentBatter[],
  existing: TopProbablesOpponentBatter[] | undefined,
): TopProbablesOpponentBatter[] {
  return fresh.length > 0 ? fresh : (existing ?? [])
}

export function topOpponentBattersFromMatchup(
  year: string,
  pitcherNpbId: string,
  opponentTeamCode: string,
): TopProbablesOpponentBatter[] {
  return topOpponentBattersFromDerived(
    loadPlayerMatchupFromRepo(year, pitcherNpbId, "pitcher"),
    opponentTeamCode,
  )
}

export async function topOpponentBattersFromMatchupAsync(
  year: string,
  pitcherNpbId: string,
  opponentTeamCode: string,
): Promise<TopProbablesOpponentBatter[]> {
  return topOpponentBattersFromDerived(
    await loadPlayerMatchupFromRepoAsync(year, pitcherNpbId, "pitcher"),
    opponentTeamCode,
  )
}
