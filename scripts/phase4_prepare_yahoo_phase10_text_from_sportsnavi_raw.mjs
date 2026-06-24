/**
 * Phase 4（準備）: Phase10 restore が参照する raw text を用意する。
 *
 * `run_yahoo_phase10_restore.py --text-from-raw` は
 *   `_data/scraped_games/raw/{gameId}/text.html`
 * を優先参照するため、スポナビで取得済みの
 *   `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`
 * をそこへコピーする。
 *
 * 入力:
 * - `_data/sportsnavi_schedule_index/season_YYYY.json`
 * - `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`
 *
 * 出力:
 * - `_data/scraped_games/raw/{gameId}/text.html`
 *
 * 実行:
 *   node scripts/phase4_prepare_yahoo_phase10_text_from_sportsnavi_raw.mjs --year 2026
 *   node scripts/phase4_prepare_yahoo_phase10_text_from_sportsnavi_raw.mjs --year 2026 --force
 */

import fs from "node:fs"
import path from "node:path"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const force = argv.includes("--force")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  return { year, force }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function main() {
  const { year, force } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(indexPath)) {
    console.error("[phase4:prepare-text] missing index:", indexPath)
    process.exit(1)
  }
  const idx = readJson(indexPath)
  if (idx?.schemaVersion !== "sportsnavi-schedule-season-index-v1") {
    console.error("[phase4:prepare-text] invalid index schema:", indexPath)
    process.exit(1)
  }
  const gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
  const srcDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text")
  if (!fs.existsSync(srcDir)) {
    console.error("[phase4:prepare-text] missing:", srcDir)
    console.error("  先に: npm run phase2:sportsnavi:stats-text")
    process.exit(1)
  }

  let copied = 0
  let skipped = 0
  let missing = 0
  for (const gameId of gameIds) {
    const src = path.join(srcDir, `${gameId}.html`)
    if (!fs.existsSync(src)) {
      missing += 1
      continue
    }
    const dstDir = path.join(root, "_data", "scraped_games", "raw", gameId)
    const dst = path.join(dstDir, "text.html")
    if (!force && fs.existsSync(dst)) {
      const srcNewer = fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs
      if (!srcNewer) {
        skipped += 1
        continue
      }
    }
    ensureDir(dstDir)
    fs.copyFileSync(src, dst)
    copied += 1
  }

  console.log(
    `[phase4:prepare-text] year=${year} gameIds=${gameIds.length} copied=${copied} skipped=${skipped} missingSrc=${missing}`
  )
}

main()

