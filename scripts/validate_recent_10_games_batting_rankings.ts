import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildRecentGamesBattingRankings, COUNT_KEYS, newestRecentGame, rankRecentRows, RECENT_METRICS, sumRecentGames, validRecentDate,
  type RecentGame, type RecentSnapshot } from "../lib/ranking/buildRecentGamesBattingRankings"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
function fixture(day: number, id = "1", team = "巨人", zero = false): CanonicalGameDocument {
  return {
    schemaVersion: "yahoo-game-canonical-v1", gameId: String(100 + day), builtAt: "", sourceSchema: "sportsnavi-stats-text-v1",
    sourceCompositeFingerprint: "", normalizedFetchedAt: "",
    game: { meta: { documentTitle: `2026年9月${day}日 巨人vs.阪神`, ogTitle: "" }, scoreboard: [], teams: [{ teamName: team, yahooTeamId: null, startingLineup: [] }],
      textPlayByPlay: [{ sectionTitle: "9回", lines: ["試合終了"] }], statsPlayerLinkedRows: [], yahooPlayersMentioned: {}, missingOrPartial: [], pitchByPitchNote: { status: "" } },
    domain: { plateAppearances: [], pitchEvents: [], pitchingLines: [], battingLines: [{ yahooPlayerId: id, playerName: `Test ${id}`, teamName: team,
      positionCell: "(走)", inferredFrom: "stats_row_v0", ab: zero ? 0 : 3, h: zero ? 0 : 1, bb: zero ? 0 : 1, hbp: 0, sh: 0, rbi: 0, sb: zero ? 1 : 0,
      appearancePaSlotsJa: zero ? [] : ["左安", "四球", "空三振", "遊ゴロ"] }] },
  }
}
const options = { asOf: "2026-09-12", generatedAt: "2026-09-12T00:00:00Z" }
const docs = Array.from({ length: 11 }, (_, i) => fixture(i + 1))
const built = buildRecentGamesBattingRankings(docs, options)
const row = built.snapshots.CL.rows[0]
assert.equal(row.gamesIncluded, 10)
assert.deepEqual(row.gameIds, ["111", "110", "109", "108", "107", "106", "105", "104", "103", "102"])
assert.equal(row.pa, 40)
assert.equal(row.h, 10)
assert.equal(row.avg, 1 / 3)
assert.equal(row.ops, 0.5 + 1 / 3)
assert.deepEqual(buildRecentGamesBattingRankings([...docs].reverse(), options), built)
assert.throws(() => buildRecentGamesBattingRankings([docs[0], docs[0]], options), /Duplicate/)
assert.equal(validRecentDate("2026-02-30"), false)
assert.equal(validRecentDate("2025-09-12"), false)
assert.equal(newestRecentGame({ gameDate: "2026-09-01", gameId: "9007199254740993" }, { gameDate: "2026-09-01", gameId: "9007199254740992" }), -1)
const zero = buildRecentGamesBattingRankings([fixture(1, "1", "巨人", true)], options).snapshots.CL.rows[0]
assert.equal(zero.gamesIncluded, 1)
assert.equal(zero.pa, 0)
assert.equal(zero.sb, 1)
assert.equal(zero.avg, null)
assert.equal(rankRecentRows([zero], "avg").length, 0)
assert.equal(rankRecentRows([zero], "sb").length, 1)
assert.equal(rankRecentRows([{ ...row, pa: 9 }], "ops").length, 0)
assert.equal(rankRecentRows([{ ...row, pa: 10 }], "ops").length, 1)
const tied = Array.from({ length: 6 }, (_, i) => ({ ...row, playerId: `yahoo_${6 - i}` }))
assert.deepEqual(rankRecentRows(tied, "h").slice(0, 5).map(r => r.playerId), ["yahoo_1", "yahoo_2", "yahoo_3", "yahoo_4", "yahoo_5"])
assert.equal(rankRecentRows([{ ...row, ops: 1.0004, playerId: "a" }, { ...row, ops: 1.00049, playerId: "b" }], "ops")[0].playerId, "b")
const missing = fixture(12)
delete missing.domain.battingLines[0].sb
const incomplete = buildRecentGamesBattingRankings([...docs, missing], options)
assert.equal(incomplete.snapshots.CL.rows[0].hasExcludedGames, true)
assert.equal(incomplete.audit.excluded[0].reason, "missing_count_columns")
const pending = fixture(1)
pending.game.textPlayByPlay = []
assert.equal(buildRecentGamesBattingRankings([pending], options).snapshots.CL.rows.length, 0)
assert.equal(buildRecentGamesBattingRankings([pending], { ...options, scheduleStatus: () => "completed" }).snapshots.CL.rows.length, 1)
assert.equal(buildRecentGamesBattingRankings([fixture(1)], { ...options, scheduleStatus: () => "試合中止" }).snapshots.CL.rows.length, 0)
const moved = buildRecentGamesBattingRankings([fixture(1), fixture(2, "1", "楽天")], options)
assert.equal(moved.snapshots.CL.rows.length, 0)
assert.equal(moved.snapshots.PL.rows[0].gamesIncluded, 1)
const absent = fixture(11, "2")
const absence = buildRecentGamesBattingRankings([...docs.slice(0, 10), absent], options).snapshots.CL.rows.find(r => r.yahooPlayerId === "1")!
assert.equal(absence.teamGamesIncluded, 10)
assert.equal(absence.gamesIncluded, 9)
assert.equal(absence.pa, 36)
assert.equal(absence.gameIds.includes("101"), false)
assert.equal(absence.teamGameIds.includes("111"), true)
const missingCanonical = buildRecentGamesBattingRankings(docs, { ...options,
  completedTeamGames: [{ team: "巨人", gameId: "112", gameDate: "2026-09-12" }] }).snapshots.CL.rows[0]
assert.equal(missingCanonical.gamesIncluded, 9)
assert.equal(missingCanonical.hasExcludedGames, true)
assert.equal(rankRecentRows([missingCanonical], "h").length, 0)
assert.deepEqual(buildRecentGamesBattingRankings([], options).snapshots.CL.rows, [])
assert.equal(buildRecentGamesBattingRankings([fixture(13)], options).snapshots.CL.rows.length, 0)
console.log("[recent-10] Unit and boundary checks passed")

if (process.argv.includes("--data")) {
  const audit = JSON.parse(readFileSync(join(root, "_data/derived/recent_10_games_batting/2026/audit.json"), "utf8")) as {
    selected: Record<string, RecentGame[]>; asOf: string; teamWindows: Record<string, Array<{ gameDate: string; gameId: string }>> }
  let total = 0
  for (const league of ["CL", "PL"]) {
    const snapshot: RecentSnapshot = JSON.parse(readFileSync(join(root, `public/data/rankings/recent-games/2026/${league}/batting.json`), "utf8"))
    assert.equal(snapshot.asOf, audit.asOf)
    assert.equal(snapshot.league, league)
    assert.equal(new Set(snapshot.rows.map(r => r.playerId)).size, snapshot.rows.length)
    for (const actual of snapshot.rows) {
      const games = audit.selected[actual.playerId]
      assert.ok(games.length >= 0 && games.length <= 10)
      const window = audit.teamWindows[actual.team]
      assert.deepEqual(actual.teamGameIds, window.map(g => g.gameId))
      assert.equal(actual.teamGamesIncluded, window.length)
      assert.ok(games.every(g => g.team === actual.team && actual.teamGameIds.includes(g.gameId)))
      assert.deepEqual(games, [...games].sort(newestRecentGame))
      assert.equal(new Set(games.map(g => g.gameId)).size, games.length)
      assert.deepEqual(actual.gameIds, games.map(g => g.gameId))
      for (const key of COUNT_KEYS) {
        assert.equal(actual[key], games.reduce((sum, game) => sum + game[key], 0))
        assert.ok(Number.isInteger(actual[key]) && actual[key] >= 0)
      }
      const expected = sumRecentGames(games)
      for (const key of ["avg", "obp", "slg", "ops", "tb"] as const) assert.equal(actual[key], expected[key])
      assert.equal(actual.gamesIncluded, games.length)
      assert.equal(actual.lastGameDate, window[0].gameDate)
      assert.equal(actual.firstGameDate, window.at(-1)!.gameDate)
      assert.ok(games.every(g => actual.league === g.league))
      for (const game of games) assert.ok(game.gameDate <= snapshot.asOf)
    }
    for (const metric of RECENT_METRICS) assert.ok(rankRecentRows(snapshot.rows, metric).every((r, i) => r.rank === i + 1))
    total += snapshot.rows.length
  }
  assert.ok(total > 0, "No real player rows")
  console.log(`[recent-10] Recomputed ${total} published players from per-game audit`)
}
