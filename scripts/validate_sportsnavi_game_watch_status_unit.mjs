import assert from "node:assert/strict"
import {
  classifySportsnaviGameForDailyPipeline,
  isLikelyInProgressCardState,
  isPreGameCardState,
  parseGameCardStateLabel,
} from "../lib/yahooGame/sportsnaviGameWatchStatus.mjs"

const preMain = `<p class="bb-gameCard__state"><span>試合前</span></p>`
const inProgressMain = `<p class="bb-gameCard__state"><span>9回裏</span></p>`
const textEnd = `<div class="bb-liveText"></div>三振 3アウト 試合終了`
const statsRows =
  '<tr><td><a href="/npb/player/1000001/">A</a></td></tr><tr><td><a href="/npb/player/1000002/">B</a></td></tr>'

assert.equal(parseGameCardStateLabel(preMain), "試合前")
assert.equal(isPreGameCardState("試合前"), true)
assert.equal(isLikelyInProgressCardState("9回裏"), true)

assert.equal(
  classifySportsnaviGameForDailyPipeline({ htmlMain: preMain, htmlStats: "", htmlText: "" }).status,
  "pre_game",
)

assert.equal(
  classifySportsnaviGameForDailyPipeline({
    htmlMain: inProgressMain,
    htmlStats: statsRows,
    htmlText: textEnd,
  }).status,
  "finished",
)

assert.equal(
  classifySportsnaviGameForDailyPipeline({
    htmlMain: `<p class="bb-gameCard__state"><span></span></p>`,
    htmlStats: statsRows,
    htmlText: textEnd,
  }).ready,
  true,
)

console.log("[validate_sportsnavi_game_watch_status_unit] OK")
