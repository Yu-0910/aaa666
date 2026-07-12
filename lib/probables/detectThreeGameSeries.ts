import type { ScheduleDayGame, ThreeGameSeriesCard } from "@/lib/probables/types"
import { addDaysYmd } from "@/lib/probables/loadScheduleSnapshots"

export const MAX_PROBABLES_CARDS = 6

export function cardKeyFromTeamCodes(a: string, b: string): string {
  return [a, b].sort().join("-")
}

function isNextCalendarDay(prev: string, next: string): boolean {
  return addDaysYmd(prev, 1) === next
}

/** 同一 cardKey の試合を日付順に並べ、連続 3 日の三連戦系列を抽出 */
export function detectThreeGameSeriesFromGames(
  games: readonly ScheduleDayGame[],
): ThreeGameSeriesCard[] {
  const byKey = new Map<string, ScheduleDayGame[]>()
  for (const g of games) {
    const key = cardKeyFromTeamCodes(g.homeTeamCode, g.awayTeamCode)
    const list = byKey.get(key) ?? []
    list.push(g)
    byKey.set(key, list)
  }

  const cards: ThreeGameSeriesCard[] = []

  for (const [cardKey, list] of byKey) {
    const byDate = new Map<string, ScheduleDayGame>()
    for (const g of list) {
      if (!byDate.has(g.dateJst)) byDate.set(g.dateJst, g)
    }
    const dates = [...byDate.keys()].sort()
    if (dates.length < 3) continue

    let runStart = 0
    for (let i = 1; i <= dates.length; i++) {
      const prev = dates[i - 1]!
      const cur = dates[i]
      const breaks = !cur || !isNextCalendarDay(prev, cur)
      if (!breaks) continue

      const runDates = dates.slice(runStart, i)
      if (runDates.length >= 3) {
        for (let j = 0; j <= runDates.length - 3; j++) {
          const trio = runDates.slice(j, j + 3)
          if (!isConsecutiveDates(trio)) continue
          const trioGames = trio.map((d) => byDate.get(d)!)
          const teamCodes = sortedPairCodes(trioGames[0]!)
          cards.push({
            cardKey,
            teamCodes,
            seriesStart: trio[0]!,
            seriesEnd: trio[2]!,
            games: trioGames,
          })
        }
      }
      runStart = i
    }
  }

  return dedupeSeriesCards(cards)
}

function isConsecutiveDates(dates: string[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (!isNextCalendarDay(dates[i - 1]!, dates[i]!)) return false
  }
  return true
}

function sortedPairCodes(g: ScheduleDayGame): [string, string] {
  return [g.homeTeamCode, g.awayTeamCode].sort() as [string, string]
}

function dedupeSeriesCards(cards: ThreeGameSeriesCard[]): ThreeGameSeriesCard[] {
  const seen = new Set<string>()
  const out: ThreeGameSeriesCard[] = []
  for (const c of cards) {
    const id = `${c.cardKey}:${c.seriesStart}:${c.seriesEnd}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(c)
  }
  return out.sort((a, b) => a.seriesStart.localeCompare(b.seriesStart))
}

/** 今日以降の試合が 1 つ以上残る系列のみ。開始日昇順・最大 6 件 */
export function pickRecentThreeGameSeriesCards(
  cards: readonly ThreeGameSeriesCard[],
  asOfDateJst: string,
  maxCards = MAX_PROBABLES_CARDS,
): ThreeGameSeriesCard[] {
  const filtered = cards
    .filter((c) => c.games.some((g) => g.dateJst >= asOfDateJst))
    .sort((a, b) => {
      const aDate = firstFutureGameDate(a, asOfDateJst)
      const bDate = firstFutureGameDate(b, asOfDateJst)
      return aDate.localeCompare(bDate) || a.seriesStart.localeCompare(b.seriesStart) || a.cardKey.localeCompare(b.cardKey)
    })

  const selected = filtered.slice(0, maxCards)
  if (selected.length === 0) return selected

  const last = selected[selected.length - 1]!
  if (seriesFutureGameCount(last, asOfDateJst) === 1) {
    const next = filtered[selected.length]
    if (next) selected.push(next)
  }

  return selected
}

function seriesFutureGameCount(card: ThreeGameSeriesCard, asOfDateJst: string): number {
  return card.games.filter((g) => g.dateJst >= asOfDateJst).length
}

function firstFutureGameDate(card: ThreeGameSeriesCard, asOfDateJst: string): string {
  return (
    card.games
      .filter((g) => g.dateJst >= asOfDateJst)
      .map((g) => g.dateJst)
      .sort()[0] ?? card.seriesStart
  )
}
