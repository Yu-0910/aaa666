/**
 * Phase 9（yahoo_npb_game_data_integration_plan.md）のレイアウト検証:
 * - Raw は Git に含めない（.gitignore）
 * - Canonical ディレクトリが存在する
 *
 * 使い方: node scripts/verify_phase9_layout.mjs
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function fail(msg) {
  console.error("[phase9:verify]", msg)
  process.exit(1)
}

const gitignorePath = path.join(root, ".gitignore")
if (!fs.existsSync(gitignorePath)) fail("missing .gitignore")

const gi = fs.readFileSync(gitignorePath, "utf8")
if (!gi.includes("_data/scraped_games/raw")) {
  fail(".gitignore に _data/scraped_games/raw/ を含めてください（Phase 9: Raw は Git に入れない）")
}

const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
if (!fs.existsSync(canonicalDir) || !fs.statSync(canonicalDir).isDirectory()) {
  fail(`missing directory: ${canonicalDir}`)
}

const canonicalFiles = fs
  .readdirSync(canonicalDir)
  .filter((f) => f.endsWith(".json"))
console.log("[phase9:verify] OK — Raw は .gitignore 対象")
console.log("[phase9:verify] Canonical JSON:", canonicalFiles.length, "file(s)")

const rawDir = path.join(root, "_data", "scraped_games", "raw")
if (fs.existsSync(rawDir)) {
  const games = fs
    .readdirSync(rawDir)
    .filter((d) => fs.statSync(path.join(rawDir, d)).isDirectory())
  console.log("[phase9:verify] ローカル Raw 試合ディレクトリ:", games.length, "件（コミット対象外）")
  for (const g of games) {
    const man = path.join(rawDir, g, "manifest.json")
    if (fs.existsSync(man)) {
      console.log("[phase9:verify]   -", g, "(manifest.json あり)")
    } else {
      console.log("[phase9:verify]   -", g, "(manifest.json なし — Phase 9 推奨は manifest の保存)")
    }
  }
} else {
  console.log("[phase9:verify] Raw ディレクトリなし（初回取得後に _data/scraped_games/raw/{game_id}/ を作る）")
}
