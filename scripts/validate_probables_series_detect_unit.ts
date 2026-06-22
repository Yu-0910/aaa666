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

console.log("[validate:probables-series-detect] OK")
