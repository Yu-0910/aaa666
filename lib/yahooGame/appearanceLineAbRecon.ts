/**
 * 出場成績: 成績表の打数列（battingLines.ab）と末尾スロットから数えた打数の突合。
 */
import { extractAppearanceStatSlotsFromCells } from "./appearanceStatsTrailingCells"
import { isAtBat } from "./resultJaHitBases"
import type { BattingLine, CanonicalGameDocument } from "./types"

export function appearanceSlotsForBatterInDoc(
  doc: CanonicalGameDocument,
  yahooId: string,
): string[] {
  const bid = String(yahooId ?? "").trim()
  if (!bid) return []
  const out: string[] = []
  for (const line of doc.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() !== bid) continue
    const s = line.appearancePaSlotsJa
    if (Array.isArray(s) && s.some((c) => String(c ?? "").trim() !== "")) {
      for (const x of s) out.push(String(x ?? "").trim())
      return out
    }
  }
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    if (String(row.yahooPlayerId ?? "").trim() !== bid) continue
    return extractAppearanceStatSlotsFromCells(row.cells ?? [])
  }
  return []
}

export function countAtBatsFromAppearanceSlotTexts(slots: readonly string[]): number {
  let n = 0
  for (const raw of slots) {
    const t = String(raw ?? "").trim()
    if (!t) continue
    if (isAtBat(t)) n += 1
  }
  return n
}

export function lineAbForBatterInDoc(doc: CanonicalGameDocument, yahooId: string): number {
  let s = 0
  for (const line of doc.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() !== yahooId) continue
    s += line.ab ?? 0
  }
  return s
}

export type AppearanceLineAbMismatch = {
  gameId: string
  dateYmd: string | null
  yahooBatterId: string
  playerName: string
  lineAb: number
  slotsAb: number
  diff: number
}

export function findAppearanceLineAbMismatchesInDoc(
  doc: CanonicalGameDocument,
  dateYmd: string | null,
): AppearanceLineAbMismatch[] {
  const gameId = String(doc.gameId ?? "").trim()
  const out: AppearanceLineAbMismatch[] = []
  const seen = new Set<string>()

  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid || seen.has(bid)) continue
    seen.add(bid)
    const lineAb = line.ab ?? 0
    const slotsAb = countAtBatsFromAppearanceSlotTexts(appearanceSlotsForBatterInDoc(doc, bid))
    if (lineAb === slotsAb) continue
    out.push({
      gameId,
      dateYmd,
      yahooBatterId: bid,
      playerName: String(line.playerName ?? ""),
      lineAb,
      slotsAb,
      diff: lineAb - slotsAb,
    })
  }
  return out
}
