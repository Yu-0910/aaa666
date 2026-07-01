/**
 * Phase4: 試合中止/ノーゲームの skip 判定（2026-06-07 8979 再発対策）。
 *   node scripts/validate_phase4_cancelled_skip_unit.mjs
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function isCancelledGameLikePhase4(rootDir, gameId, canonPath) {
  const mainPath = path.join(rootDir, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  if (fs.existsSync(mainPath)) {
    if (isSportsnaviMainGameCancelled(fs.readFileSync(mainPath, "utf8"), gameId)) return true
  }
  const textPath = path.join(rootDir, "_data", "scraped_games", "raw_sportsnavi_text", `${gameId}.html`)
  if (fs.existsSync(textPath)) {
    if (isSportsnaviMainGameCancelled(fs.readFileSync(textPath, "utf8"), gameId)) return true
  }
  if (fs.existsSync(canonPath)) {
    const c = JSON.parse(fs.readFileSync(canonPath, "utf8"))
    const miss = c?.game?.missingOrPartial ?? []
    if (miss.some((s) => String(s).includes("game cancelled"))) return true
    const title = String(c?.game?.meta?.documentTitle ?? c?.game?.meta?.ogTitle ?? "")
    if (/試合中止|ノーゲーム|コールド/.test(title)) return true
  }
  return false
}

const cancelledId = "2021038979"
const playedId = "2021038975"
const cancelledMain = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${cancelledId}.html`)
const playedMain = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${playedId}.html`)
const cancelledCanon = path.join(root, "_data", "scraped_games", "canonical", `${cancelledId}.json`)
const playedCanon = path.join(root, "_data", "scraped_games", "canonical", `${playedId}.json`)

// 6/21 DeNA–阪神 等: 先頭カードは成立試合、同日別試合の scoreList「試合中止」だけでは未成立扱いにしない
const sidebarOtherCancelledHtml = `
<h2 class="bb-head01__title">2026年6月21日 横浜DeNAベイスターズvs.阪神タイガース 試合出場成績</h2>
<p class="bb-gameCard__state"><span>試合終了</span></p>
<a class="bb-scoreList__state" href="/npb/game/2021039025/index">試合中止</a>
`
assert.equal(isSportsnaviMainGameCancelled(sidebarOtherCancelledHtml, "2021039031"), false)

const primaryCancelledHtml = `<p class="bb-gameCard__state"><span>試合中止</span></p>`
assert.equal(isSportsnaviMainGameCancelled(primaryCancelledHtml, "2021039025"), true)

const textCurrentCancelledHtml = `<span class="bb-scoreList__state">試合中止</span>`
assert.equal(isSportsnaviMainGameCancelled(textCurrentCancelledHtml, "2021039055"), true)

if (fs.existsSync(cancelledMain)) {
  assert.equal(isSportsnaviMainGameCancelled(fs.readFileSync(cancelledMain, "utf8"), cancelledId), true)
  assert.equal(isCancelledGameLikePhase4(root, cancelledId, cancelledCanon), true)
}
if (fs.existsSync(playedMain)) {
  assert.equal(isSportsnaviMainGameCancelled(fs.readFileSync(playedMain, "utf8"), playedId), false)
  assert.equal(isCancelledGameLikePhase4(root, playedId, playedCanon), false)
}

console.log("[validate_phase4_cancelled_skip_unit] ok")
