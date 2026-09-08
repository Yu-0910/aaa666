/**
 * 三連戦検出 + top-probables ビルドの単体検証
 */
import assert from "node:assert/strict"
import {
  cardKeyFromTeamCodes,
  detectThreeGameSeriesFromGames,
  pickRecentThreeGameSeriesCards,
  probablesDisplayWindowEnd,
} from "@/lib/probables/detectThreeGameSeries"
import type { ScheduleDayGame } from "@/lib/probables/types"

assert.equal(cardKeyFromTeamCodes("H", "Bs"), "Bs-H")

const games: ScheduleDayGame[] = [
  { dateJst: "2026-06-19", gameId: "g1", homeTeamCode: "DB", awayTeamCode: "H" },
  { dateJst: "2026-06-20", gameId: "g2", homeTeamCode: "DB", awayTeamCode: "H" },
  { dateJst: "2026-06-21", gameId: "g3", homeTeamCode: "H", awayTeamCode: "DB" },
  { dateJst: "2026-06-22", gameId: "g4", homeTeamCode: "G", awayTeamCode: "D" },
  { dateJst: "2026-06-23", gameId: "g5", homeTeamCode: "G", awayTeamCode: "D" },
  { dateJst: "2026-06-24", gameId: "g6", homeTeamCode: "D", awayTeamCode: "G" },
]

const series = detectThreeGameSeriesFromGames(games)
assert.ok(series.length >= 2, `expected >=2 series, got ${series.length}`)

const dbH = series.find((s) => s.cardKey === "DB-H")
assert.ok(dbH, "DB-H series")
assert.equal(dbH!.games.length, 3)
assert.equal(dbH!.seriesStart, "2026-06-19")

const picked = pickRecentThreeGameSeriesCards(series, "2026-06-19", 6)
assert.ok(picked.length >= 1)

const twoGameAndNextCardGames: ScheduleDayGame[] = [
  { dateJst: "2026-09-04", gameId: "a1", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-09-05", gameId: "a2", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-09-06", gameId: "a3", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-09-05", gameId: "b1", homeTeamCode: "H", awayTeamCode: "DB" },
  { dateJst: "2026-09-06", gameId: "b2", homeTeamCode: "H", awayTeamCode: "DB" },
  { dateJst: "2026-09-08", gameId: "c1", homeTeamCode: "Bs", awayTeamCode: "L" },
  { dateJst: "2026-09-09", gameId: "c2", homeTeamCode: "Bs", awayTeamCode: "L" },
  { dateJst: "2026-09-10", gameId: "c3", homeTeamCode: "Bs", awayTeamCode: "L" },
]

const cardsWithTwoGameSeries = detectThreeGameSeriesFromGames(twoGameAndNextCardGames)
const hanshinDeNA = cardsWithTwoGameSeries.find((s) => s.cardKey === "DB-H")
assert.ok(hanshinDeNA, "two-game DB-H series")
assert.equal(hanshinDeNA!.games.length, 2)

assert.equal(probablesDisplayWindowEnd("2026-09-04"), "2026-09-09")
assert.equal(probablesDisplayWindowEnd("2026-09-05"), "2026-09-09")
assert.equal(probablesDisplayWindowEnd("2026-09-06"), "2026-09-09")
assert.equal(probablesDisplayWindowEnd("2026-09-08"), "2026-09-13")

const pickedWithinTuesdayWindow = pickRecentThreeGameSeriesCards(cardsWithTwoGameSeries, "2026-09-04", 6)
assert.deepEqual(
  pickedWithinTuesdayWindow.map((s) => `${s.cardKey}:${s.seriesStart}`),
  ["G-H:2026-09-04", "DB-H:2026-09-05", "Bs-L:2026-09-08"],
)

// A full six-card slate must not crowd out next Tuesday when Sunday is all that remains.
const fullSlate = Array.from({ length: 6 }, (_, i) => ({
  ...cardsWithTwoGameSeries[0]!, cardKey: `current-${i}`,
  seriesStart: "2026-09-04", seriesEnd: "2026-09-06",
  games: ["2026-09-04", "2026-09-05", "2026-09-06"].map(dateJst => ({
    dateJst, gameId: `${i}-${dateJst}`, homeTeamCode: "G", awayTeamCode: "H",
  })),
}))
const nextSlate = fullSlate.map((card, i) => ({
  ...card, cardKey: `next-${i}`, seriesStart: "2026-09-08", seriesEnd: "2026-09-10",
  games: ["2026-09-08", "2026-09-09", "2026-09-10"].map(dateJst => ({
    dateJst, gameId: `next-${i}-${dateJst}`, homeTeamCode: "G", awayTeamCode: "H",
  })),
}))
assert.equal(pickRecentThreeGameSeriesCards([...fullSlate, ...nextSlate], "2026-09-05").length, 6)
assert.equal(pickRecentThreeGameSeriesCards([...fullSlate, ...nextSlate], "2026-09-06").length, 12)
assert.equal(pickRecentThreeGameSeriesCards([...fullSlate, ...nextSlate], "2026-09-08").length, 6)

console.log("[validate:probables-series-detect] OK")
