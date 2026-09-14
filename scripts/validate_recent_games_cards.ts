import assert from "node:assert/strict"
import { recentGamesAreStale } from "../lib/ranking/recentGamesFreshness"
import { readFileSync } from "node:fs"
import { buildRecentCards } from "../lib/topPage/recentGamesCards"
import { parseRecentGamesSnapshot } from "../lib/ranking/recentGamesPage"
import { rankRecentRows } from "../lib/ranking/recentGamesShared"

for (const league of ["CL", "PL"] as const) {
  const snapshot = parseRecentGamesSnapshot(JSON.parse(readFileSync(`public/data/rankings/recent-games/2026/${league}/batting.json`, "utf8")), league)
  const cards = buildRecentCards(snapshot)
  assert.deepEqual(cards.map(card => card.limit), [5, 5, 5, 3, 3, 3])
  for (const card of cards) {
    const expected = rankRecentRows(snapshot.rows, card.metric).slice(0, card.limit)
    assert.deepEqual(card.rows.map(row => row.playerId), expected.map(row => row.playerId))
    assert.equal(card.rows.length, expected.length)
    assert.ok(card.rows.length <= card.limit)
  }
  assert.ok(buildRecentCards({ ...snapshot, rows: [] }).every(card => card.rows.length === 0))
  const row = snapshot.rows.find(row => !row.hasExcludedGames && row.gamesIncluded > 0)!
  const limited = buildRecentCards({ ...snapshot, rows: [{ ...row, pa: 9, avg: 0.5, ops: 1.5 }] })
  assert.equal(limited[0].rows.length, 0)
  assert.equal(limited[1].rows.length, 0)
  assert.equal(limited[2].rows.length, 1)
  assert.ok(buildRecentCards({ ...snapshot, rows: [{ ...row, hasExcludedGames: true }] }).every(card => !card.rows.length))
}
const now = Date.parse("2026-09-12T12:00:00Z")
assert.equal(recentGamesAreStale("2026-09-12T11:00:00Z", now), false)
assert.equal(recentGamesAreStale("2026-09-10T11:59:59Z", now), true)
assert.equal(recentGamesAreStale("2026-09-13T12:00:00Z", now), true)
assert.equal(recentGamesAreStale("invalid", now), true)
console.log("Recent cards: CL/PL limits, detail parity, empty, minimum PA, missing data, freshness OK")
