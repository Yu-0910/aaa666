import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { recentGamesQuery, recentGamesRankingHref, parseRecentGamesSnapshot } from "../lib/ranking/recentGamesPage"
import { rankRecentRows, RECENT_METRICS } from "../lib/ranking/recentGamesShared"

assert.deepEqual(recentGamesQuery({}), { sort: "ops", order: "desc" })
assert.deepEqual(recentGamesQuery({ sort: "unknown", order: "invalid" }), { sort: "ops", order: "desc" })
assert.deepEqual(recentGamesQuery({ sort: ["avg", "ops"], order: "asc" }), { sort: "ops", order: "asc" })
assert.equal(recentGamesRankingHref("PL", "avg", "asc"), "/ranking/recent-games/2026/PL/batting?sort=avg&order=asc")
for (const league of ["CL", "PL"] as const) {
  const raw = JSON.parse(readFileSync(`public/data/rankings/recent-games/2026/${league}/batting.json`, "utf8"))
  const snapshot = parseRecentGamesSnapshot(raw, league)
  assert.throws(() => parseRecentGamesSnapshot({ ...raw, windowBasis: "player" }, league))
  assert.throws(() => parseRecentGamesSnapshot(raw, league === "CL" ? "PL" : "CL"))
  assert.throws(() => parseRecentGamesSnapshot({ ...raw, rows: [{ ...raw.rows[0], ops: NaN }] }, league))
  assert.equal(parseRecentGamesSnapshot({ ...raw, rows: [] }, league).rows.length, 0)
  for (const sort of RECENT_METRICS) for (const order of ["asc", "desc"] as const) {
    const rows = rankRecentRows(snapshot.rows, sort, order)
    assert.ok(rows.every((row, i) => row.rank === i + 1 && !row.hasExcludedGames && row.gamesIncluded > 0))
    assert.ok(rows.every((row, i) => !i || (order === "desc" ? Number(rows[i - 1][sort]) >= Number(row[sort]) : Number(rows[i - 1][sort]) <= Number(row[sort]))))
    if (sort === "avg" || sort === "ops") assert.ok(rows.every(row => row.pa >= snapshot.minRatePA))
  }
}
console.log("[recent-games-page] Query, schema, empty-data and CL/PL six-metric sorting checks passed")
