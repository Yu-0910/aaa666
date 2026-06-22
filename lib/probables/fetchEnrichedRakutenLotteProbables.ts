import type { TopProbablesCard, TopProbablesSnapshot } from "@/lib/probables/types"
import { isRakutenLotteCard } from "@/lib/probables/isRakutenLotteCard"

export async function fetchEnrichedRakutenLotteCard(
  year: string | number,
): Promise<TopProbablesCard | null> {
  try {
    const res = await fetch(`/api/top-probables/enrich-rakuten-lotte?year=${year}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as TopProbablesCard
  } catch {
    return null
  }
}

export async function enrichSnapshotRakutenLotte(
  snapshot: TopProbablesSnapshot,
): Promise<TopProbablesSnapshot> {
  if (!snapshot.cards.some(isRakutenLotteCard)) return snapshot

  const enriched = await fetchEnrichedRakutenLotteCard(snapshot.seasonYear)
  if (!enriched) return snapshot

  return {
    ...snapshot,
    cards: snapshot.cards.map((card) => (isRakutenLotteCard(card) ? enriched : card)),
  }
}
