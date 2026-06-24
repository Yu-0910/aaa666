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
    if (isSportsnaviMainGameCancelled(fs.readFileSync(mainPath, "utf8"))) return true
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

if (fs.existsSync(cancelledMain)) {
  assert.equal(isSportsnaviMainGameCancelled(fs.readFileSync(cancelledMain, "utf8"), cancelledId), true)
  assert.equal(isCancelledGameLikePhase4(root, cancelledId, cancelledCanon), true)
}
if (fs.existsSync(playedMain)) {
  assert.equal(isSportsnaviMainGameCancelled(fs.readFileSync(playedMain, "utf8"), playedId), false)
  assert.equal(isCancelledGameLikePhase4(root, playedId, playedCanon), false)
}

console.log("[validate_phase4_cancelled_skip_unit] ok")
