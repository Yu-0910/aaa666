import type { TopProbablesCard } from "@/lib/probables/types"

export function isRakutenLotteCard(card: TopProbablesCard): boolean {
  const codes = new Set(card.teamCodes)
  return codes.has("E") && codes.has("M")
}
