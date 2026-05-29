/**
 * bb-scoreTable 投手成績パースのスモーク（固定試合スニペット）。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  parseSportsnaviPitcherScoreTableRows,
  mergePitchingLinesFromScoreAndStatsTables,
} from "../lib/yahooGame/sportsnaviPitcherScoreTableParse.mjs"
import {
  buildBattingPitchingFromStatsRows,
  parseSportsnaviStatsHtml,
} from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const gameId = "2021038903"
const htmlPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats", `${gameId}.html`)

if (!fs.existsSync(htmlPath)) {
  console.error("[validate_sportsnavi_pitcher_score_table] missing", htmlPath)
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, "utf8")
const scoreRows = parseSportsnaviPitcherScoreTableRows(html)
if (scoreRows.length < 8) {
  console.error("[validate_sportsnavi_pitcher_score_table] expected >=8 score rows, got", scoreRows.length)
  process.exit(1)
}

const winner = scoreRows.find((r) => r.decision === "win")
if (!winner?.ip || winner.ip === "0") {
  console.error("[validate_sportsnavi_pitcher_score_table] win pitcher missing ip:", winner)
  process.exit(1)
}

const statsRows = parseSportsnaviStatsHtml(html)
const { pitchingLines } = buildBattingPitchingFromStatsRows(statsRows, html)
const withIp = pitchingLines.filter((pl) => pl.ip && pl.ip !== "0")
if (withIp.length < 8) {
  console.error(
    "[validate_sportsnavi_pitcher_score_table] merged pitchingLines with ip:",
    withIp.length,
    "sample",
    pitchingLines[0],
  )
  process.exit(1)
}

const mergedOnly = mergePitchingLinesFromScoreAndStatsTables(scoreRows, [])
if (!mergedOnly.some((pl) => pl.yahooPlayerId === winner.yahooPlayerId && pl.ip === winner.ip)) {
  console.error("[validate_sportsnavi_pitcher_score_table] merge sanity failed")
  process.exit(1)
}

console.log(
  `[validate_sportsnavi_pitcher_score_table] OK gameId=${gameId} scoreRows=${scoreRows.length} mergedWithIp=${withIp.length} winner=${winner.playerName} ip=${winner.ip}`,
)
