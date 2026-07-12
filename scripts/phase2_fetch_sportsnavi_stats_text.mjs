/**
 * Phase 2 (Sportsnavi raw): fetch stats/text HTML per gameId.
 *
 * 入力:
 * - `_data/sportsnavi_schedule_index/season_YYYY.json`
 *
 * 出力:
 * - `_data/scraped_games/raw_sportsnavi_stats/{gameId}.html`
 * - `_data/scraped_games/raw_sportsnavi_text/{gameId}.html`
 *   … テキスト速報 HTML は canonical の `playHeadlineJa`（一球・各プレー上段の itemTitle）の元になるため、派生集計前に必ず取得推奨
 * - 一球速報 `score?index=` の全打席スナップショットは別スクリプト:
 *   `python scripts/fetch_sportsnavi_score_raw_snapshot.py` / `npm run phase2:sportsnavi:score-raw`
 * - `_data/scraped_games/raw_sportsnavi_stats/_meta/{gameId}.json`
 * - `_data/scraped_games/raw_sportsnavi_text/_meta/{gameId}.json`
 * - 各 `_failures.json`
 *
 * 実行:
 *   node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year 2026
 *   node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year 2026 --force
 *   node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year 2026 --throttle-ms 500 --limit 30
 *   node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year 2026 --only-incomplete
 *   node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year 2026 --game-ids 2021038726,2021038710 --force
 *
 * --only-incomplete … 出場成績に選手リンクが足りない、またはテキストに bb-liveText が無い試合だけ再取得（force 相当）。
 * --game-ids … インデックスの代わりに試合 ID を直接指定（カンマ区切り）。
 *
 * 再発防止（重要）:
 * - ファイルが存在しても「選手リンクが2未満 / bb-liveText が無い」なら再取得する（空の CSR スケルトンを温存しない）。
 * - stats は **リンク件数だけでは完了とみなさない**（ナビ等の `/npb/player/` が残り、表 tbody が空の CSR がある）。
 *   `parseSportsnaviStatsHtml` と同じパーサで **選手行が2行以上**取れるときだけ stats 完了扱い。
 * - 初回レスポンスが空に見えるとき、数秒待って同じ URL を最大2回まで再 fetch する。
 * - fetch 後、対象 gameId について canonical を `--only-stale` で再生成（raw 更新後の thin 残りを解消）。
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"
import { isScheduleCancelledGame } from "../lib/yahooGame/sportsnaviScheduleStatus.mjs"
import {
  countBbLiveTextSplits,
  isHtmlFetchFailed,
  isPhase2RawComplete,
  isStatsHtmlParseComplete,
} from "../lib/yahooGame/phase2RawCanonicalSync.mjs"

const seasonIndexCache = new Map()

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const throttleIdx = argv.indexOf("--throttle-ms")
  const limitIdx = argv.indexOf("--limit")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const force = argv.includes("--force")
  const onlyIncomplete = argv.includes("--only-incomplete")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : ""
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : ""
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
  return { year, from, to, throttleMs, limit, force, onlyIncomplete, gameIdsOverride }
}

function jstDeadlineUtcMs(ymd, hm) {
  const [hh, mm] = String(hm).split(":").map((x) => parseInt(x, 10))
  const utc = new Date(`${ymd}T00:00:00.000Z`).getTime()
  return utc + (hh - 9) * 60 * 60 * 1000 + mm * 60 * 1000
}

function gameDateForId(root, year, gameId) {
  const key = `${root}|${year}`
  let byDate = seasonIndexCache.get(key)
  if (!byDate) {
    const p = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
    try {
      byDate = JSON.parse(fs.readFileSync(p, "utf8"))?.byDate ?? {}
    } catch {
      byDate = {}
    }
    seasonIndexCache.set(key, byDate)
  }
  for (const [date, ids] of Object.entries(byDate)) {
    if (Array.isArray(ids) && ids.map(String).includes(String(gameId))) return date
  }
  return ""
}

function existingRawWasCapturedBeforeFinalization({ root, year, gameId, metaPath }) {
  const meta = readJsonIfExists(metaPath)
  const fetchedAt = meta?.fetchedAt ? new Date(String(meta.fetchedAt)) : null
  if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) return false
  const gameDate = gameDateForId(root, year, gameId)
  if (!gameDate) return false
  const finalizationMs = jstDeadlineUtcMs(gameDate, "23:30")
  return fetchedAt.getTime() < finalizationMs && Date.now() >= finalizationMs
}

function isCancelledGameMainRaw(root, gameId) {
  const mainPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  try {
    if (!fs.existsSync(mainPath)) return false
    return isSportsnaviMainGameCancelled(fs.readFileSync(mainPath, "utf8"), gameId)
  } catch {
    return false
  }
}

/**
 * 既存キャッシュが「パースに足る中身」があるときだけスキップ。
 * 空の CSR スケルトンだけが保存されている場合は再取得する（再発防止）。
 */
function shouldSkipExistingFetch({ root, year, kind, gameId, force, htmlPath, metaPath }) {
  if (force) return false
  if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) return false
  let html = ""
  try {
    html = fs.readFileSync(htmlPath, "utf8")
  } catch {
    return false
  }
  if (isHtmlFetchFailed(html)) return false

  const scheduleCancelled = isScheduleCancelledGame(root, year, gameId)
  const cancelled =
    scheduleCancelled === true
      ? true
      : scheduleCancelled === false
        ? false
        : isCancelledGameMainRaw(root, gameId)
  if (kind === "stats") {
    if (cancelled) return true
    if (existingRawWasCapturedBeforeFinalization({ root, year, gameId, metaPath })) return false
    return isStatsHtmlParseComplete(html)
  }
  if (cancelled) return true
  return countBbLiveTextSplits(html) >= 1
}

/** @param {string} root @param {string} gameId */
function isPhase2RawCompleteForGame(root, gameId) {
  const mainPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  const statsPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_stats", `${gameId}.html`)
  const textPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text", `${gameId}.html`)
  const htmlMain = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, "utf8") : null
  const htmlStats = fs.existsSync(statsPath) ? fs.readFileSync(statsPath, "utf8") : null
  const htmlText = fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : null
  return isPhase2RawComplete({ htmlMain, htmlStats, htmlText })
}

function rebuildStaleCanonicalForGameIds(root, year, gameIds) {
  if (!gameIds.length) return
  const script = path.join(root, "scripts", "phase2_build_canonical_from_raw_sportsnavi.mjs")
  const ids = gameIds.join(",")
  console.log(`[phase2:stats-text] canonical --only-stale for ${gameIds.length} game(s)…`)
  const r = spawnSync(process.execPath, [script, "--year", year, "--game-ids", ids, "--only-stale"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  })
  if (r.status !== 0) {
    const msg = `[phase2:stats-text] canonical rebuild exited with status ${r.status ?? "unknown"}`
    console.warn(msg)
    appendPipelineBulkLog(root, "phase2_fetch", msg)
    if (process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD === "1") {
      process.exit(r.status ?? 1)
    }
  }
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

/**
 * インデックス `byDate` を使って日付範囲で gameId を絞り込む。
 * `YYYY-MM-DD` は文字列比較で時系列順になる前提。
 * @param {any} idx
 * @param {string[]} gameIdsAll インデックス順（安定化用）
 * @param {string} from
 * @param {string} to
 */
function filterGameIdsByDateRange(idx, gameIdsAll, from, to) {
  const byDate = idx?.byDate
  if (!byDate || typeof byDate !== "object") return gameIdsAll
  const f = String(from || "").trim()
  const t = String(to || "").trim()
  if (!f && !t) return gameIdsAll

  const allowed = new Set()
  for (const [day, ids] of Object.entries(byDate)) {
    if (!day) continue
    if (f && day < f) continue
    if (t && day > t) continue
    if (!Array.isArray(ids)) continue
    for (const x of ids) {
      const s = String(x ?? "").trim()
      if (s) allowed.add(s)
    }
  }
  if (allowed.size === 0) return gameIdsAll
  return gameIdsAll.filter((g) => allowed.has(String(g).trim()))
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

async function fetchKind({ root, kind, year, force, throttleMs, targets }) {
  const outDir = path.join(root, "_data", "scraped_games", kind === "stats" ? "raw_sportsnavi_stats" : "raw_sportsnavi_text")
  const metaDir = path.join(outDir, "_meta")
  ensureDir(outDir)
  ensureDir(metaDir)

  const failuresPath = path.join(outDir, "_failures.json")
  const failures =
    readJsonIfExists(failuresPath) ?? ({ schemaVersion: "sportsnavi-raw-failures-v1", year, rows: [] })
  if (!failures.rows) failures.rows = []

  const fetchedAt = new Date().toISOString()
  const logEvery = Math.max(1, parseInt(process.env.TOPPAGE_PHASE2_LOG_EVERY ?? "4", 10) || 4)
  // 日付指定などで件数が少ないときはスキップも毎件ログ（間引きだと経過が飛ぶ）
  const skipLogStride = targets.length <= 24 ? 1 : logEvery
  let done = 0
  let skipped = 0
  let skippedCancelled = 0
  let failed = 0
  let retriedIncomplete = 0

  for (let i = 0; i < targets.length; i++) {
    const gameId = targets[i]
    const htmlPath = path.join(outDir, `${gameId}.html`)
    const metaPath = path.join(metaDir, `${gameId}.json`)
    const scheduleCancelled = isScheduleCancelledGame(root, year, gameId)
    if (scheduleCancelled === true) {
      skipped += 1
      skippedCancelled += 1
      console.log(
        `[phase2:stats-text] ${kind} ${i + 1}/${targets.length} ${gameId} … skip (schedule: 試合中止/ノーゲーム) fetched=${done} skipped=${skipped} failed=${failed}`,
      )
      continue
    }
    const effectiveForce = force || !shouldSkipExistingFetch({ root, year, kind, gameId, force: false, htmlPath, metaPath })
    if (!effectiveForce) {
      skipped += 1
      if (i === 0 || (i + 1) % skipLogStride === 0 || i + 1 === targets.length) {
        console.log(
          `[phase2:stats-text] ${kind} ${i + 1}/${targets.length} ${gameId} … skip (cached) fetched=${done} skipped=${skipped} failed=${failed}`,
        )
      }
      continue
    }

    const url = `https://baseball.yahoo.co.jp/npb/game/${encodeURIComponent(gameId)}/${kind}`
    const scheduleCancelledForFetch = isScheduleCancelledGame(root, year, gameId)
    const cancelled =
      scheduleCancelledForFetch === true
        ? true
        : scheduleCancelledForFetch === false
          ? false
          : isCancelledGameMainRaw(root, gameId)

    const writeSuccess = (text, httpStatus, httpStatusText) => {
      fs.writeFileSync(htmlPath, text, "utf8")
      writeJson(metaPath, {
        schemaVersion: "sportsnavi-game-raw-meta-v1",
        year,
        gameId,
        fetchedAt: new Date().toISOString(),
        kind,
        sourceUrl: url,
        http: { status: httpStatus, statusText: httpStatusText },
      })
    }

    try {
      const r = await fetchWithRetry(url, 3, 800)
      writeSuccess(r.text, r.status, r.statusText)
      done += 1

      // スポナビ stats/text は CSR で、初回レスポンスに選手行・bb-liveText が載らないことがある。数秒待って再取得する。
      if (!cancelled) {
        const complete =
          kind === "stats" ? isStatsHtmlParseComplete(r.text) : countBbLiveTextSplits(r.text) >= 1
        if (!complete) {
          for (let attempt = 0; attempt < 2; attempt++) {
            await sleep(2800 + attempt * 1200)
            retriedIncomplete += 1
            const r2 = await fetchWithRetry(url, 3, 800)
            const ok2 =
              kind === "stats"
                ? isStatsHtmlParseComplete(r2.text)
                : countBbLiveTextSplits(r2.text) >= 1
            writeSuccess(r2.text, r2.status, r2.statusText)
            if (ok2) break
          }
        }
      }

      console.log(
        `[phase2:stats-text] ${kind} ${i + 1}/${targets.length} ${gameId} … OK fetched=${done} skipped=${skipped} failed=${failed}`,
      )
    } catch (e) {
      failed += 1
      upsertFailure(failures, {
        gameId,
        kind,
        sourceUrl: url,
        fetchedAt,
        error: String(e?.message ?? e),
      })
      writeJson(failuresPath, failures)
      fs.writeFileSync(htmlPath, `FETCH_FAILED ${fetchedAt}\n${String(e?.message ?? e)}\n`, "utf8")
      console.log(`[phase2:stats-text] ${kind} ${i + 1}/${targets.length} ${gameId} … FETCH FAILED`)
    }

    if (throttleMs > 0) await sleep(throttleMs)
  }

  writeJson(failuresPath, failures)
  return { outDir, targets: targets.length, fetched: done, skipped, skippedCancelled, failed, retriedIncomplete }
}

async function main() {
  const { year, from, to, throttleMs, limit, force, onlyIncomplete, gameIdsOverride } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)

  let gameIds = []
  /** @type {any} */
  let idx = null
  if (gameIdsOverride && gameIdsOverride.length > 0) {
    gameIds = gameIdsOverride
  } else {
    idx = readJsonIfExists(indexPath)
    if (!idx || idx.schemaVersion !== "sportsnavi-schedule-season-index-v1") {
      console.error("[phase2:stats-text] missing or invalid index:", indexPath)
      console.error("  （または --game-ids で試合 ID を指定）")
      process.exit(1)
    }
    gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
    if (gameIds.length === 0) {
      console.error("[phase2:stats-text] empty gameIds in index:", indexPath)
      process.exit(1)
    }
    const before = gameIds.length
    gameIds = filterGameIdsByDateRange(idx, gameIds, from, to)
    if (from || to) {
      console.log(`[phase2:stats-text] date-range: from=${from || "(none)"} to=${to || "(none)"} ${before} → ${gameIds.length} game(s)`)
      if (gameIds.length === 0) {
        console.log("[phase2:stats-text] nothing to do (empty after date filter)")
        process.exit(0)
      }
    }
  }

  let targets = limit > 0 ? gameIds.slice(0, limit) : gameIds

  if (onlyIncomplete) {
    const before = targets.length
    targets = targets.filter((id) => isScheduleCancelledGame(root, year, id) !== true && !isPhase2RawCompleteForGame(root, id))
    console.log(`[phase2:stats-text] only-incomplete: ${targets.length} / ${before} game(s) need refetch`)
    if (targets.length === 0) {
      console.log("[phase2:stats-text] nothing to do")
      process.exit(0)
    }
  }

  const effectiveForce = force || onlyIncomplete

  const stats = await fetchKind({ root, kind: "stats", year, force: effectiveForce, throttleMs, targets })
  const text = await fetchKind({ root, kind: "text", year, force: effectiveForce, throttleMs, targets })

  console.log(
    `[phase2:stats-text] year=${year} targets=${targets.length} ` +
      `stats(fetched=${stats.fetched}, skipped=${stats.skipped}, failed=${stats.failed}, incompleteRetries=${stats.retriedIncomplete ?? 0}) ` +
      `text(fetched=${text.fetched}, skipped=${text.skipped}, failed=${text.failed}, incompleteRetries=${text.retriedIncomplete ?? 0}) ` +
      `scheduleCancelled(stats=${stats.skippedCancelled ?? 0}, text=${text.skippedCancelled ?? 0})`,
  )
  if (
    stats.failed > 0 ||
    text.failed > 0 ||
    (stats.retriedIncomplete ?? 0) > 0 ||
    (text.retriedIncomplete ?? 0) > 0
  ) {
    appendPipelineBulkLog(
      root,
      "phase2_fetch",
      `stats failed=${stats.failed} incompleteRetries=${stats.retriedIncomplete ?? 0}; text failed=${text.failed} incompleteRetries=${text.retriedIncomplete ?? 0}; targets=${targets.length}`,
    )
  }

  const shouldRebuildCanonical =
    targets.length > 0 &&
    ((stats.fetched ?? 0) > 0 || (text.fetched ?? 0) > 0 || onlyIncomplete || force)
  if (shouldRebuildCanonical) {
    rebuildStaleCanonicalForGameIds(root, year, targets)
    appendPipelineBulkLog(
      root,
      "phase2_fetch",
      `canonical --only-stale after fetch: gameIds=${targets.length} statsFetched=${stats.fetched} textFetched=${text.fetched}`,
    )
  }
}

main().catch((e) => {
  console.error("[phase2:stats-text] failed:", e)
  process.exit(1)
})
