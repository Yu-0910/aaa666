/**
 * 出場成績 HTML からスタメン打順 1〜9 が取れること（固定試合 2021038624）。
 * `npm run validate:sportsnavi-stats-starting-lineup`
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  isStarterPositionCell,
  parseTeamsFromSportsnaviStatsHtml,
} from "../lib/yahooGame/sportsnaviStatsStartingLineup.mjs"
import { parseSportsnaviStatsHtml } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const html = readFileSync(
  join(root, "_data/scraped_games/raw_sportsnavi_stats/2021038624.html"),
  "utf8",
)

assert.equal(isStarterPositionCell("(二)"), true)
assert.equal(isStarterPositionCell("投"), false)
assert.equal(isStarterPositionCell("打一"), false)

const { teams, totalStarterSlots } = parseTeamsFromSportsnaviStatsHtml(html)
assert.equal(teams.length, 2, `teams=${teams.length}`)
assert.ok(totalStarterSlots >= 16, `starterSlots=${totalStarterSlots}`)

const visitor = teams.find((t) => String(t.teamName).includes("中日") || t.yahooTeamId === "4")
const home = teams.find((t) => String(t.teamName).includes("広島") || t.yahooTeamId === "6")
assert.ok(visitor, "visitor team")
assert.ok(home, "home team")
assert.equal(visitor.startingLineup.length, 9)
assert.equal(home.startingLineup.length, 9)

assert.equal(visitor.startingLineup[0]?.yahooPlayerId, "1560639")
assert.equal(visitor.startingLineup[0]?.battingOrder, "1")
assert.equal(visitor.startingLineup[5]?.yahooPlayerId, "1561854")

const kikuchi = home.startingLineup.find((p) => p.yahooPlayerId === "1100082")
assert.ok(kikuchi, "菊池 in home lineup")
assert.equal(kikuchi.battingOrder, "6")
assert.equal(kikuchi.fieldingPosition, "二")

const rows = parseSportsnaviStatsHtml(html)
assert.ok(rows.length >= 18, `flat rows=${rows.length}`)

const linklessHtml = readFileSync(
  join(root, "_data/scraped_games/raw_sportsnavi_stats/2021038804.html"),
  "utf8",
)
const linklessRows = parseSportsnaviStatsHtml(linklessHtml)
const viciedo = linklessRows.find((r) => r.playerName === "ビシエド")
assert.ok(viciedo, "linkless ビシエド row")
assert.equal(viciedo.yahooPlayerId, "1600021")
assert.deepEqual(viciedo.cells.slice(0, 14), [
  "打",
  "ビシエド",
  ".261",
  "1",
  "1",
  "1",
  "2",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "1",
])

console.log("[validate:sportsnavi-stats-starting-lineup] OK")
