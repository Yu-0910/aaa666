import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { loadMetricsFromRecord } from "../lib/ranking/record"
import { EXTRA_COUNTS, parseRecentV2, rankRecentV2, recentV2Values, type ExtraCounts, type V2Game } from "../lib/ranking/recentGamesV2"
import { sumRecentGames, type RecentRow, type RecentGame } from "../lib/ranking/recentGamesShared"
import { parseRecentGamesSnapshot } from "../lib/ranking/recentGamesPage"
import { enrichBattingRankingDerivedMetrics } from "../lib/ranking/enrichRankingDerivedMetrics"
import { buildRecentV2Cards } from "../lib/topPage/recentGamesV2Cards"

const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
assert.equal(metrics.length, 36)
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const template = read("public/data/rankings/recent-games/2026/CL/batting.json").rows[0] as RecentRow
const row: RecentRow = { ...template, pa: 20, ab: 16, h: 6, doubles: 1, triples: 1, hr: 1, bb: 2, hbp: 1,
  sf: 1, sh: 0, sb: 2, rbi: 3, tb: 12, gamesIncluded: 5, hasExcludedGames: false }
const extra: ExtraCounts = { runs: 4, ibb: 1, so: 3, cs: 1, gidp: 1 }
const values = recentV2Values(row, extra)
assert.equal(values.avg, 0.375)
assert.equal(values.obp, 0.45)
assert.equal(values.slg, 0.75)
assert.equal(values.ops, 1.2)
assert.equal(values.bbk, 2 / 3)
assert.equal(values.bbPct, 10)
assert.equal(values.kPct, 15)
assert.equal(values.babip, 5 / 13)
assert.equal(values.seca, 9 / 16)
assert.equal(values.ta, 16 / 12)
assert.equal(values.noi, 700)
assert.ok(Math.abs(Number(values.xr) - 4.746) < 1e-10)
const reference = enrichBattingRankingDerivedMetrics({ ...row, ...extra, hits: row.h }) as Record<string, unknown>
for (const key of ["avg", "ops", "obp", "slg", "isop", "isod", "bbPct", "kPct", "bbk", "rc", "xr", "babip", "seca", "ta", "noi", "gpa"]) assert.equal(values[key], reference[key], key)
assert.equal(recentV2Values(row, { ...extra, so: 0 }).bbk, null)
assert.equal(recentV2Values(row, { ...extra, cs: null }).rc, null)
assert.equal(recentV2Values(row, { ...extra, cs: null }).avg, 0.375)
assert.equal(recentV2Values(row, { ...extra, runs: null }).runs, null)
assert.equal(recentV2Values({ ...row, pa: 0, ab: 0 }, extra).ops, null)
const rankedRow = { ...row, ...extra, romanName: null, values }
assert.equal(rankRecentV2([{ ...rankedRow, pa: 9 }], "bbk").length, 0)
assert.equal(rankRecentV2([{ ...rankedRow, pa: 10 }], "bbk").length, 1)
assert.equal(rankRecentV2([{ ...rankedRow, hasExcludedGames: true }], "hits").length, 0)
assert.equal(rankRecentV2([], "ops").length, 0)
assert.deepEqual(rankRecentV2([{ ...rankedRow, playerId: "b" }, { ...rankedRow, playerId: "a" }], "ops").map(r => r.playerId), ["a", "b"])

if (process.argv.includes("--data")) {
  const audit = read("_data/derived/recent_10_games_batting_v2/2026/audit.json") as { selected: Record<string, RecentGame[]>; extraGames: V2Game[] }
  let players = 0
  for (const league of ["CL", "PL"] as const) {
    const data = parseRecentV2(read(`public/data/rankings/recent-games-v2/2026/${league}/batting.json`), league, metrics)
    assert.throws(() => parseRecentGamesSnapshot(data, league))
    assert.throws(() => parseRecentV2({ ...data, schemaVersion: "recent-10-games-batting-v1" }, league, metrics))
    assert.equal(buildRecentV2Cards(data).length, 12)
    for (const card of buildRecentV2Cards(data)) {
      assert.deepEqual(card.rows.map(row => row.playerId), rankRecentV2(data.rows, card.key).slice(0, card.limit).map(row => row.playerId))
    }
    for (const actual of data.rows) {
      const games = audit.selected[actual.playerId]
      const extras = audit.extraGames.filter(game => game.playerId === actual.playerId)
      assert.equal(extras.length, games.length)
      assert.deepEqual(extras.map(game => game.gameId), games.map(game => game.gameId))
      assert.ok(games.every(game => actual.teamGameIds.includes(game.gameId)))
      const totals = sumRecentGames(games)
      const extraTotals = Object.fromEntries(EXTRA_COUNTS.map(key => [key, extras.some(game => game[key] === null) ? null
        : extras.reduce((sum, game) => sum + Number(game[key]), 0)])) as ExtraCounts
      const expected = recentV2Values({ ...actual, ...totals }, extraTotals)
      assert.deepEqual(actual.values, Object.fromEntries(metrics.map(({ key }) => [key, expected[key]])))
      for (const key of EXTRA_COUNTS) assert.equal(actual[key], extraTotals[key])
      players++
    }
    for (const { key } of metrics) {
      const rows = rankRecentV2(data.rows, key, "desc")
      assert.ok(rows.every((row, index) => row.rank === index + 1))
      assert.ok(rows.every((row, index) => index === 0 || Number(rows[index - 1].values[key]) >= Number(row.values[key])))
    }
  }
  console.log(`V2: recomputed ${players} players, 36 metrics, all ranking orders verified`)
}
console.log("V2: formulas, season parity, missing values, zero denominators, PA threshold, ties OK")
