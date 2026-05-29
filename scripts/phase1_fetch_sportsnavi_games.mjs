/**
 * Phase 1: Phase0で列挙した gameId 一覧を元に、スポナビの試合ページを取得して raw として保存する。
 *
 * 入力:
 *   _data/sportsnavi_schedule_index/season_YYYY.json
 *
 * 出力:
 *   _data/scraped_games/raw_sportsnavi/{gameId}.html
 *   _data/scraped_games/raw_sportsnavi/_meta/{gameId}.json
 *   _data/scraped_games/raw_sportsnavi/_failures.json
 *
 * 使い方:
 *   node scripts/phase1_fetch_sportsnavi_games.mjs --year 2026
 *   node scripts/phase1_fetch_sportsnavi_games.mjs --year 2026 --force
 *   node scripts/phase1_fetch_sportsnavi_games.mjs --year 2026 --throttle-ms 500 --limit 30
 *   node scripts/phase1_fetch_sportsnavi_games.mjs --year 2026 --game-ids 2021038840,2021038841 --force
 *     … インデックス全件ではなく指定 ID のみ試合トップ raw を取得（日付単位の塗り直し用）
 */

import fs from "node:fs"
import path from "node:path"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const throttleIdx = argv.indexOf("--throttle-ms")
  const limitIdx = argv.indexOf("--limit")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const force = argv.includes("--force")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const throttleMsRaw = throttleIdx >= 0 ? String(argv[throttleIdx + 1] ?? "").trim() : ""
  const throttleMs = throttleMsRaw ? Math.max(0, parseInt(throttleMsRaw, 10) || 0) : 350
  const limitRaw = limitIdx >= 0 ? String(argv[limitIdx + 1] ?? "").trim() : ""
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : 0
  const gameIdsRaw = gameIdsIdx >= 0 ? String(argv[gameIdsIdx + 1] ?? "").trim() : ""
  const gameIdsOverride = gameIdsRaw
    ? gameIdsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  return { year, throttleMs, limit, force, gameIdsOverride }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function writeJson(p, v) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2), "utf8")
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
    cache: "no-store",
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, statusText: res.statusText, text }
}

async function fetchWithRetry(url, tries, backoffMs) {
  let lastErr = null
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchText(url)
      if (r.ok) return r
      lastErr = new Error(`HTTP ${r.status} ${r.statusText}`)
    } catch (e) {
      lastErr = e
    }
    if (i < tries - 1) await sleep(backoffMs * (i + 1))
  }
  throw lastErr ?? new Error("fetch failed")
}

function upsertFailure(failures, row) {
  const key = `${row.gameId}`
  const idx = (failures.rows ?? []).findIndex((r) => String(r.gameId) === key)
  if (idx >= 0) failures.rows[idx] = row
  else failures.rows.push(row)
}

async function main() {
  const { year, throttleMs, limit, force, gameIdsOverride } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJsonIfExists(indexPath)
  if (!idx || idx.schemaVersion !== "sportsnavi-schedule-season-index-v1") {
    console.error("[phase1] missing or invalid index:", indexPath)
    process.exit(1)
  }
  const indexGameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
  if (indexGameIds.length === 0) {
    console.error("[phase1] empty gameIds in index:", indexPath)
    process.exit(1)
  }

  let gameIds = indexGameIds
  if (gameIdsOverride && gameIdsOverride.length > 0) {
    const allowed = new Set(indexGameIds.map((x) => String(x).trim()))
    const notInIndex = gameIdsOverride.filter((id) => !allowed.has(String(id).trim()))
    if (notInIndex.length > 0) {
      console.warn(
        "[phase1] --game-ids のうち season インデックスに無い ID があります（指定どおり取得します）:",
        notInIndex.join(", "),
      )
    }
    gameIds = gameIdsOverride.map((x) => String(x).trim()).filter(Boolean)
    console.log(`[phase1] --game-ids 指定: ${gameIds.length} game(s)`)
  }

  const outDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  const metaDir = path.join(outDir, "_meta")
  ensureDir(outDir)
  ensureDir(metaDir)

  const failuresPath = path.join(outDir, "_failures.json")
  const failures =
    readJsonIfExists(failuresPath) ?? ({ schemaVersion: "sportsnavi-raw-failures-v1", year, rows: [] })
  if (!failures.rows) failures.rows = []

  const fetchedAt = new Date().toISOString()
  let done = 0
  let skipped = 0
  let failed = 0

  const targets = limit > 0 ? gameIds.slice(0, limit) : gameIds
  const logEvery = Math.max(
    1,
    parseInt(String(process.env.TOPPAGE_PHASE1_LOG_EVERY ?? "6"), 10) || 6,
  )
  const skipLogStride = targets.length <= 24 ? 1 : logEvery
  for (let i = 0; i < targets.length; i++) {
    const gameId = targets[i]
    const htmlPath = path.join(outDir, `${gameId}.html`)
    const metaPath = path.join(metaDir, `${gameId}.json`)
    if (!force && fs.existsSync(htmlPath) && fs.existsSync(metaPath)) {
      skipped += 1
      if (i === 0 || (i + 1) % skipLogStride === 0 || i + 1 === targets.length) {
        console.log(
          `[phase1] ${i + 1}/${targets.length} ${gameId} … skip (cached) cumulative: fetched=${done} skipped=${skipped} failed=${failed}`,
        )
      }
      if (throttleMs > 0) await sleep(throttleMs)
      continue
    }

    const url = `https://baseball.yahoo.co.jp/npb/game/${encodeURIComponent(gameId)}/index`
    try {
      const r = await fetchWithRetry(url, 3, 800)
      fs.writeFileSync(htmlPath, r.text, "utf8")
      writeJson(metaPath, {
        schemaVersion: "sportsnavi-game-raw-meta-v1",
        year,
        gameId,
        fetchedAt,
        sourceUrl: url,
        http: { status: r.status, statusText: r.statusText },
      })
      done += 1
      console.log(`[phase1] ${i + 1}/${targets.length} ${gameId} … fetch OK (cumulative fetched=${done})`)
    } catch (e) {
      failed += 1
      upsertFailure(failures, {
        gameId,
        sourceUrl: url,
        fetchedAt,
        error: String(e?.message ?? e),
      })
      writeJson(failuresPath, failures)
      console.log(`[phase1] ${i + 1}/${targets.length} ${gameId} … FETCH FAILED`)
    }

    if (throttleMs > 0) await sleep(throttleMs)
  }

  writeJson(failuresPath, failures)
  console.log(
    `[phase1] year=${year} targets=${targets.length} fetched=${done} skipped=${skipped} failed=${failed} out=${outDir}`,
  )
  if (failed > 0) {
    appendPipelineBulkLog(root, "phase1_fetch", `failed=${failed} fetched=${done} skipped=${skipped} targets=${targets.length}`)
  }
}

main().catch((e) => {
  console.error("[phase1] failed:", e)
  process.exit(1)
})

