import type { ScheduleDayGame, ThreeGameSeriesCard } from "@/lib/probables/types"
import { addDaysYmd } from "@/lib/probables/loadScheduleSnapshots"

export const MAX_PROBABLES_CARDS = 6

export function cardKeyFromTeamCodes(a: string, b: string): string {
  return [a, b].sort().join("-")
}

function isNextCalendarDay(prev: string, next: string): boolean {
  return addDaysYmd(prev, 1) === next
}

/** 同一 cardKey の試合を日付順に並べ、連続日かつ同じホーム/ビジター構成のカード系列を抽出 */
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
    if (dates.length < 2) continue

    let runStart = 0
    for (let i = 1; i <= dates.length; i++) {
      const prev = dates[i - 1]!
      const cur = dates[i]
      const prevGame = byDate.get(prev)!
      const curGame = cur ? byDate.get(cur)! : null
      const breaks =
        !cur ||
        !isNextCalendarDay(prev, cur) ||
        !curGame ||
        !sameHomeAwayPair(prevGame, curGame)
      if (!breaks) continue

      const runDates = dates.slice(runStart, i)
      const hasAdjacentSameMatchup =
        (runStart > 0 && isNextCalendarDay(dates[runStart - 1]!, runDates[0]!)) ||
        (i < dates.length && isNextCalendarDay(runDates[runDates.length - 1]!, dates[i]!))
      // 地方開催などでは同一カードが 2 試合だけになる。2 連戦も予想先発の
      // 表示対象にし、ホーム/ビジター入れ替わりで分断された場合は 1 試合カードも残す。
      // 3 試合以上は従来どおり 3 試合単位で扱う。
      if (runDates.length === 1 && hasAdjacentSameMatchup) {
        const soloGames = runDates.map((d) => byDate.get(d)!)
        const teamCodes = displayPairCodes(soloGames[0]!)
        cards.push({
          cardKey,
          teamCodes,
          seriesStart: runDates[0]!,
          seriesEnd: runDates[0]!,
          games: soloGames,
        })
      } else if (runDates.length === 2) {
        const duoGames = runDates.map((d) => byDate.get(d)!)
        const teamCodes = displayPairCodes(duoGames[0]!)
        cards.push({
          cardKey,
          teamCodes,
          seriesStart: runDates[0]!,
          seriesEnd: runDates[1]!,
          games: duoGames,
        })
      } else if (runDates.length >= 3) {
        for (let j = 0; j <= runDates.length - 3; j++) {
          const trio = runDates.slice(j, j + 3)
          if (!isConsecutiveDates(trio)) continue
          const trioGames = trio.map((d) => byDate.get(d)!)
          const teamCodes = displayPairCodes(trioGames[0]!)
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

function sameHomeAwayPair(a: ScheduleDayGame, b: ScheduleDayGame): boolean {
  return a.homeTeamCode === b.homeTeamCode && a.awayTeamCode === b.awayTeamCode
}

function displayPairCodes(g: ScheduleDayGame): [string, string] {
  return [g.awayTeamCode, g.homeTeamCode]
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

/**
 * 今日以降の試合が 1 つ以上残る系列のみ。
 *
 * 通常は直近 6 カードを基準に絞る。ただし同じ次回試合日のカードを途中で切ると
 * 同日開始の系列が一部だけ欠落するため、上限位置の日付グループはまとめて残す。
 * さらに直近表示カードがすべて残り 1 試合の状態では、翌カードへの切り替わりが
 * 見えるように次の日程グループをまとめて足す。
 */
export function pickRecentThreeGameSeriesCards(
  cards: readonly ThreeGameSeriesCard[],
  asOfDateJst: string,
  maxCards = MAX_PROBABLES_CARDS,
): ThreeGameSeriesCard[] {
  const windowEnd = probablesDisplayWindowEnd(asOfDateJst)
  const filtered = cards
    .filter((c) => {
      if (!c.games.some((g) => g.dateJst >= asOfDateJst)) return false
      // 火曜開始枠は日曜、金曜開始枠は翌水曜まで。次々カードを混在させない。
      return firstFutureGameDate(c, asOfDateJst) <= windowEnd
    })
    .sort((a, b) => {
      const aDate = firstFutureGameDate(a, asOfDateJst)
      const bDate = firstFutureGameDate(b, asOfDateJst)
      return aDate.localeCompare(bDate) || a.seriesStart.localeCompare(b.seriesStart) || a.cardKey.localeCompare(b.cardKey)
    })

  const basePicked = filtered.slice(0, maxCards)
  const cutoffDate = basePicked[basePicked.length - 1] && firstFutureGameDate(basePicked[basePicked.length - 1]!, asOfDateJst)
  let picked = cutoffDate
    ? filtered.filter((card, index) => index < maxCards || firstFutureGameDate(card, asOfDateJst) === cutoffDate)
    : basePicked
  picked = includeAdjacentSplitCards(picked, filtered)
  if (picked.length === 0 || !picked.every(card => card.games.filter(game => game.dateJst >= asOfDateJst).length === 1)) {
    return picked
  }
  const remaining = filtered.slice(picked.length)
  const nextDate = remaining[0] && firstFutureGameDate(remaining[0], asOfDateJst)
  if (!nextDate) return picked
  return [...picked, ...remaining.filter(card => firstFutureGameDate(card, asOfDateJst) === nextDate)]
}

function includeAdjacentSplitCards(
  picked: readonly ThreeGameSeriesCard[],
  filtered: readonly ThreeGameSeriesCard[],
): ThreeGameSeriesCard[] {
  const out = [...picked]
  const seen = new Set(out.map(seriesIdentity))
  let changed = true
  while (changed) {
    changed = false
    for (const card of filtered) {
      const id = seriesIdentity(card)
      if (seen.has(id)) continue
      if (!out.some((pickedCard) => isAdjacentSplitCard(pickedCard, card))) continue
      seen.add(id)
      out.push(card)
      changed = true
    }
  }
  const order = new Map(filtered.map((card, index) => [seriesIdentity(card), index]))
  return out.sort((a, b) => (order.get(seriesIdentity(a)) ?? 0) - (order.get(seriesIdentity(b)) ?? 0))
}

function isAdjacentSplitCard(a: ThreeGameSeriesCard, b: ThreeGameSeriesCard): boolean {
  if (a.cardKey !== b.cardKey) return false
  return addDaysYmd(a.seriesEnd, 1) === b.seriesStart || addDaysYmd(b.seriesEnd, 1) === a.seriesStart
}

function seriesIdentity(card: ThreeGameSeriesCard): string {
  return `${card.cardKey}:${card.seriesStart}:${card.seriesEnd}`
}

/**
 * 予想先発タブの表示編成枠の終端。
 * 火曜開始の枠は日曜、金曜開始の枠は翌水曜まで表示する。
 */
export function probablesDisplayWindowEnd(asOfDateJst: string): string {
  // Treat the supplied JST calendar date as a calendar date, without shifting it to the previous UTC day.
  const date = new Date(`${asOfDateJst}T00:00:00Z`)
  const weekday = date.getUTCDay()
  const sinceTuesday = (weekday - 2 + 7) % 7
  const sinceFriday = (weekday - 5 + 7) % 7
  const sinceStart = Math.min(sinceTuesday, sinceFriday)
  return addDaysYmd(asOfDateJst, 5 - sinceStart)
}

function firstFutureGameDate(card: ThreeGameSeriesCard, asOfDateJst: string): string {
  return (
    card.games
      .filter((g) => g.dateJst >= asOfDateJst)
      .map((g) => g.dateJst)
      .sort()[0] ?? card.seriesStart
  )
}
