/**
 * 当日の全試合が終了相当になるまで監視し、条件を満たしたら日次一括パイプラインを起動する。
 *
 * 監視開始（JST）:
 *   - 土日: 18:00
 *   - 平日: 21:00
 * タスク スケジューラは毎日 18:00 にこのスクリプトを起動すれば、平日は 21:00 まで待ってから監視を始める。
 *
 * 試合終了判定: `lib/yahooGame/sportsnaviGameWatchStatus.mjs`
 *   - ライブ fetch（キャッシュは使わない）
 *   - 試合前 / 試合中（回表記）→ 未完了
 *   - テキストに「試合終了」または stats+text がパース可能 → 完了
 *   - 中止・ノーゲーム → 完了扱い（取得不要）
 *
 * 使い方:
 *   node scripts/watch_daily_pipeline.mjs
 *   node scripts/watch_daily_pipeline.mjs --year 2026 --poll-minutes 15
 *   node scripts/watch_daily_pipeline.mjs --once --dry-run
 *   node scripts/watch_daily_pipeline.mjs --date 2026-05-20
 *   node scripts/watch_daily_pipeline.mjs --deadline 02:30
 *
 * npm:
 *   npm run watch:daily-pipeline
 *   npm run watch:daily-pipeline:once
 */

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { classifySportsnaviGameForDailyPipeline } from "../lib/yahooGame/sportsnaviGameWatchStatus.mjs"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"
import { writeJsonFileWithRetrySync } from "./writeFileWithRetry.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const dateIdx = argv.indexOf("--date")
  const pollIdx = argv.indexOf("--poll-minutes")
  const deadlineIdx = argv.indexOf("--deadline")
  const throttleIdx = argv.indexOf("--throttle-ms")
  return {
    year: yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026",
    dateJst: dateIdx >= 0 ? String(argv[dateIdx + 1] ?? "").trim() : "",
    pollMinutes: pollIdx >= 0 ? Math.max(5, parseInt(String(argv[pollIdx + 1] ?? "15"), 10) || 15) : 15,
    /** 翌日 JST の時刻 HH:MM まで待ってから強制起動（例 02:30） */
    deadline: deadlineIdx >= 0 ? String(argv[deadlineIdx + 1] ?? "").trim() : "02:30",
    throttleMs: throttleIdx >= 0 ? Math.max(0, parseInt(String(argv[throttleIdx + 1] ?? "400"), 10) || 0) : 400,
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    force: argv.includes("--force"),
    skipWaitForStart: argv.includes("--skip-wait-for-start"),
    noPipeline: argv.includes("--no-pipeline"),
    weekdayStart: "21:00",
    weekendStart: "18:00",
  }
}

function todayJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function nowJstParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date())
  /** @type {Record<string, string>} */
  const m = {}
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value
  }
  return m
}

function log(msg) {
  const p = nowJstParts()
  console.log(`[watch:daily-pipeline] [${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} JST] ${msg}`)
}

function parseHm(hm) {
  const [h, mi] = hm.split(":").map((x) => parseInt(x, 10))
  return { hour: h, minute: mi }
}

/** @param {string} ymd */
function watchStartHmForDate(ymd) {
  const noon = new Date(`${ymd}T12:00:00+09:00`)
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(noon)
  if (dow === "Sat" || dow === "Sun") return parseHm("18:00")
  return parseHm("21:00")
}

function jstMsFromYmdHm(ymd, hour, minute) {
  return new Date(
    `${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).getTime()
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
  return { ok: res.ok, status: res.status, text }
}

async function fetchWithRetry(url, tries = 3, backoffMs = 800) {
  let lastErr = null
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchText(url)
      if (r.ok) return r.text
      lastErr = new Error(`HTTP ${r.status}`)
    } catch (e) {
      lastErr = e
    }
    if (i < tries - 1) await sleep(backoffMs * (i + 1))
  }
  throw lastErr ?? new Error("fetch failed")
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function lockPath(dateJst) {
  return path.join(root, "_data", "scraped_games", "_meta", `watch_pipeline_${dateJst}.lock`)
}

function alreadyRanToday(dateJst, force) {
  if (force) return false
  const p = lockPath(dateJst)
  return fs.existsSync(p)
}

function writeLock(dateJst, payload) {
  const p = lockPath(dateJst)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  writeJsonFileWithRetrySync(p, payload)
}

function refreshPhase0ForDate(year, dateJst) {
  log(`Phase0 更新 date=${dateJst}`)
  execSync(
    `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${dateJst} --to ${dateJst} --merge`,
    { cwd: root, stdio: "inherit", env: process.env },
  )
}

function gameIdsForDate(year, dateJst) {
  const snapPath = path.join(
    root,
    "_data",
    "sportsnavi_schedule_snapshots",
    "by_date",
    `${dateJst}.json`,
  )
  const snap = readJsonIfExists(snapPath)
  if (snap?.gameIds?.length) return snap.gameIds.map(String)

  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJsonIfExists(idxPath)
  const fromIndex = idx?.byDate?.[dateJst]
  if (Array.isArray(fromIndex) && fromIndex.length > 0) return fromIndex.map(String)
  return []
}

async function fetchGameHtmlTriplet(gameId) {
  const base = `https://baseball.yahoo.co.jp/npb/game/${encodeURIComponent(gameId)}`
  const [htmlMain, htmlStats, htmlText] = await Promise.all([
    fetchWithRetry(`${base}/index`),
    fetchWithRetry(`${base}/stats`),
    fetchWithRetry(`${base}/text`),
  ])
  return { htmlMain, htmlStats, htmlText }
}

async function pollGamesOnce(year, dateJst, throttleMs) {
  refreshPhase0ForDate(year, dateJst)
  const gameIds = gameIdsForDate(year, dateJst)
  if (gameIds.length === 0) {
    log(`当日の試合なし (${dateJst}) → パイプラインは起動しません`)
    return { allReady: true, gameIds: [], results: [], noGames: true }
  }

  /** @type {Array<{ gameId: string, classification: ReturnType<typeof classifySportsnaviGameForDailyPipeline> }>} */
  const results = []
  for (let i = 0; i < gameIds.length; i++) {
    const gameId = gameIds[i]
    try {
      const htmls = await fetchGameHtmlTriplet(gameId)
      const classification = classifySportsnaviGameForDailyPipeline(htmls)
      results.push({ gameId, classification })
      log(
        `  ${i + 1}/${gameIds.length} ${gameId} status=${classification.status} ready=${classification.ready} card="${classification.cardState}" reason=${classification.reason}`,
      )
    } catch (e) {
      results.push({
        gameId,
        classification: {
          ready: false,
          status: "fetch_failed",
          cardState: "",
          statsRows: -1,
          textBlocks: -1,
          reason: String(e?.message ?? e),
        },
      })
      log(`  ${i + 1}/${gameIds.length} ${gameId} FETCH_FAILED: ${e?.message ?? e}`)
    }
    if (throttleMs > 0 && i + 1 < gameIds.length) await sleep(throttleMs)
  }

  const allReady = results.every((r) => r.classification.ready)
  return { allReady, gameIds, results, noGames: false }
}

function runDailyPipeline() {
  log("npm run daily:npb-pipeline:finalize を起動します（20:30 prefetch の続き）")
  execSync("npm run daily:npb-pipeline:finalize", { cwd: root, stdio: "inherit", env: process.env })
}

function deadlineMsForWatchDate(dateJst, deadlineHm) {
  const { hour, minute } = parseHm(deadlineHm)
  const [y, m, d] = dateJst.split("-").map((x) => parseInt(x, 10))
  const next = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  next.setUTCDate(next.getUTCDate() + 1)
  const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`
  return jstMsFromYmdHm(nextYmd, hour, minute)
}

async function waitUntilWatchStart(dateJst, skipWait) {
  if (skipWait) return
  const { hour, minute } = watchStartHmForDate(dateJst)
  const startMs = jstMsFromYmdHm(dateJst, hour, minute)
  const now = Date.now()
  if (now >= startMs) {
    log(`監視開始時刻 (${hour}:${String(minute).padStart(2, "0")}) を過ぎているため、すぐに監視します`)
    return
  }
  const waitMs = startMs - now
  log(
    `監視開始まで待機 (${hour}:${String(minute).padStart(2, "0")} JST) 約 ${Math.ceil(waitMs / 60000)} 分`,
  )
  await sleep(waitMs)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dateJst = args.dateJst || todayJstYmd()

  if (alreadyRanToday(dateJst, args.force)) {
    log(`本日 (${dateJst}) は既に起動済みです (${lockPath(dateJst)})。--force で再実行`)
    return
  }

  log(
    `開始 year=${args.year} date=${dateJst} poll=${args.pollMinutes}min deadline=翌${args.deadline} dryRun=${args.dryRun}`,
  )

  await waitUntilWatchStart(dateJst, args.skipWaitForStart)

  const deadlineMs = deadlineMsForWatchDate(dateJst, args.deadline)

  for (;;) {
    const poll = await pollGamesOnce(args.year, dateJst, args.throttleMs)

    if (poll.noGames) {
      if (!args.dryRun) {
        writeLock(dateJst, { ranAt: new Date().toISOString(), reason: "no_games_today" })
      }
      return
    }

    if (poll.allReady) {
      log(`全 ${poll.gameIds.length} 試合が終了相当 → 一括取得を開始します`)
      appendPipelineBulkLog(
        root,
        "watch:daily-pipeline",
        `all_ready date=${dateJst} games=${poll.gameIds.join(",")}`,
      )
      if (!args.dryRun && !args.noPipeline) {
        writeLock(dateJst, {
          ranAt: new Date().toISOString(),
          reason: "all_games_ready",
          gameIds: poll.gameIds,
          results: poll.results.map((r) => ({
            gameId: r.gameId,
            status: r.classification.status,
            reason: r.classification.reason,
          })),
        })
        runDailyPipeline()
      } else {
        log("dry-run / --no-pipeline のため daily:npb-pipeline は実行しません")
      }
      return
    }

    const pending = poll.results.filter((r) => !r.classification.ready)
    log(
      `未完了 ${pending.length}/${poll.gameIds.length}: ${pending.map((r) => `${r.gameId}(${r.classification.status})`).join(", ")}`,
    )

    if (args.once) {
      log("--once のため終了（パイプラインは起動しません）")
      process.exitCode = 2
      return
    }

    if (Date.now() >= deadlineMs) {
      log(
        `デッドライン (翌 ${args.deadline} JST) に到達。未完了があってもパイプラインを起動します`,
      )
      appendPipelineBulkLog(
        root,
        "watch:daily-pipeline",
        `deadline_force date=${dateJst} pending=${pending.map((r) => r.gameId).join(",")}`,
      )
      if (!args.dryRun && !args.noPipeline) {
        writeLock(dateJst, {
          ranAt: new Date().toISOString(),
          reason: "deadline_force",
          pending: pending.map((r) => ({
            gameId: r.gameId,
            status: r.classification.status,
          })),
        })
        runDailyPipeline()
      }
      return
    }

    log(`${args.pollMinutes} 分後に再監視します`)
    await sleep(args.pollMinutes * 60_000)
  }
}

main().catch((e) => {
  console.error("[watch:daily-pipeline] failed:", e)
  process.exit(1)
})
