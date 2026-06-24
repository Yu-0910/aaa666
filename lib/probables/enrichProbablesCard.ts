import { pitcherSeasonStatsFieldsFromPoc } from "@/lib/probables/formatPitcherSeasonStatsLine"
import {
  pickTopOpponentBatters,
  topOpponentBattersFromMatchup,
  topOpponentBattersFromMatchupAsync,
} from "@/lib/probables/topOpponentBattersFromMatchup"
import type { TopProbablesCard, TopProbablesPitcherSlot, TopProbablesSnapshot } from "@/lib/probables/types"
import {
  loadPitcherSeasonPocPayload,
  loadPitcherSeasonPocPayloadFromRepoAsync,
} from "@/lib/pitcherSeasonPocLoad"

export function enrichProbablesPitcherSlot(
  projectRoot: string,
  year: string,
  slot: TopProbablesPitcherSlot | null,
  opponentTeamCode: string,
): TopProbablesPitcherSlot | null {
  if (!slot) return slot

  let next: TopProbablesPitcherSlot = { ...slot }

  if (slot.pitcherNpbId) {
    next.topOpponentBatters = pickTopOpponentBatters(
      topOpponentBattersFromMatchup(year, slot.pitcherNpbId, opponentTeamCode),
      slot.topOpponentBatters,
    )
    const poc = loadPitcherSeasonPocPayload(projectRoot, year, slot.pitcherNpbId)
    if (poc) {
      next = { ...next, ...pitcherSeasonStatsFieldsFromPoc(poc) }
    }
  }

  return next
}

export async function enrichProbablesPitcherSlotAsync(
  projectRoot: string,
  year: string,
  slot: TopProbablesPitcherSlot | null,
  opponentTeamCode: string,
): Promise<TopProbablesPitcherSlot | null> {
  if (!slot) return slot

  let next: TopProbablesPitcherSlot = { ...slot }

  if (slot.pitcherNpbId) {
    next.topOpponentBatters = pickTopOpponentBatters(
      await topOpponentBattersFromMatchupAsync(year, slot.pitcherNpbId, opponentTeamCode),
      slot.topOpponentBatters,
    )
    const poc = await loadPitcherSeasonPocPayloadFromRepoAsync(year, slot.pitcherNpbId)
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

export async function enrichProbablesCardAsync(
  projectRoot: string,
  year: string,
  card: TopProbablesCard,
): Promise<TopProbablesCard> {
  const games = await Promise.all(
    card.games.map(async (g) => ({
      ...g,
      homeProbable: await enrichProbablesPitcherSlotAsync(
        projectRoot,
        year,
        g.homeProbable,
        g.awayTeamCode,
      ),
      awayProbable: await enrichProbablesPitcherSlotAsync(
        projectRoot,
        year,
        g.awayProbable,
        g.homeTeamCode,
      ),
    })),
  )
  return { ...card, games }
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

export async function enrichProbablesSnapshotAsync(
  projectRoot: string,
  snapshot: TopProbablesSnapshot,
): Promise<TopProbablesSnapshot> {
  const cards = await Promise.all(
    snapshot.cards.map((card) => enrichProbablesCardAsync(projectRoot, snapshot.seasonYear, card)),
  )
  return { ...snapshot, cards }
}
