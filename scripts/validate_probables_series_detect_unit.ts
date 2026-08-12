/**
 * 三連戦検出 + top-probables ビルドの単体検証
 */
import assert from "node:assert/strict"
import {
  cardKeyFromTeamCodes,
  detectThreeGameSeriesFromGames,
  pickRecentThreeGameSeriesCards,
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

const lastGameAndNextSeriesGames: ScheduleDayGame[] = [
  { dateJst: "2026-08-11", gameId: "a1", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-08-12", gameId: "a2", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-08-13", gameId: "a3", homeTeamCode: "G", awayTeamCode: "H" },
  { dateJst: "2026-08-11", gameId: "b1", homeTeamCode: "D", awayTeamCode: "DB" },
  { dateJst: "2026-08-12", gameId: "b2", homeTeamCode: "D", awayTeamCode: "DB" },
  { dateJst: "2026-08-13", gameId: "b3", homeTeamCode: "D", awayTeamCode: "DB" },
  { dateJst: "2026-08-14", gameId: "c1", homeTeamCode: "G", awayTeamCode: "D" },
  { dateJst: "2026-08-15", gameId: "c2", homeTeamCode: "G", awayTeamCode: "D" },
  { dateJst: "2026-08-16", gameId: "c3", homeTeamCode: "D", awayTeamCode: "G" },
  { dateJst: "2026-08-14", gameId: "d1", homeTeamCode: "H", awayTeamCode: "DB" },
  { dateJst: "2026-08-15", gameId: "d2", homeTeamCode: "H", awayTeamCode: "DB" },
  { dateJst: "2026-08-16", gameId: "d3", homeTeamCode: "DB", awayTeamCode: "H" },
  { dateJst: "2026-08-18", gameId: "e1", homeTeamCode: "G", awayTeamCode: "DB" },
  { dateJst: "2026-08-19", gameId: "e2", homeTeamCode: "G", awayTeamCode: "DB" },
  { dateJst: "2026-08-20", gameId: "e3", homeTeamCode: "DB", awayTeamCode: "G" },
]

const lastGameSeries = detectThreeGameSeriesFromGames(lastGameAndNextSeriesGames)
const pickedWithNextCardGroup = pickRecentThreeGameSeriesCards(lastGameSeries, "2026-08-13", 2)
assert.deepEqual(
  pickedWithNextCardGroup.map((s) => `${s.cardKey}:${s.seriesStart}`),
  ["D-DB:2026-08-11", "G-H:2026-08-11", "D-G:2026-08-14", "DB-H:2026-08-14"],
)

console.log("[validate:probables-series-detect] OK")
