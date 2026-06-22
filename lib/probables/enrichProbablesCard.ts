import { pitcherSeasonStatsFieldsFromPoc } from "@/lib/probables/formatPitcherSeasonStatsLine"
import { topOpponentBattersFromMatchup } from "@/lib/probables/topOpponentBattersFromMatchup"
import type { TopProbablesCard, TopProbablesPitcherSlot, TopProbablesSnapshot } from "@/lib/probables/types"
import { loadPitcherSeasonPocPayload } from "@/lib/pitcherSeasonPocLoad"

export function enrichProbablesPitcherSlot(
  projectRoot: string,
  year: string,
  slot: TopProbablesPitcherSlot | null,
  opponentTeamCode: string,
): TopProbablesPitcherSlot | null {
  if (!slot) return slot

  let next: TopProbablesPitcherSlot = { ...slot }

  if (slot.pitcherNpbId) {
    next.topOpponentBatters = topOpponentBattersFromMatchup(
      year,
      slot.pitcherNpbId,
      opponentTeamCode,
    )
    const poc = loadPitcherSeasonPocPayload(projectRoot, year, slot.pitcherNpbId)
    if (poc) {
      next = { ...next, ...pitcherSeasonStatsFieldsFromPoc(poc) }
    }
  }

  return next
}

/** 対戦成績タブ上位6人・今季投手成績を派生 JSON から補完 */
export function enrichProbablesCard(
  projectRoot: string,
  year: string,
  card: TopProbablesCard,
): TopProbablesCard {
  return {
    ...card,
    games: card.games.map((g) => ({
      ...g,
      homeProbable: enrichProbablesPitcherSlot(
        projectRoot,
        year,
        g.homeProbable,
        g.awayTeamCode,
      ),
      awayProbable: enrichProbablesPitcherSlot(
        projectRoot,
        year,
        g.awayProbable,
        g.homeTeamCode,
      ),
    })),
  }
}

export function enrichProbablesSnapshot(
  projectRoot: string,
  snapshot: TopProbablesSnapshot,
): TopProbablesSnapshot {
  return {
    ...snapshot,
    cards: snapshot.cards.map((card) => enrichProbablesCard(projectRoot, snapshot.seasonYear, card)),
  }
}
