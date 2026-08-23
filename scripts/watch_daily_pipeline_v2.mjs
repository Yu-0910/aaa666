#!/usr/bin/env node
/**
 * v2 監視:
 * - 旧 watch は残す
 * - prefetch を繰り返し、必要データが埋まったら v2 pipeline を起動
 * - トリガーは「試合終了表示」ではなく「local raw/canonical readiness」
 *
 * 用法:
 *   node scripts/watch_daily_pipeline_v2.mjs --year 2026
 *   node scripts/watch_daily_pipeline_v2.mjs --year 2026 --once --dry-run
 *   node scripts/watch_daily_pipeline_v2.mjs --year 2026 --endgame-poll-minutes 2
 *   node scripts/watch_daily_pipeline_v2.mjs --year 2026 --date 2026-07-18 --no-auto-deploy-production
 */

import fs from "node:fs"
import path from "node:path"
import { execSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { appendPipelineBulkLog, formatJstTimestamp } from "./pipelineBulkLog.mjs"
import { writeJsonFileWithRetrySync } from "./writeFileWithRetry.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function withYahooScrapePermission(env = process.env) {
  return {
    ...env,
    YAHOO_SCRAPE_ENABLED: env.YAHOO_SCRAPE_ENABLED || "1",
  }
}

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const dateIdx = argv.indexOf("--date")
  const pollIdx = argv.indexOf("--poll-minutes")
  const endgamePollIdx = argv.indexOf("--endgame-poll-minutes")
  const deadlineIdx = argv.indexOf("--deadline")
  const pollMinutesRaw = pollIdx >= 0 ? parseInt(String(argv[pollIdx + 1] ?? "12"), 10) || 12 : 12
  const endgamePollMinutesRaw =
    endgamePollIdx >= 0 ? parseInt(String(argv[endgamePollIdx + 1] ?? "2"), 10) || 2 : 2
  return {
    year: yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026",
    dateJst: dateIdx >= 0 ? String(argv[dateIdx + 1] ?? "").trim() : "",
    pollMinutes: Math.max(5, pollMinutesRaw),
    endgamePollMinutes: Math.max(1, endgamePollMinutesRaw),
    deadline: deadlineIdx >= 0 ? String(argv[deadlineIdx + 1] ?? "").trim() : "02:30",
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    force: argv.includes("--force"),
    skipWaitForStart: argv.includes("--skip-wait-for-start"),
    partialPhase4: !argv.includes("--no-partial-phase4"),
    autoDeployProduction: !argv.includes("--no-auto-deploy-production"),
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
  }).formatToParts(new Date())
  const m = {}
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value
  return m
}

function log(msg) {
  const p = nowJstParts()
  console.log(`[watch:daily-pipeline:v2] [${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} JST] ${msg}`)
}

function parseHm(hm) {
  const [h, mi] = hm.split(":").map((x) => parseInt(x, 10))
  return { hour: h, minute: mi }
}

function nthMonday(year, month1, nth) {
  const first = new Date(`${year}-${String(month1).padStart(2, "0")}-01T12:00:00+09:00`)
  const dow = first.getDay()
  const day = 1 + ((8 - dow) % 7) + (nth - 1) * 7
  return day
}

function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

function autumnEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

function formatYmd(year, month1, day) {
  return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function baseJapanHolidayMap(year) {
  const map = new Map()
  const add = (month1, day, name) => map.set(formatYmd(year, month1, day), name)

  add(1, 1, "元日")
  add(2, 11, "建国記念の日")
  add(2, 23, "天皇誕生日")
  add(3, vernalEquinoxDay(year), "春分の日")
  add(4, 29, "昭和の日")
  add(5, 3, "憲法記念日")
  add(5, 4, "みどりの日")
  add(5, 5, "こどもの日")
  add(8, 11, "山の日")
  add(9, autumnEquinoxDay(year), "秋分の日")
  add(11, 3, "文化の日")
  add(11, 23, "勤労感謝の日")

  add(1, nthMonday(year, 1, 2), "成人の日")
  add(7, nthMonday(year, 7, 3), "海の日")
  add(9, nthMonday(year, 9, 3), "敬老の日")
  add(10, nthMonday(year, 10, 2), "スポーツの日")

  return map
}

function buildJapanHolidayMap(year) {
  const holidays = baseJapanHolidayMap(year)
  const observed = []
  for (const ymd of [...holidays.keys()].sort()) {
    const d = new Date(`${ymd}T12:00:00+09:00`)
    if (d.getDay() !== 0) continue
    const sub = new Date(d)
    do {
      sub.setDate(sub.getDate() + 1)
    } while (holidays.has(formatYmd(sub.getFullYear(), sub.getMonth() + 1, sub.getDate())))
    observed.push([formatYmd(sub.getFullYear(), sub.getMonth() + 1, sub.getDate()), "振替休日"])
  }
  for (const [ymd, name] of observed) holidays.set(ymd, name)

  const dates = [...holidays.keys()].sort()
  for (let i = 0; i < dates.length - 1; i++) {
    const a = new Date(`${dates[i]}T12:00:00+09:00`)
    const b = new Date(`${dates[i + 1]}T12:00:00+09:00`)
    const diffDays = Math.round((b.getTime() - a.getTime()) / 86400000)
    if (diffDays !== 2) continue
    const between = new Date(a)
    between.setDate(between.getDate() + 1)
    if (between.getDay() === 0) continue
    const ymd = formatYmd(between.getFullYear(), between.getMonth() + 1, between.getDate())
    if (!holidays.has(ymd)) holidays.set(ymd, "国民の休日")
  }

  return holidays
}

function japanHolidayName(ymd) {
  const [year] = ymd.split("-").map((x) => parseInt(x, 10))
  return buildJapanHolidayMap(year).get(ymd) || ""
}

function watchStartHmForDate(ymd) {
  const noon = new Date(`${ymd}T12:00:00+09:00`)
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(noon)
  if (dow === "Sat" || dow === "Sun" || japanHolidayName(ymd)) return parseHm("16:00")
  return parseHm("20:00")
}

function jstMsFromYmdHm(ymd, hour, minute) {
  return new Date(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`).getTime()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function lockPath(dateJst) {
  return path.join(root, "_data", "scraped_games", "_meta", `watch_pipeline_v2_${dateJst}.lock`)
}

function watchSummaryPath(dateJst) {
  return path.join(root, "_data", "scraped_games", "_meta", `watch_pipeline_v2_summary_${dateJst}.json`)
}

function watchSummaryLatestPath() {
  return path.join(root, "_data", "scraped_games", "_meta", "watch_pipeline_v2_summary_latest.json")
}

function pipelineRunSummaryPath(runId) {
  return path.join(root, "_data", "scraped_games", "_meta", `pipeline_v2_run_summary_${runId}.json`)
}

function readLockPayload(dateJst) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(dateJst), "utf8"))
  } catch {
    return null
  }
}

function warnWriteFailure(label, error) {
  const message = String(error?.message || error)
  log(`WARN ${label} 書き込み失敗: ${message}`)
}

function tryWriteJsonFile(filePath, payload, label) {
  try {
    writeJsonFileWithRetrySync(filePath, payload)
    return true
  } catch (error) {
    warnWriteFailure(label, error)
    return false
  }
}

function extractPipelineWindowFromReason(reason) {
  const text = String(reason || "")
  const match = text.match(/--from (\d{4}-\d{2}-\d{2}) --to (\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  return { from: match[1], to: match[2] }
}

function shouldAutoReplaceFailedLock(dateJst, existing) {
  if (!existing || existing.state !== "failed") return false
  if (existing.dateJst && String(existing.dateJst) === String(dateJst)) return true
  if (existing.dateJst && String(existing.dateJst) !== String(dateJst)) return true
  const window = extractPipelineWindowFromReason(existing.reason)
  if (!window) return false
  return true
}

function writeWatchSummary(dateJst, summary) {
  const dir = path.join(root, "_data", "scraped_games", "_meta")
  fs.mkdirSync(dir, { recursive: true })
  const payload = {
    ...summary,
    updatedAtJst: formatJstTimestamp(),
  }
  tryWriteJsonFile(watchSummaryPath(dateJst), payload, `watch summary ${dateJst}`)
  tryWriteJsonFile(watchSummaryLatestPath(), payload, "watch summary latest")
}

function pushWatchSummaryEvent(summary, key, event, { limit = 80 } = {}) {
  const next = Array.isArray(summary[key]) ? summary[key].slice() : []
  next.push({
    atJst: formatJstTimestamp(),
    ...event,
  })
  if (next.length > limit) next.splice(0, next.length - limit)
  summary[key] = next
}

function writeLockPayload(dateJst, payload, { bestEffort = false } = {}) {
  const p = lockPath(dateJst)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  if (bestEffort) {
    return tryWriteJsonFile(p, payload, `watch lock ${dateJst}`)
  }
  writeJsonFileWithRetrySync(p, payload)
  return true
}

function acquireStartupLock(dateJst, { force, year, dryRun }) {
  const existedBefore = fs.existsSync(lockPath(dateJst))
  const payload = {
    schemaVersion: "watch-pipeline-v2-lock-1",
    dateJst,
    year,
    pid: process.pid,
    state: dryRun ? "running-dry-run" : "running",
    startedAtJst: formatJstTimestamp(),
    updatedAtJst: formatJstTimestamp(),
  }
  const p = lockPath(dateJst)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  if (force) {
    writeLockPayload(dateJst, { ...payload, force: true })
    return { acquired: true, payload, replaced: existedBefore }
  }
  try {
    const fd = fs.openSync(p, "wx")
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2), "utf8")
    fs.closeSync(fd)
    return { acquired: true, payload, replaced: false }
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = readLockPayload(dateJst)
      if (shouldAutoReplaceFailedLock(dateJst, existing)) {
        writeLockPayload(dateJst, {
          ...payload,
          autoReplacedFailedLock: true,
          replacedFailedLockState: existing?.state || null,
          replacedFailedLockReason: existing?.reason || null,
        })
        return { acquired: true, payload, replaced: true, replacedExisting: existing }
      }
      return { acquired: false, existing }
    }
    throw error
  }
}

function alreadyRanToday(dateJst, force) {
  return !force && fs.existsSync(lockPath(dateJst))
}

function writeLock(dateJst, payload) {
  const existing = readLockPayload(dateJst) || {}
  writeLockPayload(dateJst, {
    ...existing,
    ...payload,
    updatedAtJst: formatJstTimestamp(),
  }, { bestEffort: true })
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
  if (Date.now() >= startMs) {
    log(`監視開始時刻 ${hour}:${String(minute).padStart(2, "0")} を過ぎているため即開始します`)
    return
  }
  const waitMs = startMs - Date.now()
  log(`監視開始まで待機 (${hour}:${String(minute).padStart(2, "0")} JST) 約 ${Math.ceil(waitMs / 60000)} 分`)
  await sleep(waitMs)
}

function runPrefetch(year, dateJst, dryRun) {
  const cmd = `node scripts/run_daily_npb_pipeline_v2.mjs --year ${year} --from ${dateJst} --to ${dateJst} --prefetch-only${dryRun ? " --dry-run" : ""}`
  log(`prefetch 実行: ${cmd}`)
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: withYahooScrapePermission() })
}

function listGameIdsForDate(year, dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  if (fs.existsSync(snapPath)) {
    try {
      const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"))
      if (Array.isArray(snap?.gameIds)) return snap.gameIds.map(String)
    } catch {
      // ignore
    }
  }

  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(idxPath)) return []
  try {
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"))
    const ids = idx?.byDate?.[dateJst]
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

function scheduleStatusMapForDate(dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  if (!fs.existsSync(snapPath)) return new Map()
  try {
    const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"))
    const games = Array.isArray(snap?.games) ? snap.games : []
    return new Map(
      games.map((g) => [String(g.gameId ?? "").trim(), String(g.statusText ?? "").trim()]),
    )
  } catch {
    return new Map()
  }
}

function scheduleSnapshotFetchedAtMs(dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  const snap = readJsonOrNull(snapPath)
  const fetchedAt = snap?.fetchedAt ? new Date(String(snap.fetchedAt)) : null
  return fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt.getTime() : 0
}

function scheduleFinishSeenPath() {
  return path.join(root, "_data", "scraped_games", "_meta", "schedule_finish_seen_v1.json")
}

function readScheduleFinishSeen() {
  const payload = readJsonOrNull(scheduleFinishSeenPath())
  return payload && typeof payload === "object" ? payload : { schemaVersion: "schedule-finish-seen-v1", games: {} }
}

function writeScheduleFinishSeen(payload) {
  const p = scheduleFinishSeenPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  tryWriteJsonFile(
    p,
    {
      schemaVersion: "schedule-finish-seen-v1",
      games: payload?.games && typeof payload.games === "object" ? payload.games : {},
      updatedAtJst: formatJstTimestamp(),
    },
    "schedule finish seen",
  )
}

function scheduleFinishSeenKey(dateJst, gameId) {
  return `${dateJst}:${gameId}`
}

function rememberFirstFinishedSeen(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  if (statusMap.size === 0) return
  const fetchedAtMs = scheduleSnapshotFetchedAtMs(dateJst)
  const firstSeenAt = fetchedAtMs > 0 ? new Date(fetchedAtMs).toISOString() : new Date().toISOString()
  const payload = readScheduleFinishSeen()
  const games = payload.games && typeof payload.games === "object" ? { ...payload.games } : {}
  let changed = false
  for (const [gameId, status] of statusMap.entries()) {
    if (!/試合終了/.test(String(status || ""))) continue
    const key = scheduleFinishSeenKey(dateJst, gameId)
    if (games[key]?.firstFinishedSeenAt) continue
    games[key] = {
      dateJst,
      gameId,
      firstFinishedSeenAt: firstSeenAt,
      statusText: String(status || ""),
      source: "sportsnavi_schedule_snapshot",
    }
    changed = true
  }
  if (changed) writeScheduleFinishSeen({ ...payload, games })
}

function firstFinishedSeenAtMs(dateJst, gameId) {
  const payload = readScheduleFinishSeen()
  const entry = payload?.games?.[scheduleFinishSeenKey(dateJst, gameId)]
  const value = entry?.firstFinishedSeenAt
  const parsed = value ? new Date(String(value)) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0
}

function scheduleAllFinishedForDate(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  if (statusMap.size === 0) return false
  for (const status of statusMap.values()) {
    if (!/試合終了|試合中止|ノーゲーム/.test(status)) return false
  }
  return true
}

function gateReadinessUntilScheduleFinal(dateJst, readiness) {
  if (!readiness?.ready || scheduleAllFinishedForDate(dateJst)) return readiness
  const statusMap = scheduleStatusMapForDate(dateJst)
  const pendingStatuses = [...statusMap.entries()]
    .filter(([, status]) => !/試合終了|試合中止|ノーゲーム/.test(String(status || "")))
    .map(([gameId, status]) => `${gameId}:${status || "status_unknown"}`)
  return {
    ...readiness,
    ready: false,
    pending: [
      ...(readiness.pending || []),
      `schedule_not_all_finished${pendingStatuses.length ? `=${pendingStatuses.join("|")}` : ""}`,
    ],
  }
}

function scheduleHasStartedOrFinishedForDate(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  for (const status of statusMap.values()) {
    if (/試合中|試合終了|試合中止|ノーゲーム/.test(status)) return true
  }
  return false
}

function finishedGameIdsForDate(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  const ids = []
  for (const [gameId, status] of statusMap.entries()) {
    if (/試合終了/.test(status)) ids.push(gameId)
  }
  return ids
}

function parseScoreRawGateIncomplete(stdout, stderr) {
  const text = `${stdout || ""}\n${stderr || ""}`
  const csvLine = text.match(/SCORE_RAW_GATE_INCOMPLETE_CSV=([0-9,]+)/)
  if (csvLine?.[1]) return csvLine[1].split(",").filter(Boolean)
  const ids = []
  for (const m of text.matchAll(/-\s+(\d+):\s+([^\r\n]+)/g)) {
    ids.push(m[1])
  }
  return [...new Set(ids)]
}

function parseScoreRawGateReasons(stdout, stderr) {
  const text = `${stdout || ""}\n${stderr || ""}`
  const reasons = {}
  for (const m of text.matchAll(/-\s+(\d+):\s+([^\r\n]+)/g)) {
    reasons[m[1]] = String(m[2] || "").trim() || "unknown"
  }
  return reasons
}

function pendingGameIdsForRepair(readiness) {
  const ids = new Set()
  for (const p of readiness.pending ?? []) {
    const text = String(p)
    if (
      !/score_raw_gate|raw_before_game_finished|canonical_before_score_raw|missing_canonical|battingLines=0|textPlayByPlay=0|bad_canonical_json/.test(
        text,
      )
    ) {
      continue
    }
    for (const m of text.matchAll(/\d{10}/g)) ids.add(m[0])
  }
  for (const id of readiness.scoreRawGateGameIds ?? []) ids.add(String(id))
  return [...ids]
}

function repairReasonsByGame(readiness, gameIds) {
  const wanted = new Set(gameIds.map(String))
  const reasons = {}
  for (const id of wanted) reasons[id] = []
  for (const p of readiness.pending ?? []) {
    const text = String(p)
    for (const m of text.matchAll(/\d{10}/g)) {
      const id = m[0]
      if (wanted.has(id)) reasons[id].push(text)
    }
  }
  const gateReasons = readiness.scoreRawGateReasons || {}
  for (const id of readiness.scoreRawGateGameIds ?? []) {
    const textId = String(id)
    if (!wanted.has(textId)) continue
    reasons[textId].push(`score_raw_gate:${gateReasons[textId] || "unknown"}`)
  }
  return Object.fromEntries(
    Object.entries(reasons).map(([id, values]) => [id, [...new Set(values.length ? values : ["unknown"])]]),
  )
}

function repairAttemptKey(dateJst, gameId) {
  return `${gameId}:${firstFinishedSeenAtMs(dateJst, gameId) || scheduleSnapshotFetchedAtMs(dateJst)}`
}

function readJsonOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function rawMetaFetchedAtMs(kind, gameId) {
  const dirName =
    kind === "score"
      ? path.join("raw_sportsnavi_score", "_meta")
      : kind === "stats"
        ? path.join("raw_sportsnavi_stats", "_meta")
        : path.join("raw_sportsnavi_text", "_meta")
  const metaPath = path.join(root, "_data", "scraped_games", dirName, `${gameId}.json`)
  const meta = readJsonOrNull(metaPath)
  const fetchedAt = meta?.fetchedAt ? new Date(String(meta.fetchedAt)) : null
  return fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt.getTime() : 0
}

function canonicalBuiltAtMs(doc) {
  const value = doc?.builtAt || doc?.normalizedFetchedAt || doc?.game?.meta?.builtAt || ""
  const parsed = value ? new Date(String(value)) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0
}

function phase10PitchRowsCount(gameId) {
  const phase10Path = path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
  const phase10 = readJsonOrNull(phase10Path)
  return Array.isArray(phase10?.pitchRows) ? phase10.pitchRows.length : 0
}

function scoreRawMetaComplete(gameId) {
  const metaPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score", "_meta", `${gameId}.json`)
  const meta = readJsonOrNull(metaPath)
  if (!meta) return false
  const failed = Number(meta?.failedPlateAppearances ?? 0)
  const plateAppearances = Number(meta?.plateAppearances ?? 0)
  const scorePageCount = Number(meta?.scorePageCount ?? 0)
  if (Number.isFinite(failed) && failed > 0) return false
  if (Number.isFinite(plateAppearances) && plateAppearances > 0) {
    return Number.isFinite(scorePageCount) && scorePageCount >= plateAppearances
  }
  return scoreRawMetaSignature(gameId) !== ""
}

function phase4ConsistencyPending(gameId, doc) {
  const pitchRows = phase10PitchRowsCount(gameId)
  const pitchEvents = Array.isArray(doc?.domain?.pitchEvents) ? doc.domain.pitchEvents.length : 0
  if (pitchRows <= 0) {
    if (pitchEvents <= 0 && scoreRawMetaComplete(gameId)) return `${gameId}:phase4_missing`
    return ""
  }
  if (pitchEvents !== pitchRows) return `${gameId}:phase4_pitch_events=${pitchEvents}/${pitchRows}`
  return ""
}

function textPlayRowsCount(textPlayByPlay) {
  if (Array.isArray(textPlayByPlay)) return textPlayByPlay.length
  if (Array.isArray(textPlayByPlay?.sections)) {
    return textPlayByPlay.sections.reduce((sum, section) => {
      const rows = section?.rows ?? section?.plays ?? section?.events ?? []
      return sum + (Array.isArray(rows) ? rows.length : 0)
    }, 0)
  }
  return 0
}

function checkLocalReady(year, dateJst) {
  const gameIds = listGameIdsForDate(year, dateJst)
  if (gameIds.length === 0) {
    return { ready: true, noGames: true, pending: [] }
  }

  const gate = spawnSync(
    "python",
    [
      "scripts/gate_score_raw_complete_for_pipeline.py",
      "--year",
      year,
      "--from-date",
      dateJst,
      "--to-date",
      dateJst,
      "--fail",
      "--emit-incomplete-csv",
    ],
    { cwd: root, stdio: "pipe", env: process.env, encoding: "utf8" },
  )
  const scoreRawGateGameIds = gate.status !== 0 ? parseScoreRawGateIncomplete(gate.stdout, gate.stderr) : []
  const scoreRawGateReasons = gate.status !== 0 ? parseScoreRawGateReasons(gate.stdout, gate.stderr) : {}
  const pending = []
  if (gate.status !== 0) {
    pending.push(`score_raw_gate${scoreRawGateGameIds.length ? `:${scoreRawGateGameIds.join(",")}` : ""}`)
  }
  const scoreRawCompletenessGameIds = new Set(scoreRawGateGameIds)

  const statusMap = scheduleStatusMapForDate(dateJst)
  for (const gameId of gameIds) {
    const status = statusMap.get(gameId) || ""
    if (/試合中止|ノーゲーム/.test(status)) continue
    const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    if (!fs.existsSync(canonicalPath)) {
      pending.push(`${gameId}:missing_canonical`)
      continue
    }
    try {
      const doc = JSON.parse(fs.readFileSync(canonicalPath, "utf8"))
      const battingLines = Array.isArray(doc?.domain?.battingLines) ? doc.domain.battingLines.length : 0
      const textRows = textPlayRowsCount(doc?.game?.textPlayByPlay)
      if (battingLines <= 0) pending.push(`${gameId}:battingLines=0`)
      if (textRows <= 0) pending.push(`${gameId}:textPlayByPlay=0`)
      if (/試合終了/.test(status)) {
        const finishedSeenAtMs = firstFinishedSeenAtMs(dateJst, gameId) || scheduleSnapshotFetchedAtMs(dateJst)
        const staleKinds =
          finishedSeenAtMs > 0
            ? ["stats", "text", "score"].filter((kind) => rawMetaFetchedAtMs(kind, gameId) < finishedSeenAtMs)
            : []
        if (staleKinds.length > 0) {
          pending.push(`${gameId}:raw_before_game_finished=${staleKinds.join("+")}`)
          scoreRawCompletenessGameIds.add(gameId)
        }
        const scoreFetchedAtMs = rawMetaFetchedAtMs("score", gameId)
        const builtAtMs = canonicalBuiltAtMs(doc)
        if (scoreFetchedAtMs > 0 && builtAtMs > 0 && scoreFetchedAtMs > builtAtMs + 1000) {
          pending.push(`${gameId}:canonical_before_score_raw`)
          scoreRawCompletenessGameIds.add(gameId)
        }
        const phase4Pending = phase4ConsistencyPending(gameId, doc)
        if (phase4Pending) pending.push(phase4Pending)
      }
    } catch {
      pending.push(`${gameId}:bad_canonical_json`)
    }
  }

  return {
    ready: pending.length === 0,
    noGames: false,
    pending,
    scoreRawGateGameIds: [...scoreRawCompletenessGameIds],
    scoreRawGateReasons,
    gateStdErr: gate.stderr || "",
  }
}

function classifyWatchCompletionFromPipeline(runId) {
  const summary = readJsonOrNull(pipelineRunSummaryPath(runId))
  const status = String(summary?.status || "").trim()
  if (status === "completed-final") {
    return { summaryStatus: "completed-final", lockState: "completed-final", reason: "pipeline_completed_final", pipeline: summary }
  }
  if (status === "completed-deadline-force") {
    return { summaryStatus: "completed-with-deadline-force", lockState: "completed-with-deadline-force", reason: "deadline_force", pipeline: summary }
  }
  if (status === "completed-intermediate") {
    return { summaryStatus: "completed-nonfinal", lockState: "completed-nonfinal", reason: "pipeline_completed_nonfinal", pipeline: summary }
  }
  if (status === "completed-prefetch" || status === "completed-dry-run") {
    return { summaryStatus: status, lockState: status, reason: status, pipeline: summary }
  }
  return { summaryStatus: "completed", lockState: "completed", reason: "pipeline_completed", pipeline: summary }
}

function validateStandingsWindowFreshness(year, dateJst, dryRun) {
  const cmd =
    `npm run validate:standings-window-freshness -- --year ${year} --from ${dateJst} --to ${dateJst} --fail`
  log(`順位表 freshness 検証: ${cmd}`)
  if (dryRun) return
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
}

function repairStandingsWindow(year, dateJst, dryRun) {
  const rebuildCmd =
    `npm run phase29:build:standings -- --year ${year} --from ${dateJst} --to ${dateJst} --include-today`
  const publishCmd =
    `node scripts/display_publish_fast_2026.mjs --year ${year} --from ${dateJst} --to ${dateJst}`
  const validateCmd =
    `npm run validate:standings-window-freshness -- --year ${year} --from ${dateJst} --to ${dateJst} --fail`
  log(`順位表 self-heal: ${rebuildCmd}`)
  if (dryRun) return
  execSync(rebuildCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  log(`順位表 self-heal 公開: ${publishCmd}`)
  execSync(publishCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  log(`順位表 self-heal 検証: ${validateCmd}`)
  execSync(validateCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
}

function ensureStandingsFreshAfterFinalize(args, dateJst, summary, runId) {
  try {
    validateStandingsWindowFreshness(args.year, dateJst, args.dryRun)
  } catch (error) {
    const message = String(error?.message || error)
    log(`順位表 freshness 検証で不一致を検出したため phase29 を自己修復します: ${message}`)
    appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `standings_window_repair date=${dateJst}`)
    pushWatchSummaryEvent(summary, "repairs", {
      kind: "standings_window_repair",
      gameDate: dateJst,
      pipelineRunId: runId,
      message,
    })
    writeWatchSummary(dateJst, summary)
    repairStandingsWindow(args.year, dateJst, args.dryRun)
  }
}

function runPipelineV2(year, dateJst, dryRun, autoDeployProduction, trigger = {}) {
  const runId = `${dateJst}_${formatJstTimestamp().replace(" JST", "").replace(/[-: ]/g, "")}_watchpid${process.pid}`
  const triggerReasonArg = trigger.reason ? ` --trigger-reason ${trigger.reason}` : ""
  const triggerDetailArg = trigger.detail ? ` --trigger-detail "${String(trigger.detail).replace(/"/g, '\\"')}"` : ""
  const childEnv = autoDeployProduction
    ? withYahooScrapePermission()
    : withYahooScrapePermission({ ...process.env, TOPPAGE_ALLOW_PRODUCTION_STALE: "1" })
  const cmd =
    `node scripts/run_daily_npb_pipeline_v2.mjs --year ${year} --from ${dateJst} --to ${dateJst} --skip-prefetch --finalize-precomputed --run-id ${runId}` +
    `${autoDeployProduction ? " --auto-deploy-production" : ""}${dryRun ? " --dry-run" : ""}${triggerReasonArg}${triggerDetailArg}`
  log(`v2 pipeline 実行: ${cmd}`)
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: childEnv })
  return runId
}

function collectYahooBatterIdsForGames(gameIds) {
  const ids = new Set()
  for (const gameId of gameIds) {
    const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    const doc = readJsonOrNull(canonicalPath)
    for (const line of doc?.domain?.battingLines ?? []) {
      const id = String(line?.yahooPlayerId ?? "").trim()
      if (id) ids.add(id)
    }
    for (const row of doc?.game?.statsPlayerLinkedRows ?? []) {
      const id = String(row?.yahooPlayerId ?? "").trim()
      if (id) ids.add(id)
    }
    for (const pa of doc?.domain?.plateAppearances ?? []) {
      const id = String(pa?.yahooBatterId ?? "").trim()
      if (id) ids.add(id)
    }
  }
  return [...ids].sort()
}

function runPlayerDerivationPrecompute(year, gameIds, dryRun) {
  const yahooIds = collectYahooBatterIdsForGames(gameIds)
  if (yahooIds.length === 0) {
    log(`選手派生先行: 対象打者なし gameIds=${gameIds.join(",")}`)
    return
  }
  const idCsv = yahooIds.join(",")
  const cmds = [
    ["phase11 batting 差分", `npm run phase11:build:batting -- --only-yahoo-ids ${idCsv}`],
    ["phase16 batting count 差分", `npm run phase16:build:batting-count -- --only-yahoo-ids ${idCsv}`],
    ["phase13 context 差分", `npm run phase13:build:context -- --only-yahoo-ids ${idCsv}`],
  ]
  appendPipelineBulkLog(
    root,
    "watch:daily-pipeline:v2",
    `player_derivation_precompute_light gameIds=${gameIds.join(",")} yahooIds=${yahooIds.length} phases=phase11,phase16,phase13 phase15=defer_to_finalize`,
  )
  for (const [label, cmd] of cmds) {
    log(`選手派生先行: ${label}: ${yahooIds.length}人`)
    if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  }
}

function scoreRawMetaSignature(gameId) {
  const metaPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score", "_meta", `${gameId}.json`)
  if (!fs.existsSync(metaPath)) return ""
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"))
    const scoreIndexes = Array.isArray(meta?.scoreIndexes) ? meta.scoreIndexes.map(String) : []
    return JSON.stringify({
      fetchedAt: meta?.fetchedAt ?? "",
      plateAppearances: meta?.plateAppearances ?? 0,
      scorePageCount: meta?.scorePageCount ?? 0,
      failedPlateAppearances: meta?.failedPlateAppearances ?? 0,
      scoreIndexes,
    })
  } catch {
    return ""
  }
}

function collectPartialPhase4Targets(year, dateJst, readiness, processedSignatures) {
  const blockingPendingGameIds = new Set()
  for (const p of readiness.pending ?? []) {
    const text = String(p)
    if (/phase4_missing|phase4_pitch_events/.test(text)) continue
    for (const m of text.matchAll(/\d{10}/g)) blockingPendingGameIds.add(m[0])
  }
  const targets = []
  for (const gameId of listGameIdsForDate(year, dateJst)) {
    if (blockingPendingGameIds.has(gameId)) continue
    const sig = scoreRawMetaSignature(gameId)
    if (!sig) continue
    if (processedSignatures.get(gameId) === sig) continue
    targets.push({ gameId, sig })
  }
  return targets
}

function runPartialPhase4(year, targets, processedSignatures, dryRun) {
  const ids = targets.map((t) => t.gameId)
  if (ids.length === 0) return []
  const idCsv = ids.join(",")
  const cmd = `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --game-ids ${idCsv} --sleep 1.2`
  log(`部分更新: ready 試合のみ Phase4 実行: ${idCsv}`)
  appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `partial_phase4 gameIds=${idCsv}`)
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: withYahooScrapePermission() })
  for (const t of targets) processedSignatures.set(t.gameId, t.sig)
  return ids
}

function runTargetedScoreRawRepair(year, dateJst, gameIds, dryRun) {
  const ids = [...new Set(gameIds)].filter(Boolean)
  if (ids.length === 0) return
  const idCsv = ids.join(",")
  const statsTextCmd = `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --game-ids ${idCsv} --force`
  const scoreRawCmd = `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --from-date ${dateJst} --to-date ${dateJst} --game-ids ${idCsv} --force --sleep 1.2`
  const canonicalCmd = `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year} --game-ids ${idCsv} --force`
  log(`試合終了後の score raw 未完了を検出: ${idCsv}`)
  log(`stats/text 再取得: ${statsTextCmd}`)
  if (!dryRun) execSync(statsTextCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  log(`score raw 再取得: ${scoreRawCmd}`)
  if (!dryRun) execSync(scoreRawCmd, { cwd: root, stdio: "inherit", shell: true, env: withYahooScrapePermission() })
  log(`canonical 再生成: ${canonicalCmd}`)
  if (!dryRun) execSync(canonicalCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
}

function buildDecisionContext(dateJst, readiness, extra = {}) {
  const gameIds = listGameIdsForDate(extra.year || "", dateJst)
  const finishedIds = finishedGameIdsForDate(dateJst)
  const statusMap = scheduleStatusMapForDate(dateJst)
  return {
    dateJst,
    totalGames: gameIds.length,
    finishedGames: finishedIds.length,
    allGamesFinished: scheduleAllFinishedForDate(dateJst),
    scheduleStatuses: Object.fromEntries(statusMap),
    pending: [...(readiness?.pending ?? [])],
    scoreRawGateGameIds: [...(readiness?.scoreRawGateGameIds ?? [])],
    ...extra,
  }
}

function handoffToFinalize(args, dateJst, summary, readiness, options = {}) {
  const reason = String(options.reason || "all_ready")
  const lockReason = String(options.lockReason || "all_data_ready")
  const finalizeKind = String(options.kind || reason)
  const detail = buildDecisionContext(dateJst, readiness, {
    year: args.year,
    triggerReason: reason,
    finalizeMode: "finalize-precomputed",
    ...(options.detail || {}),
  })
  log(
    `必要データが揃ったため、v2 pipeline を起動します ` +
    `(reason=${reason} total=${detail.totalGames} finished=${detail.finishedGames} allFinished=${detail.allGamesFinished})`,
  )
  appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `${finalizeKind} date=${dateJst}`)
  pushWatchSummaryEvent(summary, "finalizeDecisions", {
    kind: finalizeKind,
    detail,
  })
  summary.status = "handoff-to-finalize"
  writeWatchSummary(dateJst, summary)
  if (!args.dryRun) {
    writeLock(dateJst, {
      state: "handoff-to-finalize",
      ranAtJst: formatJstTimestamp(),
      reason: lockReason,
      triggerReason: reason,
    })
  }
  const runId = runPipelineV2(args.year, dateJst, args.dryRun, args.autoDeployProduction, {
    reason,
    detail: JSON.stringify({
      totalGames: detail.totalGames,
      finishedGames: detail.finishedGames,
      allGamesFinished: detail.allGamesFinished,
      ...(options.triggerDetail || {}),
    }),
  })
  const pipelineCompletion = classifyWatchCompletionFromPipeline(runId)
  ensureStandingsFreshAfterFinalize(args, dateJst, summary, runId)
  summary.status = pipelineCompletion.summaryStatus
  summary.completedAtJst = formatJstTimestamp()
  summary.pipelineRunId = runId
  summary.pipelineCompletion = pipelineCompletion.pipeline?.completion ?? null
  writeWatchSummary(dateJst, summary)
  if (!args.dryRun) {
    writeLock(dateJst, {
      state: pipelineCompletion.lockState,
      completedAtJst: formatJstTimestamp(),
      reason: pipelineCompletion.reason,
      pipelineRunId: runId,
    })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dateJst = args.dateJst || todayJstYmd()
  const summary = {
    schemaVersion: "watch-pipeline-v2-summary-1",
    dateJst,
    year: args.year,
    status: "starting",
    startedAtJst: formatJstTimestamp(),
    dryRun: args.dryRun,
    autoDeployProduction: args.autoDeployProduction,
    partialPhase4: args.partialPhase4,
    pollMinutes: args.pollMinutes,
    endgamePollMinutes: args.endgamePollMinutes,
    deadline: args.deadline,
    warnings: [],
    repairs: [],
    finalizeDecisions: [],
    pendingSnapshots: [],
  }
  writeWatchSummary(dateJst, summary)

  const lockAcquired = acquireStartupLock(dateJst, {
    force: args.force,
    year: args.year,
    dryRun: args.dryRun,
  })
  if (!lockAcquired.acquired) {
    const existing = lockAcquired.existing || {}
    const message =
      `本日 (${dateJst}) は既に起動中または完了済みです。` +
      ` state=${existing.state || "unknown"} startedAtJst=${existing.startedAtJst || "-"} ` +
      `reason=${existing.reason || "-"} --force で再実行`
    log(message)
    summary.status = "skipped-duplicate"
    pushWatchSummaryEvent(summary, "warnings", {
      kind: "duplicate_start_blocked",
      message,
      existing,
    })
    writeWatchSummary(dateJst, summary)
    return
  }
  if (lockAcquired.replacedExisting) {
    log(
      `前回 failed lock を自動置換して再開します。 previousReason=${lockAcquired.replacedExisting.reason || "-"}`,
    )
    pushWatchSummaryEvent(summary, "warnings", {
      kind: "auto_replaced_failed_lock",
      message: "failed lock from another pipeline window was automatically replaced",
      previous: lockAcquired.replacedExisting,
    })
    writeWatchSummary(dateJst, summary)
  }

  log(
    `開始 year=${args.year} date=${dateJst} poll=${args.pollMinutes}min endgamePoll=${args.endgamePollMinutes}min deadline=翌${args.deadline} dryRun=${args.dryRun} autoDeployProduction=${args.autoDeployProduction}`,
  )
  summary.status = "waiting-or-running"
  writeLock(dateJst, { state: args.dryRun ? "running-dry-run" : "running", reason: "watch_started" })
  writeWatchSummary(dateJst, summary)
  await waitUntilWatchStart(dateJst, args.skipWaitForStart)

  const deadlineMs = deadlineMsForWatchDate(dateJst, args.deadline)
  const repairedGameKeys = new Set()
  const partialPhase4Signatures = new Map()
  for (;;) {
    runPrefetch(args.year, dateJst, args.dryRun)
    rememberFirstFinishedSeen(dateJst)
    let readiness = gateReadinessUntilScheduleFinal(dateJst, checkLocalReady(args.year, dateJst))

    if (readiness.noGames) {
      log(`当日の試合なし (${dateJst})`)
      summary.status = "completed-no-games"
      pushWatchSummaryEvent(summary, "finalizeDecisions", {
        kind: "no_games_today",
        detail: buildDecisionContext(dateJst, readiness, { year: args.year }),
      })
      writeWatchSummary(dateJst, summary)
      if (!args.dryRun) writeLock(dateJst, { state: "completed", ranAtJst: formatJstTimestamp(), reason: "no_games_today" })
      return
    }

    if (readiness.ready) {
      let precomputedGameIds = []
      if (args.partialPhase4) {
        const finalTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
        precomputedGameIds = runPartialPhase4(args.year, finalTargets, partialPhase4Signatures, args.dryRun)
        runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
      }
      handoffToFinalize(args, dateJst, summary, readiness, {
        reason: "all_ready",
        lockReason: "all_data_ready",
        triggerDetail: { precomputedGames: precomputedGameIds },
        detail: { precomputedGames: precomputedGameIds },
      })
      return
    }

    const repairablePendingIds = new Set(pendingGameIdsForRepair(readiness))
    const finishedIds = finishedGameIdsForDate(dateJst)
    const finishedPendingIds = finishedIds
      .filter((id) => repairablePendingIds.has(id))
      .filter((id) => !repairedGameKeys.has(repairAttemptKey(dateJst, id)))

    if (finishedPendingIds.length > 0) {
      const repairReasons = repairReasonsByGame(readiness, finishedPendingIds)
      for (const id of finishedPendingIds) repairedGameKeys.add(repairAttemptKey(dateJst, id))
      appendPipelineBulkLog(
        root,
        "watch:daily-pipeline:v2",
        `score_raw_repair_finished date=${dateJst} gameIds=${finishedPendingIds.join(",")} reasons=${JSON.stringify(repairReasons)}`,
      )
      pushWatchSummaryEvent(summary, "repairs", {
        kind: "score_raw_repair_finished",
        gameIds: finishedPendingIds,
        reasonsByGame: repairReasons,
      })
      writeWatchSummary(dateJst, summary)
      runTargetedScoreRawRepair(args.year, dateJst, finishedPendingIds, args.dryRun)
      readiness = gateReadinessUntilScheduleFinal(dateJst, checkLocalReady(args.year, dateJst))
      if (readiness.ready) {
        let precomputedGameIds = []
        if (args.partialPhase4) {
          const finalTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
          precomputedGameIds = runPartialPhase4(args.year, finalTargets, partialPhase4Signatures, args.dryRun)
          runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
        }
        handoffToFinalize(args, dateJst, summary, readiness, {
          reason: "all_ready_after_repair",
          lockReason: "all_data_ready_after_repair",
          detail: {
            repairGameIds: finishedPendingIds,
            precomputedGames: precomputedGameIds,
          },
          triggerDetail: {
            repairedGames: finishedPendingIds,
            precomputedGames: precomputedGameIds,
          },
        })
        return
      }
    }

    log(`未完了: ${readiness.pending.join(", ")}`)
    appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `pending date=${dateJst} ${readiness.pending.join(",")}`)
    pushWatchSummaryEvent(summary, "pendingSnapshots", {
      pending: readiness.pending,
      totalGames: listGameIdsForDate(args.year, dateJst).length,
      finishedGames: finishedGameIdsForDate(dateJst).length,
      allGamesFinished: scheduleAllFinishedForDate(dateJst),
    }, { limit: 40 })
    writeWatchSummary(dateJst, summary)

    if (args.partialPhase4) {
      const partialTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
      if (partialTargets.length > 0) {
        const precomputedGameIds = runPartialPhase4(args.year, partialTargets, partialPhase4Signatures, args.dryRun)
        runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
        readiness = gateReadinessUntilScheduleFinal(dateJst, checkLocalReady(args.year, dateJst))
        if (readiness.ready) {
          handoffToFinalize(args, dateJst, summary, readiness, {
            reason: "all_ready_after_partial_phase4",
            lockReason: "all_data_ready_after_partial_phase4",
            detail: { precomputedGames: precomputedGameIds },
            triggerDetail: { precomputedGames: precomputedGameIds },
          })
          return
        }
        log(`部分更新後も未完了: ${readiness.pending.join(", ")}`)
      } else {
        log("部分更新: 新しく Phase4 へ進める ready 試合はありません")
      }
    }

    if (args.once) {
      log("--once のため終了")
      return
    }

    if (Date.now() >= deadlineMs) {
      log(`デッドライン (翌 ${args.deadline} JST) に到達したため、未完了があっても v2 pipeline を起動します`)
      appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `deadline_force date=${dateJst} pending=${readiness.pending.join(",")}`)
      const decision = buildDecisionContext(dateJst, readiness, {
        year: args.year,
        triggerReason: "deadline_force",
        finalizeMode: "finalize-precomputed",
      })
      pushWatchSummaryEvent(summary, "warnings", {
        kind: "deadline_force",
        message: "未完了が残るまま finalize-precomputed を起動しました。",
        detail: decision,
      })
      pushWatchSummaryEvent(summary, "finalizeDecisions", {
        kind: "deadline_force",
        detail: decision,
      })
      summary.status = "handoff-to-finalize"
      writeWatchSummary(dateJst, summary)
      if (!args.dryRun) {
        writeLock(dateJst, {
          state: "handoff-to-finalize",
          ranAtJst: formatJstTimestamp(),
          reason: "deadline_force",
          triggerReason: "deadline_force",
          pending: readiness.pending,
        })
      }
      const runId = runPipelineV2(args.year, dateJst, args.dryRun, args.autoDeployProduction, {
        reason: "deadline_force",
        detail: JSON.stringify({
          pending: readiness.pending,
          totalGames: decision.totalGames,
          finishedGames: decision.finishedGames,
          allGamesFinished: decision.allGamesFinished,
        }),
      })
      const pipelineCompletion = classifyWatchCompletionFromPipeline(runId)
      summary.status = pipelineCompletion.summaryStatus
      summary.completedAtJst = formatJstTimestamp()
      summary.pipelineRunId = runId
      summary.pipelineCompletion = pipelineCompletion.pipeline?.completion ?? null
      writeWatchSummary(dateJst, summary)
      if (!args.dryRun) {
        writeLock(dateJst, {
          state: pipelineCompletion.lockState,
          completedAtJst: formatJstTimestamp(),
          reason: pipelineCompletion.reason,
          pipelineRunId: runId,
        })
      }
      return
    }

    const nextPollMinutes =
      scheduleHasStartedOrFinishedForDate(dateJst) || finishedIds.length > 0
        ? args.endgamePollMinutes
        : args.pollMinutes
    log(`${nextPollMinutes} 分後に再監視します`)
    await sleep(nextPollMinutes * 60_000)
  }
}

main().catch((e) => {
  const args = parseArgs(process.argv.slice(2))
  const dateJst = args.dateJst || todayJstYmd()
  const summaryPath = watchSummaryPath(dateJst)
  let summary = {}
  try {
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"))
    }
  } catch {
    summary = {}
  }
  writeWatchSummary(dateJst, {
    ...summary,
    schemaVersion: summary.schemaVersion || "watch-pipeline-v2-summary-1",
    dateJst,
    year: args.year,
    status: "failed",
    failedAtJst: formatJstTimestamp(),
    error: String(e?.message || e),
  })
  writeLock(dateJst, {
    state: "failed",
    reason: String(e?.message || e),
    failedAtJst: formatJstTimestamp(),
  })
  console.error("[watch:daily-pipeline:v2] failed:", e)
  process.exit(1)
})
