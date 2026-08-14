#!/usr/bin/env node
/**
 * 新案 v2:
 * - 旧 run_daily_npb_pipeline.mjs は残す
 * - v2 自身が Phase0〜2b / Phase4 / fast公開 / full公開 を順に実行する
 * - 旧案を内部で呼ばず、同じ目的の処理は旧案の取得・補修・検証ロジックを移植して単独実行する
 * - 全試合の必要データが揃った後、fast 公開 → full 公開の2段階で進める
 *
 * 用法:
 *   node scripts/run_daily_npb_pipeline_v2.mjs --year 2026 --from 2026-07-05 --to 2026-07-05
 *   node scripts/run_daily_npb_pipeline_v2.mjs --prefetch-only
 *   node scripts/run_daily_npb_pipeline_v2.mjs --fast-only
 *   node scripts/run_daily_npb_pipeline_v2.mjs --full-only
 *   node scripts/run_daily_npb_pipeline_v2.mjs --dry-run
 *   node scripts/run_daily_npb_pipeline_v2.mjs --complete
 *   node scripts/run_daily_npb_pipeline_v2.mjs --skip-fast-publish
 *   node scripts/run_daily_npb_pipeline_v2.mjs --finalize-precomputed
 *   node scripts/run_daily_npb_pipeline_v2.mjs --resume-from-checkpoint
 *   node scripts/run_daily_npb_pipeline_v2.mjs --resume-from "派生: phase14 pitch"
 *   node scripts/run_daily_npb_pipeline_v2.mjs --resume-after "検証: phase13"
 *   node scripts/run_daily_npb_pipeline_v2.mjs --strict-full-derived-validate
 *   node scripts/run_daily_npb_pipeline_v2.mjs --strict-phase13-validate
 *   node scripts/run_daily_npb_pipeline_v2.mjs --strict-vs-hand-validate
 *   node scripts/run_daily_npb_pipeline_v2.mjs --phase4-sleep 0.8
 */

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { appendPipelineBulkLog, formatJstTimestamp } from "./pipelineBulkLog.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
let runSummary = null
let runSummaryPath = ""
let runSummaryLatestPath = ""
let currentRunId = ""

const childEnv = {
  ...process.env,
  CI: process.env.CI ?? "1",
  NO_UPDATE_NOTIFIER: process.env.NO_UPDATE_NOTIFIER ?? "1",
  VERCEL_CLI_UPDATE_NOTIFY: process.env.VERCEL_CLI_UPDATE_NOTIFY ?? "0",
  PYTHONUNBUFFERED: "1",
  TOPPAGE_PLATE_RESULT_SOURCE: process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "appearance_only",
  TOPPAGE_BATTING_SEASON_AGG: process.env.TOPPAGE_BATTING_SEASON_AGG ?? "appearance_slots",
  TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD:
    process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD ?? "1",
}
const VERCEL_CLI = process.env.TOPPAGE_VERCEL_CLI || (process.platform === "win32" ? "vercel.cmd" : "vercel")

function commandNeedsYahooScrapePermission(command) {
  return /scripts[\\/]fetch_sportsnavi_score_raw_snapshot\.py|scripts[\\/]phase4_yahoo_pitch_by_pitch_pipeline\.mjs|scripts[\\/]fetch_yahoo_schedule_probables\.ts/.test(
    String(command || ""),
  )
}

function childEnvForCommand(command) {
  if (!commandNeedsYahooScrapePermission(command)) return childEnv
  return {
    ...childEnv,
    YAHOO_SCRAPE_ENABLED: childEnv.YAHOO_SCRAPE_ENABLED || "1",
  }
}

function readVercelProjectMeta() {
  const p = path.join(root, ".vercel", "project.json")
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function vercelScopePrefix() {
  const projectMeta = readVercelProjectMeta()
  const scope = String(process.env.VERCEL_SCOPE || projectMeta?.orgId || "").trim()
  return scope ? ` --scope ${scope}` : ""
}

function extractFirstUrl(text) {
  const match = String(text).match(/https:\/\/[^\s"]+/)
  return match ? match[0] : ""
}

function nowIsoLocal() {
  return formatJstTimestamp().replace(" JST", "")
}

function jstFileStamp(date = new Date()) {
  return formatJstTimestamp(date).replace(/[: ]/g, "-")
}

function compactJstStamp(date = new Date()) {
  return formatJstTimestamp(date)
    .replace(" JST", "")
    .replace(/[-: ]/g, "")
}

function deriveMode(args) {
  if (args.prefetchOnly) return "prefetch-only"
  if (args.fastOnly) return "fast-only"
  if (args.fullOnly) return "full-only"
  if (args.finalizePrecomputed) return "finalize-precomputed"
  return "all"
}

function buildRunId(args) {
  const explicit = String(args.runId || "").trim()
  if (explicit) return explicit
  const mode = deriveMode(args).replace(/[^a-z0-9]+/gi, "-")
  return `${args.from}_${compactJstStamp()}_pid${process.pid}_${mode}`
}

function todayJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function defaultSeasonStart(year) {
  return `${year}-03-27`
}

function addDaysYmdJst(ymd, days) {
  const s = String(ymd || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ""
  const d = new Date(`${s}T00:00:00+09:00`)
  if (Number.isNaN(d.getTime())) return ""
  d.setUTCDate(d.getUTCDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function topProbablesAsOfDateForWindow({ from, to, advanceAfterCompletedWindow = false } = {}) {
  if (advanceAfterCompletedWindow) {
    const base = String(to || from || "").trim()
    const next = addDaysYmdJst(base, 1)
    if (next) return next
  }
  return todayJstYmd()
}

function topProbablesBuildCommand({ year, from, to, advanceAfterCompletedWindow = false }) {
  const asOfDate = topProbablesAsOfDateForWindow({ from, to, advanceAfterCompletedWindow })
  return `npx tsx scripts/phase36_build_top_probables.ts --year ${year} --as-of ${asOfDate}`
}

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, "0")
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`
  return `${mm}:${pad(ss)}`
}

function commandTimeoutMs(kind = "default") {
  const byKind = {
    default: process.env.TOPPAGE_PIPELINE_DEFAULT_TIMEOUT_MS,
    validate: process.env.TOPPAGE_PIPELINE_VALIDATE_TIMEOUT_MS,
    network: process.env.TOPPAGE_PIPELINE_NETWORK_TIMEOUT_MS,
    publish: process.env.TOPPAGE_PIPELINE_PUBLISH_TIMEOUT_MS,
  }
  const raw = byKind[kind] ?? byKind.default
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseArgs(argv) {
  const out = {
    year: "2026",
    from: "",
    to: "",
    gameIds: [],
    prefetchOnly: false,
    fastOnly: false,
    fullOnly: false,
    finalizePrecomputed: false,
    skipPrefetch: false,
    noStatsText: false,
    noScoreRaw: false,
    strictQuality: true,
    forceCanonical: false,
    yahooForce: false,
    phase4Sleep: "1.2",
    skipScoreRawGate: false,
    strictFullDerivedValidate: false,
    strictPhase13Validate: false,
    skipVsHandValidate: false,
    strictVsHandValidate: false,
    skipFastPublish: false,
    autoDeployProduction: false,
    noPublish: false,
    build: false,
    resumeFromCheckpoint: false,
    forceRunLock: false,
    runId: "",
    triggerReason: "",
    triggerDetail: "",
    resumeFrom: "",
    resumeAfter: "",
    dryRun: false,
    fromExplicit: false,
    toExplicit: false,
    gameIdsExplicit: false,
    phase4SleepExplicit: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) out.year = String(argv[++i]).trim()
    else if (a === "--from" && argv[i + 1]) {
      out.from = String(argv[++i]).trim()
      out.fromExplicit = true
    }
    else if (a === "--to" && argv[i + 1]) {
      out.to = String(argv[++i]).trim()
      out.toExplicit = true
    }
    else if (a === "--game-ids" && argv[i + 1]) {
      out.gameIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      out.gameIdsExplicit = true
    }
    else if (a === "--prefetch-only") out.prefetchOnly = true
    else if (a === "--fast-only") out.fastOnly = true
    else if (a === "--full-only") out.fullOnly = true
    else if (a === "--finalize-precomputed") out.finalizePrecomputed = true
    else if (a === "--skip-prefetch") out.skipPrefetch = true
    else if (a === "--no-stats-text") out.noStatsText = true
    else if (a === "--no-score-raw") out.noScoreRaw = true
    else if (a === "--no-strict-quality") out.strictQuality = false
    else if (a === "--force-canonical") out.forceCanonical = true
    else if (a === "--yahoo-force") out.yahooForce = true
    else if (a === "--phase4-sleep" && argv[i + 1]) {
      out.phase4Sleep = String(argv[++i]).trim()
      out.phase4SleepExplicit = true
    }
    else if (a === "--complete") {
      out.forceCanonical = true
      out.yahooForce = true
    }
    else if (a === "--skip-score-raw-gate") out.skipScoreRawGate = true
    else if (a === "--strict-full-derived-validate") out.strictFullDerivedValidate = true
    else if (a === "--strict-phase13-validate") out.strictPhase13Validate = true
    else if (a === "--skip-vs-hand-validate") out.skipVsHandValidate = true
    else if (a === "--strict-vs-hand-validate") out.strictVsHandValidate = true
    else if (a === "--skip-fast-publish") out.skipFastPublish = true
    else if (a === "--auto-deploy-production") out.autoDeployProduction = true
    else if (a === "--no-publish") out.noPublish = true
    else if (a === "--build") out.build = true
    else if (a === "--resume-from-checkpoint") out.resumeFromCheckpoint = true
    else if (a === "--force-run-lock") out.forceRunLock = true
    else if (a === "--run-id" && argv[i + 1]) out.runId = String(argv[++i]).trim()
    else if (a === "--trigger-reason" && argv[i + 1]) out.triggerReason = String(argv[++i]).trim()
    else if (a === "--trigger-detail" && argv[i + 1]) out.triggerDetail = String(argv[++i]).trim()
    else if (a === "--resume-from" && argv[i + 1]) out.resumeFrom = String(argv[++i]).trim()
    else if (a === "--resume-after" && argv[i + 1]) out.resumeAfter = String(argv[++i]).trim()
    else if (a === "--dry-run") out.dryRun = true
  }
  if (!out.from) out.from = todayJstYmd()
  if (!out.to) out.to = out.from
  return out
}

function readJsonOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function writeTextFileWithRetrySync(filePath, body) {
  let lastError = null
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      fs.writeFileSync(filePath, body, "utf8")
      return
    } catch (e) {
      lastError = e
      const code = String(e?.code || "")
      if (!["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(code) || attempt === 6) break
      sleepSync(100 * attempt)
    }
  }
  throw lastError
}

function writeJsonFileWithRetrySync(filePath, payload) {
  writeTextFileWithRetrySync(filePath, JSON.stringify(payload, null, 2))
}

function parseIsoMs(value) {
  const d = value ? new Date(String(value)) : null
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function eachDateYmd(from, to) {
  const dates = []
  for (let cur = from; cur <= to; cur = addDaysYmd(cur, 1)) dates.push(cur)
  return dates
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
  return parseIsoMs(meta?.fetchedAt)
}

function scheduleFinishSeenPath() {
  return path.join(root, "_data", "scraped_games", "_meta", "schedule_finish_seen_v1.json")
}

function scheduleFinishSeenKey(dateJst, gameId) {
  return `${dateJst}:${gameId}`
}

function readScheduleFinishSeen() {
  const payload = readJsonOrNull(scheduleFinishSeenPath())
  return payload && typeof payload === "object" ? payload : { schemaVersion: "schedule-finish-seen-v1", games: {} }
}

function writeScheduleFinishSeen(payload) {
  writeJsonFileWithRetrySync(scheduleFinishSeenPath(), {
    schemaVersion: "schedule-finish-seen-v1",
    games: payload?.games && typeof payload.games === "object" ? payload.games : {},
    updatedAtJst: formatJstTimestamp(),
  })
}

function rememberFirstFinishedSeenFromSnapshot(dateJst, snap) {
  const gamesList = Array.isArray(snap?.games) ? snap.games : []
  if (gamesList.length === 0) return
  const fetchedAtMs = parseIsoMs(snap?.fetchedAt)
  const firstSeenAt = fetchedAtMs > 0 ? new Date(fetchedAtMs).toISOString() : new Date().toISOString()
  const payload = readScheduleFinishSeen()
  const games = payload.games && typeof payload.games === "object" ? { ...payload.games } : {}
  let changed = false
  for (const game of gamesList) {
    const gameId = String(game?.gameId ?? "").trim()
    const status = String(game?.statusText ?? "").trim()
    if (!gameId || !/試合終了/.test(status)) continue
    const key = scheduleFinishSeenKey(dateJst, gameId)
    if (games[key]?.firstFinishedSeenAt) continue
    games[key] = {
      dateJst,
      gameId,
      firstFinishedSeenAt: firstSeenAt,
      statusText: status,
      source: "sportsnavi_schedule_snapshot",
    }
    changed = true
  }
  if (changed) writeScheduleFinishSeen({ ...payload, games })
}

function firstFinishedSeenAtMs(dateJst, gameId) {
  const payload = readScheduleFinishSeen()
  const entry = payload?.games?.[scheduleFinishSeenKey(dateJst, gameId)]
  return parseIsoMs(entry?.firstFinishedSeenAt)
}

function gameIdsForDate(dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  const snap = readJsonOrNull(snapPath)
  if (Array.isArray(snap?.gameIds)) return snap.gameIds.map(String).filter(Boolean)
  const games = Array.isArray(snap?.games) ? snap.games : []
  return games.map((g) => String(g?.gameId ?? "").trim()).filter(Boolean)
}

function scheduleStatusMapForDate(dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  const snap = readJsonOrNull(snapPath)
  const map = new Map()
  const byId = snap?.scheduleStatusByGameId && typeof snap.scheduleStatusByGameId === "object"
    ? snap.scheduleStatusByGameId
    : {}
  for (const [gameId, status] of Object.entries(byId)) {
    const id = String(gameId || "").trim()
    if (id) map.set(id, String(status || "").trim())
  }
  for (const game of Array.isArray(snap?.games) ? snap.games : []) {
    const gameId = String(game?.gameId ?? "").trim()
    if (!gameId || map.has(gameId)) continue
    const status = String(game?.statusText ?? game?.gameState ?? "").trim()
    if (status) map.set(gameId, status)
  }
  for (const gameId of gameIdsForDate(dateJst)) {
    if (!map.has(gameId)) map.set(gameId, "")
  }
  return map
}

function scheduleAllFinishedForDate(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  if (statusMap.size === 0) return false
  for (const status of statusMap.values()) {
    if (!/試合終了|試合中止|ノーゲーム/.test(String(status || ""))) return false
  }
  return true
}

let cancelledScheduleGameIdSet = null
function cancelledScheduleGameIds() {
  if (cancelledScheduleGameIdSet) return cancelledScheduleGameIdSet
  const ids = new Set()
  const dir = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date")
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue
      const snap = readJsonOrNull(path.join(dir, file))
      const byId = snap?.scheduleStatusByGameId && typeof snap.scheduleStatusByGameId === "object"
        ? snap.scheduleStatusByGameId
        : {}
      for (const [gameId, status] of Object.entries(byId)) {
        if (/試合中止|ノーゲーム/.test(String(status || ""))) ids.add(String(gameId))
      }
      for (const game of Array.isArray(snap?.games) ? snap.games : []) {
        const gameId = String(game?.gameId ?? "").trim()
        const status = String(game?.statusText ?? game?.gameState ?? "").trim()
        if (gameId && /試合中止|ノーゲーム/.test(status)) ids.add(gameId)
      }
    }
  } catch {
    // schedule snapshot が無い環境では保険フィルタを無効化する
  }
  cancelledScheduleGameIdSet = ids
  return cancelledScheduleGameIdSet
}

function nonCancelledGameIds(gameIds) {
  const cancelledIds = cancelledScheduleGameIds()
  return [...new Set((gameIds ?? []).map(String).map((id) => id.trim()).filter(Boolean))]
    .filter((id) => !cancelledIds.has(id))
    .sort()
}

function unfinishedScheduleLabelsForDate(dateJst) {
  return [...scheduleStatusMapForDate(dateJst).entries()]
    .filter(([, status]) => !/試合終了|試合中止|ノーゲーム/.test(String(status || "")))
    .map(([gameId, status]) => `${gameId}:${status || "status_unknown"}`)
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

function readYahooPitcherToNpbMap() {
  const p = path.join(root, "_data", "scraped_games", "derived", "yahoo_pitcher_to_npb.json")
  const payload = readJsonOrNull(p)
  const map = payload?.map && typeof payload.map === "object" ? payload.map : {}
  return new Map(
    Object.entries(map)
      .map(([yahooId, npbId]) => [String(yahooId).trim(), String(npbId ?? "").trim()])
      .filter(([yahooId, npbId]) => yahooId && npbId),
  )
}

function collectNpbPitcherIdsForGames(gameIds) {
  const yahooToNpb = readYahooPitcherToNpbMap()
  const yahooIds = new Set()
  const npbIds = new Set()
  for (const gameId of gameIds) {
    const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    const doc = readJsonOrNull(canonicalPath)
    for (const line of doc?.domain?.pitchingLines ?? []) {
      const yahooId = String(line?.yahooPlayerId ?? "").trim()
      if (yahooId) yahooIds.add(yahooId)
    }
    for (const pa of doc?.domain?.plateAppearances ?? []) {
      const yahooId = String(pa?.yahooPitcherId ?? "").trim()
      if (yahooId) yahooIds.add(yahooId)
      for (const pitch of pa?.pitchEvents ?? []) {
        const pitchYahooId = String(pitch?.yahooPitcherId ?? "").trim()
        if (pitchYahooId) yahooIds.add(pitchYahooId)
      }
    }
  }
  for (const yahooId of yahooIds) {
    const npbId = yahooToNpb.get(String(yahooId))
    if (npbId) npbIds.add(npbId)
  }
  return [...npbIds].sort()
}

function affectedYahooBatterIdsForDateRange(from, to) {
  const gameIds = new Set()
  for (const dateJst of eachDateYmd(from, to)) {
    for (const gameId of gameIdsForDate(dateJst)) gameIds.add(gameId)
  }
  return collectYahooBatterIdsForGames([...gameIds])
}

function targetGameIdsForArgs({ from, to, gameIds }) {
  if (Array.isArray(gameIds) && gameIds.length > 0) return [...new Set(gameIds)].sort()
  const ids = new Set()
  for (const dateJst of eachDateYmd(from, to)) {
    for (const gameId of gameIdsForDate(dateJst)) ids.add(gameId)
  }
  return [...ids].sort()
}

function phase10PitchRowsCountForGame(gameId) {
  const phase10Path = path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
  const phase10 = readJsonOrNull(phase10Path)
  return Array.isArray(phase10?.pitchRows) ? phase10.pitchRows.length : 0
}

function canonicalDomainPitchEventCountForGame(gameId) {
  const canonicalPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  const canonical = readJsonOrNull(canonicalPath)
  return Array.isArray(canonical?.domain?.pitchEvents) ? canonical.domain.pitchEvents.length : 0
}

function collectPhase4ConsistencyFailures(args) {
  const failures = []
  for (const gameId of nonCancelledGameIds(targetGameIdsForArgs(args))) {
    const pitchRows = phase10PitchRowsCountForGame(gameId)
    if (pitchRows <= 0) continue
    const pitchEvents = canonicalDomainPitchEventCountForGame(gameId)
    if (pitchEvents !== pitchRows) {
      failures.push({ gameId, pitchRows, pitchEvents })
    }
  }
  return failures
}

function ensurePhase4ConsistencyGate(args) {
  if (args.dryRun) return
  const failures = collectPhase4ConsistencyFailures(args)
  if (failures.length === 0) {
    console.log("\n[daily:npb-pipeline:v2] Phase4 一球反映 gate OK\n")
    return
  }
  const ids = failures.map((f) => f.gameId)
  const detail = failures.map((f) => `${f.gameId}:pitchEvents=${f.pitchEvents}/pitchRows=${f.pitchRows}`).join(",")
  const recommendedNextCommand =
    `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${args.year} --game-ids ${ids.join(",")} --sleep ${args.phase4Sleep || "1.2"} --force`
  const message =
    `phase4 consistency gate failed: ${detail}. ` +
    `canonical domain.pitchEvents が restored pitchRows と一致していません。recommendedNextCommand="${recommendedNextCommand}"`
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `phase4_consistency_gate NG ${detail}`)
  pushRunSummaryEvent("warnings", {
    kind: "phase4_consistency_gate",
    message,
    failures,
    recommendedNextCommand,
  })
  throw new Error(message)
}

function affectedYahooBatterIdsForArgs(args) {
  const gameIds = targetGameIdsForArgs(args)
  return collectYahooBatterIdsForGames(gameIds)
}

function onlyYahooIdsArg(ids) {
  return ids.length > 0 ? ` -- --only-yahoo-ids ${ids.join(",")}` : ""
}

function derivedYahooArgsArg(ids, { from, to } = {}) {
  const args = []
  if (Array.isArray(ids) && ids.length > 0) args.push("--only-yahoo-ids", ids.join(","))
  if (from) args.push("--from", from)
  if (to) args.push("--to", to)
  return args.length > 0 ? ` -- ${args.join(" ")}` : ""
}

function dateRangeNpmArgsArg({ from, to } = {}) {
  const args = []
  if (from) args.push("--from", from)
  if (to) args.push("--to", to)
  return args.length > 0 ? ` -- ${args.join(" ")}` : ""
}

function phase29Command({ from, to, includeToday = false, requireTargetGameCacheNonEmpty = false } = {}) {
  const rangeArg = dateRangeNpmArgsArg({ from, to })
  if (!includeToday) return `npm run phase29:build:standings${rangeArg}`
  const args = []
  if (from) args.push("--from", from)
  if (to) args.push("--to", to)
  args.push("--include-today")
  if (requireTargetGameCacheNonEmpty) args.push("--require-target-game-cache-nonempty")
  return `npm run phase29:build:standings -- ${args.join(" ")}`
}

function dateRangeNodeArgsArg({ from, to } = {}) {
  const args = []
  if (from) args.push("--from", from)
  if (to) args.push("--to", to)
  return args.length > 0 ? ` ${args.join(" ")}` : ""
}

function gameIdsOrDateRangeTsxArgsArg({ year, from, to, gameIds = [] } = {}) {
  const args = []
  if (year) args.push("--year", year)
  if (Array.isArray(gameIds) && gameIds.length > 0) {
    args.push("--game-ids", gameIds.join(","))
  } else {
    if (from) args.push("--from", from)
    if (to) args.push("--to", to)
  }
  return args.length > 0 ? ` ${args.join(" ")}` : ""
}

function onlyNpbIdsArg(ids) {
  return ids.length > 0 ? ` -- --only-npb-ids ${ids.join(",")}` : ""
}

function canonicalJsonFiles() {
  const dir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => path.join(dir, f))
}

function canonicalMtimeMsForGameId(gameId) {
  const p = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return 0
  }
}

function readPhase17PeriodSourceSnapshot(periodDir, periodFiles) {
  const metaPath = path.join(periodDir, "_meta.json")
  const meta = readJsonOrNull(metaPath)
  const metaIds = Array.isArray(meta?.source?.canonicalGames)
    ? meta.source.canonicalGames.map(String).filter(Boolean)
    : []
  const metaGeneratedAt = String(meta?.generatedAt ?? "")
  if (metaIds.length > 0 && metaGeneratedAt) {
    return {
      sourceIds: metaIds,
      generatedAt: metaGeneratedAt,
      sourceRef: "_meta.json",
    }
  }

  let best = null
  for (const file of periodFiles) {
    const payload = readJsonOrNull(path.join(periodDir, file))
    const sourceIds = Array.isArray(payload?.source?.canonicalGames)
      ? payload.source.canonicalGames.map(String).filter(Boolean)
      : []
    const generatedAt = String(payload?.generatedAt ?? "")
    if (sourceIds.length === 0 || !generatedAt) continue
    const candidate = {
      sourceIds,
      generatedAt,
      generatedAtMs: parseIsoMs(generatedAt),
      sourceRef: file,
    }
    if (
      !best ||
      candidate.generatedAtMs > best.generatedAtMs ||
      (candidate.generatedAtMs === best.generatedAtMs && candidate.sourceIds.length > best.sourceIds.length)
    ) {
      best = candidate
    }
  }

  if (!best) {
    return {
      sourceIds: [],
      generatedAt: "",
      sourceRef: "",
    }
  }
  return best
}

function battingPeriodFreshnessReport({ year, gameIds = [] }) {
  const periodDir = path.join(root, "_data", "derived", "player_season_batting_period", year)
  const canonicalFiles = canonicalJsonFiles()
  const currentCanonicalCount = canonicalFiles.length
  if (!fs.existsSync(periodDir)) {
    return {
      ok: false,
      reason: "period_dir_missing",
      currentCanonicalCount,
      periodSourceCount: 0,
      generatedAt: "",
      staleTargetGameIds: [],
      missingTargetGameIds: [],
    }
  }

  const periodFiles = fs
    .readdirSync(periodDir)
    .filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
    .sort()
  if (periodFiles.length === 0) {
    return {
      ok: false,
      reason: "period_files_missing",
      currentCanonicalCount,
      periodSourceCount: 0,
      generatedAt: "",
      staleTargetGameIds: [],
      missingTargetGameIds: [],
    }
  }

  const snapshot = readPhase17PeriodSourceSnapshot(periodDir, periodFiles)
  const sourceIds = snapshot.sourceIds
  const generatedAt = snapshot.generatedAt
  const generatedAtMs = parseIsoMs(generatedAt)
  const sourceSet = new Set(sourceIds)
  const targetIds = [...new Set(gameIds.map(String).filter(Boolean))].sort()
  const canonicalTargetGameIds = targetIds.filter((id) => canonicalMtimeMsForGameId(id) > 0)
  const ignoredTargetGameIds = targetIds.filter((id) => canonicalMtimeMsForGameId(id) <= 0)
  const missingTargetGameIds = canonicalTargetGameIds.filter((id) => !sourceSet.has(id))
  const staleTargetGameIds =
    generatedAtMs > 0
      ? canonicalTargetGameIds.filter((id) => canonicalMtimeMsForGameId(id) > generatedAtMs + 1000)
      : canonicalTargetGameIds

  const reasons = []
  if (sourceIds.length < currentCanonicalCount) reasons.push("source_count_behind_canonical")
  if (missingTargetGameIds.length > 0) reasons.push("target_games_missing_from_period_source")
  if (staleTargetGameIds.length > 0) reasons.push("target_canonical_newer_than_period")

  return {
    ok: reasons.length === 0,
    reason: reasons.join("+"),
    currentCanonicalCount,
    periodSourceCount: sourceIds.length,
    generatedAt,
    sourceRef: snapshot.sourceRef,
    ignoredTargetGameIds,
    staleTargetGameIds,
    missingTargetGameIds,
  }
}

function ensureBattingPeriodFresh({ year, from, to, gameIds, dryRun, rebuildPitchingPeriod = false }) {
  const targetIds = targetGameIdsForArgs({ from, to, gameIds })
  const affectedYahooIds = collectYahooBatterIdsForGames(targetIds)
  const affectedNpbPitcherIds = collectNpbPitcherIdsForGames(targetIds)
  const before = battingPeriodFreshnessReport({ year, gameIds: targetIds })
  if (before.ok) {
    console.log(
      `\n[daily:npb-pipeline:v2] phase17 period 鮮度 OK: source=${before.periodSourceCount}, canonical=${before.currentCanonicalCount}, generatedAt=${before.generatedAt}\n`,
    )
    return
  }

  console.warn(
    "\n[daily:npb-pipeline:v2] phase17 period 鮮度 NG → canonical 更新後の期間別集計を再生成します:",
  )
  console.warn(
    `  reason=${before.reason || "-"} source=${before.periodSourceCount} canonical=${before.currentCanonicalCount} generatedAt=${before.generatedAt || "-"} sourceRef=${before.sourceRef || "-"}`,
  )
  if (before.missingTargetGameIds.length > 0) {
    console.warn(`  missingTargetGameIds=${before.missingTargetGameIds.join(",")}`)
  }
  if (before.ignoredTargetGameIds.length > 0) {
    console.warn(`  ignoredTargetGameIds(no canonical)=${before.ignoredTargetGameIds.join(",")}`)
  }
  if (before.staleTargetGameIds.length > 0) {
    console.warn(`  staleTargetGameIds=${before.staleTargetGameIds.join(",")}`)
  }
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `phase17 period stale reason=${before.reason || "-"} source=${before.periodSourceCount} canonical=${before.currentCanonicalCount}`,
  )
  pushRunSummaryEvent("repairs", {
    kind: "phase17_period_rebuild",
    reason: before.reason || "-",
    periodSourceCount: before.periodSourceCount,
    canonicalCount: before.currentCanonicalCount,
    staleTargetGameIds: before.staleTargetGameIds,
    missingTargetGameIds: before.missingTargetGameIds,
  })

  run(
    "派生: phase17 period（鮮度NGのため再生成）",
    `npm run phase17:build:period${derivedYahooArgsArg(affectedYahooIds, { from, to })}`,
    { dryRun },
  )
  if (rebuildPitchingPeriod) {
    run(
      "派生: phase7 pitcher period（phase17再生成に合わせて再生成）",
      `npm run phase7:build:pitcher-period${onlyNpbIdsArg(affectedNpbPitcherIds)}`,
      { dryRun },
    )
  }

  if (dryRun) return

  const after = battingPeriodFreshnessReport({ year, gameIds: targetIds })
  if (!after.ok) {
    throw new Error(
      `phase17 period remains stale after rebuild: reason=${after.reason || "-"} source=${after.periodSourceCount} canonical=${after.currentCanonicalCount}`,
    )
  }
  console.log(
    `\n[daily:npb-pipeline:v2] phase17 period 鮮度 OK（再生成後）: source=${after.periodSourceCount}, canonical=${after.currentCanonicalCount}, generatedAt=${after.generatedAt}\n`,
  )
}

function derivedFileMtimeMsForYahooIds(year, category, yahooIds) {
  const dir = path.join(root, "_data", "derived", category, year)
  const mtimes = new Map()
  for (const yahooId of yahooIds) {
    const file = path.join(dir, `yahoo_${yahooId}.json`)
    try {
      mtimes.set(String(yahooId), fs.statSync(file).mtimeMs)
    } catch {
      mtimes.set(String(yahooId), 0)
    }
  }
  return mtimes
}

function derivedFileMtimeMsForNpbIds(year, category, npbIds) {
  const dir = path.join(root, "_data", "derived", category, year)
  const mtimes = new Map()
  for (const npbId of npbIds) {
    const file = path.join(dir, `npb_${npbId}.json`)
    try {
      mtimes.set(String(npbId), fs.statSync(file).mtimeMs)
    } catch {
      mtimes.set(String(npbId), 0)
    }
  }
  return mtimes
}

function derivedCategoryFreshnessReport({ year, category, yahooIds, canonicalThresholdMs }) {
  const uniqueYahooIds = [...new Set((yahooIds || []).map(String).filter(Boolean))].sort()
  if (uniqueYahooIds.length === 0) {
    return {
      ok: true,
      category,
      affectedCount: 0,
      missingYahooIds: [],
      staleYahooIds: [],
      latestDerivedMs: 0,
    }
  }

  const mtimes = derivedFileMtimeMsForYahooIds(year, category, uniqueYahooIds)
  const missingYahooIds = []
  const staleYahooIds = []
  let latestDerivedMs = 0

  for (const yahooId of uniqueYahooIds) {
    const mtimeMs = mtimes.get(String(yahooId)) || 0
    if (mtimeMs <= 0) {
      missingYahooIds.push(String(yahooId))
      continue
    }
    latestDerivedMs = Math.max(latestDerivedMs, mtimeMs)
    if (canonicalThresholdMs > 0 && mtimeMs + 1000 < canonicalThresholdMs) {
      staleYahooIds.push(String(yahooId))
    }
  }

  return {
    ok: missingYahooIds.length === 0 && staleYahooIds.length === 0,
    category,
    affectedCount: uniqueYahooIds.length,
    missingYahooIds,
    staleYahooIds,
    latestDerivedMs,
    canonicalThresholdMs,
  }
}

function derivedNpbCategoryFreshnessReport({ year, category, npbIds, canonicalThresholdMs }) {
  const uniqueNpbIds = [...new Set((npbIds || []).map(String).filter(Boolean))].sort()
  if (uniqueNpbIds.length === 0) {
    return {
      ok: true,
      category,
      affectedCount: 0,
      missingNpbIds: [],
      staleNpbIds: [],
      missingYahooIds: [],
      staleYahooIds: [],
      latestDerivedMs: 0,
      idKind: "npb",
    }
  }

  const mtimes = derivedFileMtimeMsForNpbIds(year, category, uniqueNpbIds)
  const missingNpbIds = []
  const staleNpbIds = []
  let latestDerivedMs = 0

  for (const npbId of uniqueNpbIds) {
    const mtimeMs = mtimes.get(String(npbId)) || 0
    if (mtimeMs <= 0) {
      missingNpbIds.push(String(npbId))
      continue
    }
    latestDerivedMs = Math.max(latestDerivedMs, mtimeMs)
    if (canonicalThresholdMs > 0 && mtimeMs + 1000 < canonicalThresholdMs) {
      staleNpbIds.push(String(npbId))
    }
  }

  return {
    ok: missingNpbIds.length === 0 && staleNpbIds.length === 0,
    category,
    affectedCount: uniqueNpbIds.length,
    missingNpbIds,
    staleNpbIds,
    missingYahooIds: missingNpbIds,
    staleYahooIds: staleNpbIds,
    latestDerivedMs,
    canonicalThresholdMs,
    idKind: "npb",
  }
}

function buildCheckpointInputSnapshot(args = currentArgs) {
  if (!args?.year || !args?.from || !args?.to) return null
  const gameIds = targetGameIdsForArgs(args)
  const yahooIds = collectYahooBatterIdsForGames(gameIds)
  const npbPitcherIds = collectNpbPitcherIdsForGames(gameIds)
  const targetCanonicalLatestMs = gameIds.reduce((max, gameId) => Math.max(max, canonicalMtimeMsForGameId(gameId)), 0)
  const phase17 = battingPeriodFreshnessReport({ year: args.year, gameIds })
  const categories = ["player_season_batting", "player_season_batting_count", "player_season_batting_context", "player_season_batting_splits"]
  const derived = Object.fromEntries(
    categories.map((category) => [
      category,
      derivedCategoryFreshnessReport({
        year: args.year,
        category,
        yahooIds,
        canonicalThresholdMs: targetCanonicalLatestMs,
      }),
    ]),
  )
  derived.player_season_pitching_poc = derivedNpbCategoryFreshnessReport({
    year: args.year,
    category: "player_season_pitching_poc",
    npbIds: npbPitcherIds,
    canonicalThresholdMs: targetCanonicalLatestMs,
  })

  return {
    year: String(args.year),
    from: String(args.from),
    to: String(args.to),
    gameIds,
    yahooIdsCount: yahooIds.length,
    npbPitcherIdsCount: npbPitcherIds.length,
    targetCanonicalLatestMs,
    phase17: {
      ok: Boolean(phase17.ok),
      reason: phase17.reason || "",
      generatedAt: phase17.generatedAt || "",
      generatedAtMs: parseIsoMs(phase17.generatedAt),
      periodSourceCount: Number(phase17.periodSourceCount || 0),
      currentCanonicalCount: Number(phase17.currentCanonicalCount || 0),
      missingTargetGameIds: phase17.missingTargetGameIds || [],
      staleTargetGameIds: phase17.staleTargetGameIds || [],
    },
    derived,
  }
}

function checkpointInputFreshnessStatus(savedSnapshot, currentSnapshot) {
  if (!savedSnapshot || !currentSnapshot) {
    return {
      stale: false,
      reasons: [],
    }
  }

  const reasons = []
  if (String(savedSnapshot.year || "") !== String(currentSnapshot.year || "")) reasons.push("year_changed")
  if (String(savedSnapshot.from || "") !== String(currentSnapshot.from || "")) reasons.push("from_changed")
  if (String(savedSnapshot.to || "") !== String(currentSnapshot.to || "")) reasons.push("to_changed")
  if (Number(currentSnapshot.targetCanonicalLatestMs || 0) > Number(savedSnapshot.targetCanonicalLatestMs || 0) + 1000) {
    reasons.push("canonical_newer_than_checkpoint")
  }
  if (Number(currentSnapshot.yahooIdsCount || 0) !== Number(savedSnapshot.yahooIdsCount || 0)) {
    reasons.push("affected_yahoo_ids_changed")
  }
  if (Number(currentSnapshot.npbPitcherIdsCount || 0) !== Number(savedSnapshot.npbPitcherIdsCount || 0)) {
    reasons.push("affected_npb_pitcher_ids_changed")
  }

  const categories = new Set([
    ...Object.keys(savedSnapshot.derived || {}),
    ...Object.keys(currentSnapshot.derived || {}),
  ])
  for (const category of categories) {
    const saved = savedSnapshot.derived?.[category] || {}
    const current = currentSnapshot.derived?.[category] || {}
    if (Number(current.latestDerivedMs || 0) > Number(saved.latestDerivedMs || 0) + 1000) {
      reasons.push(`${category}_newer_than_checkpoint`)
    }
    if ((current.missingYahooIds || []).length > 0 || (current.staleYahooIds || []).length > 0) {
      reasons.push(`${category}_stale_now`)
    }
  }

  if ((currentSnapshot.phase17?.missingTargetGameIds || []).length > 0) reasons.push("phase17_missing_target_games")
  if ((currentSnapshot.phase17?.staleTargetGameIds || []).length > 0) reasons.push("phase17_stale_target_games")

  return {
    stale: reasons.length > 0,
    reasons: [...new Set(reasons)],
  }
}

function fallbackResumeStepIdForMode(mode) {
  switch (String(mode || "").trim()) {
    case "finalize-precomputed":
    case "fast-only":
      return "npm:phase11:build:batting"
    case "full-only":
    case "all":
      return "npm:phase:pitcher-poc1"
    default:
      return ""
  }
}

function checkpointStatusMeansStepAlreadySucceeded(status) {
  const value = String(status || "").trim()
  return (
    value === "completed" ||
    value === "completed-try" ||
    value === "completed-intermediate" ||
    value === "completed-final" ||
    value === "completed-prefetch" ||
    value === "completed-deadline-force" ||
    value === "completed-dry-run"
  )
}

function restoreCheckpointRunOptions(args, checkpointArgs) {
  if (!checkpointArgs || typeof checkpointArgs !== "object") return

  if (!args.gameIdsExplicit && Array.isArray(checkpointArgs.gameIds)) {
    args.gameIds = checkpointArgs.gameIds.map((v) => String(v || "").trim()).filter(Boolean)
  }
  if (!args.phase4SleepExplicit && checkpointArgs.phase4Sleep) {
    args.phase4Sleep = String(checkpointArgs.phase4Sleep).trim()
  }

  const restoreTrueFlags = [
    "dryRun",
    "skipPrefetch",
    "noStatsText",
    "noScoreRaw",
    "forceCanonical",
    "yahooForce",
    "skipScoreRawGate",
    "strictFullDerivedValidate",
    "strictPhase13Validate",
    "skipVsHandValidate",
    "strictVsHandValidate",
    "skipFastPublish",
    "noPublish",
    "autoDeployProduction",
    "build",
  ]
  for (const key of restoreTrueFlags) {
    if (checkpointArgs[key] === true) args[key] = true
  }

  if (checkpointArgs.strictQuality === false) {
    args.strictQuality = false
  }
}

function ensureFastPublishInputsFresh({ year, from, to, gameIds, dryRun }) {
  const targetIds = targetGameIdsForArgs({ from, to, gameIds })
  const affectedYahooIds = collectYahooBatterIdsForGames(targetIds)
  const affectedNpbPitcherIds = collectNpbPitcherIdsForGames(targetIds)
  const canonicalThresholdMs = targetIds.reduce((max, gameId) => Math.max(max, canonicalMtimeMsForGameId(gameId)), 0)
  const phase11Command = `npm run phase11:build:batting${derivedYahooArgsArg(affectedYahooIds, { from, to })}`
  const derivedAffectedArg = derivedYahooArgsArg(affectedYahooIds, { from, to })
  const affectedNpbPitcherArg = onlyNpbIdsArg(affectedNpbPitcherIds)
  const categoryPlans = [
    {
      category: "player_season_batting",
      command: phase11Command,
      rebuildLabel: "派生: phase11 batting（鮮度NGのため再生成）",
    },
    {
      category: "player_season_batting_count",
      command: `npm run phase16:build:batting-count${derivedAffectedArg}`,
      rebuildLabel: "派生: phase16 batting count（鮮度NGのため再生成）",
    },
  ]

  for (const plan of categoryPlans) {
    const report = derivedCategoryFreshnessReport({
      year,
      category: plan.category,
      yahooIds: affectedYahooIds,
      canonicalThresholdMs,
    })
    if (report.ok) continue

    console.warn(`\n[daily:npb-pipeline:v2] ${plan.category} 鮮度 NG → 再生成します:`)
    console.warn(
      `  affected=${report.affectedCount} missing=${report.missingYahooIds.length} stale=${report.staleYahooIds.length}`,
    )
    if (report.missingYahooIds.length > 0) {
      console.warn(`  missingYahooIds=${report.missingYahooIds.slice(0, 20).join(",")}`)
    }
    if (report.staleYahooIds.length > 0) {
      console.warn(`  staleYahooIds=${report.staleYahooIds.slice(0, 20).join(",")}`)
    }
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `${plan.category} stale affected=${report.affectedCount} missing=${report.missingYahooIds.length} stale=${report.staleYahooIds.length}`,
    )
    pushRunSummaryEvent("repairs", {
      kind: `${plan.category}_rebuild`,
      affectedCount: report.affectedCount,
      missingYahooIds: report.missingYahooIds.slice(0, 20),
      staleYahooIds: report.staleYahooIds.slice(0, 20),
    })
    run(plan.rebuildLabel, plan.command, { dryRun })
  }

  const pitchingReport = derivedNpbCategoryFreshnessReport({
    year,
    category: "player_season_pitching_poc",
    npbIds: affectedNpbPitcherIds,
    canonicalThresholdMs,
  })
  if (!pitchingReport.ok) {
    console.warn("\n[daily:npb-pipeline:v2] player_season_pitching_poc 鮮度 NG → 再生成します:")
    console.warn(
      `  affected=${pitchingReport.affectedCount} missing=${pitchingReport.missingNpbIds.length} stale=${pitchingReport.staleNpbIds.length}`,
    )
    if (pitchingReport.missingNpbIds.length > 0) {
      console.warn(`  missingNpbIds=${pitchingReport.missingNpbIds.slice(0, 20).join(",")}`)
    }
    if (pitchingReport.staleNpbIds.length > 0) {
      console.warn(`  staleNpbIds=${pitchingReport.staleNpbIds.slice(0, 20).join(",")}`)
    }
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `player_season_pitching_poc stale affected=${pitchingReport.affectedCount} missing=${pitchingReport.missingNpbIds.length} stale=${pitchingReport.staleNpbIds.length}`,
    )
    pushRunSummaryEvent("repairs", {
      kind: "player_season_pitching_poc_rebuild",
      affectedCount: pitchingReport.affectedCount,
      missingNpbIds: pitchingReport.missingNpbIds.slice(0, 20),
      staleNpbIds: pitchingReport.staleNpbIds.slice(0, 20),
    })
    run("派生: phase:pitcher-poc1（鮮度NGのため再生成）", `npm run phase:pitcher-poc1${affectedNpbPitcherArg}`, { dryRun })
    run(
      "派生: phase6 pitcher-catcher splits（投手PoC再生成に合わせて再生成）",
      `npm run phase6:build:pitcher-catcher-splits${affectedNpbPitcherArg}`,
      { dryRun },
    )
    run(
      "派生: phase7 pitcher period（投手PoC再生成に合わせて再生成）",
      `npm run phase7:build:pitcher-period${affectedNpbPitcherArg}`,
      { dryRun },
    )
  }
}

function ensureBattingSplitsFresh({ year, from, to, gameIds, dryRun }) {
  const targetIds = targetGameIdsForArgs({ from, to, gameIds })
  const affectedYahooIds = collectYahooBatterIdsForGames(targetIds)
  const canonicalThresholdMs = targetIds.reduce((max, gameId) => Math.max(max, canonicalMtimeMsForGameId(gameId)), 0)
  const report = derivedCategoryFreshnessReport({
    year,
    category: "player_season_batting_splits",
    yahooIds: affectedYahooIds,
    canonicalThresholdMs,
  })
  if (report.ok) {
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `player_season_batting_splits fresh affected=${report.affectedCount}`,
    )
    return
  }

  console.warn("\n[daily:npb-pipeline:v2] player_season_batting_splits 鮮度 NG → 1回目公開後、2回目公開前に再生成します:")
  console.warn(
    `  affected=${report.affectedCount} missing=${report.missingYahooIds.length} stale=${report.staleYahooIds.length}`,
  )
  if (report.missingYahooIds.length > 0) {
    console.warn(`  missingYahooIds=${report.missingYahooIds.slice(0, 20).join(",")}`)
  }
  if (report.staleYahooIds.length > 0) {
    console.warn(`  staleYahooIds=${report.staleYahooIds.slice(0, 20).join(",")}`)
  }
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `player_season_batting_splits stale affected=${report.affectedCount} missing=${report.missingYahooIds.length} stale=${report.staleYahooIds.length}`,
  )
  pushRunSummaryEvent("repairs", {
    kind: "player_season_batting_splits_rebuild_after_first_publish",
    affectedCount: report.affectedCount,
    missingYahooIds: report.missingYahooIds.slice(0, 20),
    staleYahooIds: report.staleYahooIds.slice(0, 20),
  })
  run(
    "派生: phase15 batting splits（1回目公開後・2回目公開前の鮮度NG再生成）",
    `npm run phase15:build:batting-splits${derivedYahooArgsArg(affectedYahooIds, { from, to })}`,
    { dryRun },
  )
}

function collectFinishedRawFreshnessFailures({ from, to, gameIds, noStatsText, noScoreRaw }) {
  const stale = []
  const kinds = []
  if (!noStatsText) kinds.push("stats", "text")
  if (!noScoreRaw) kinds.push("score")
  const gameIdsFilter = Array.isArray(gameIds) && gameIds.length > 0 ? new Set(gameIds) : null
  for (const dateJst of eachDateYmd(from, to)) {
    const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
    const snap = readJsonOrNull(snapPath)
    rememberFirstFinishedSeenFromSnapshot(dateJst, snap)
    const fallbackScheduleFetchedAtMs = parseIsoMs(snap?.fetchedAt)
    const games = Array.isArray(snap?.games) ? snap.games : []
    if (games.length === 0) continue
    for (const game of games) {
      const gameId = String(game?.gameId ?? "").trim()
      const status = String(game?.statusText ?? "").trim()
      if (gameIdsFilter && !gameIdsFilter.has(gameId)) continue
      if (!gameId || !/試合終了/.test(status)) continue
      const finishedSeenAtMs = firstFinishedSeenAtMs(dateJst, gameId) || fallbackScheduleFetchedAtMs
      if (finishedSeenAtMs <= 0) continue
      const staleKinds = kinds.filter((kind) => rawMetaFetchedAtMs(kind, gameId) < finishedSeenAtMs)
      if (staleKinds.length > 0) stale.push({ dateJst, gameId, staleKinds, firstFinishedSeenAtMs: finishedSeenAtMs })
    }
  }
  return stale
}

function printFinishedRawFreshnessFailures(stale) {
  for (const item of stale) {
    console.error(`  - ${item.gameId}:${item.staleKinds.join("+")}_raw_before_game_finished`)
  }
}

function repairFinishedRawFreshnessFailures({ year, stale, dryRun }) {
  const repairsByDate = new Map()
  for (const item of stale) {
    if (!repairsByDate.has(item.dateJst)) {
      repairsByDate.set(item.dateJst, { ids: new Set(), kinds: new Set() })
    }
    const repair = repairsByDate.get(item.dateJst)
    repair.ids.add(item.gameId)
    for (const kind of item.staleKinds) repair.kinds.add(kind)
  }
  for (const [dateJst, repair] of repairsByDate) {
    const idsSet = repair.ids
    const ids = [...idsSet].sort().join(",")
    if (repair.kinds.has("stats") || repair.kinds.has("text")) {
      run(
        `自己修復: 試合終了後の stats/text 強制再取得（${dateJst}・${idsSet.size}試合）`,
        `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --game-ids ${ids} --force`,
        { dryRun },
      )
    }
    if (repair.kinds.has("score")) {
      run(
        `自己修復: 試合終了後の score raw 強制再取得（${dateJst}・${idsSet.size}試合）`,
        `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --from-date ${dateJst} --to-date ${dateJst} --game-ids ${ids} --force --sleep 1.2`,
        { dryRun },
      )
    }
  }
}

function runFinishedRawFreshnessGate(args) {
  const stale = collectFinishedRawFreshnessFailures(args)
  if (stale.length === 0) {
    console.log("\n[daily:npb-pipeline:v2] 終了済み試合 raw 鮮度ゲート OK\n")
    return
  }
  console.error("\n[daily:npb-pipeline:v2] 終了済み試合 raw 鮮度ゲート NG:")
  printFinishedRawFreshnessFailures(stale)
  console.error("  → 対象試合だけを試合終了後の raw で強制再取得し、鮮度ゲートを1回再判定します。\n")
  const staleLabels = stale.map((item) => `${item.gameId}:${item.staleKinds.join("+")}_raw_before_game_finished`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `finished_raw_freshness_gate NG; auto_repair ${staleLabels.join(",")}`)
  pushRunSummaryEvent("repairs", {
    kind: "finished_raw_freshness_gate_auto_repair",
    stale,
  })

  repairFinishedRawFreshnessFailures({ ...args, stale })
  if (args.dryRun) return

  const remaining = collectFinishedRawFreshnessFailures(args)
  if (remaining.length === 0) {
    console.log("\n[daily:npb-pipeline:v2] 終了済み試合 raw 自己修復完了・鮮度ゲート OK\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `finished_raw_freshness_gate auto_repair OK games=${stale.length}`)
    return
  }

  console.error("\n[daily:npb-pipeline:v2] 終了済み試合 raw 自己修復後も鮮度ゲート NG:")
  printFinishedRawFreshnessFailures(remaining)
  console.error("  → 自動再取得は1回で停止しました。通信失敗や取得元の試合終了データを確認してください。\n")
  throw new Error("finished raw freshness gate failed after one auto-repair")
}

let stepNo = 0
let lastStep = ""
let currentArgs = null
let lastStepId = ""
let resumeState = {
  mode: "",
  token: "",
  stepId: "",
  stepIdVariants: [],
  released: true,
}

function summaryDir() {
  const dir = path.join(root, "_data", "scraped_games", "_meta")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function pipelineRunLockPath(args) {
  const from = String(args?.from || "unknown").trim() || "unknown"
  const to = String(args?.to || from).trim() || from
  return path.join(summaryDir(), `pipeline_run_v2_${from}_${to}.lock`)
}

function readPipelineRunLock(args) {
  return readJsonOrNull(pipelineRunLockPath(args))
}

function writePipelineRunLock(args, payload) {
  const p = pipelineRunLockPath(args)
  writeJsonFileWithRetrySync(p, {
    ...payload,
    updatedAtJst: formatJstTimestamp(),
  })
}

function isProcessAlive(pid) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (e) {
    if (e?.code === "EPERM") return true
    return false
  }
}

function describeStalePipelineRunLock(existing) {
  const pid = Number(existing?.pid)
  if (!Number.isInteger(pid) || pid <= 0) {
    return "running lock has no valid pid"
  }
  if (!isProcessAlive(pid)) {
    return `running lock pid is not alive: pid=${pid}`
  }
  return ""
}

function acquirePipelineRunLock(args) {
  const existing = readPipelineRunLock(args)
  const existingState = String(existing?.state || "").trim()
  let staleReason = ""
  if (!args.forceRunLock && existingState.startsWith("running")) {
    staleReason = describeStalePipelineRunLock(existing)
    if (!staleReason) return { acquired: false, existing }
  }
  const payload = {
    schemaVersion: "pipeline-run-v2-lock-1",
    state: args.dryRun ? "running-dry-run" : "running",
    runId: currentRunId,
    pid: process.pid,
    year: args.year,
    from: args.from,
    to: args.to,
    mode: deriveMode(args),
    startedAtJst: formatJstTimestamp(),
    forceRunLock: Boolean(args.forceRunLock),
  }
  writePipelineRunLock(args, payload)
  return { acquired: true, payload, replaced: Boolean(existing), staleReason, staleExisting: staleReason ? existing : null }
}

function initRunSummary(args) {
  currentRunId = buildRunId(args)
  runSummaryPath = path.join(summaryDir(), `pipeline_v2_run_summary_${currentRunId}.json`)
  runSummaryLatestPath = path.join(summaryDir(), "pipeline_v2_run_summary_latest.json")
  runSummary = {
    schemaVersion: "pipeline-v2-run-summary-1",
    runId: currentRunId,
    status: "running",
    startedAtJst: formatJstTimestamp(),
    args: {
      runId: currentRunId,
      year: args.year,
      from: args.from,
      to: args.to,
      gameIds: Array.isArray(args.gameIds) ? args.gameIds.slice() : [],
      mode: deriveMode(args),
      dryRun: Boolean(args.dryRun),
      skipPrefetch: Boolean(args.skipPrefetch),
      noStatsText: Boolean(args.noStatsText),
      noScoreRaw: Boolean(args.noScoreRaw),
      strictQuality: Boolean(args.strictQuality),
      forceCanonical: Boolean(args.forceCanonical),
      yahooForce: Boolean(args.yahooForce),
      phase4Sleep: String(args.phase4Sleep || ""),
      skipScoreRawGate: Boolean(args.skipScoreRawGate),
      strictFullDerivedValidate: Boolean(args.strictFullDerivedValidate),
      strictPhase13Validate: Boolean(args.strictPhase13Validate),
      skipVsHandValidate: Boolean(args.skipVsHandValidate),
      strictVsHandValidate: Boolean(args.strictVsHandValidate),
      skipFastPublish: Boolean(args.skipFastPublish),
      noPublish: Boolean(args.noPublish),
      autoDeployProduction: Boolean(args.autoDeployProduction),
      build: Boolean(args.build),
    },
    trigger: {
      reason: String(args.triggerReason || "").trim(),
      detail: String(args.triggerDetail || "").trim(),
    },
    progressState: args.noPublish ? "running_no_publish" : "running_before_publish",
    progressMessage: args.noPublish
      ? "公開なしで実行中。R2/production の反映完了判定には使わない。"
      : "実行中。まだ公開完了とは判定しない。",
    publishProgress: {
      fastPublish: "not_started",
      fastVerify: "not_started",
      fullDisplayPublish: "not_started",
      fullPublish: "not_started",
      fullVerify: "not_started",
      finalState: "not_complete",
      finalMessage: args.noPublish
        ? "noPublish=true のため公開工程は対象外。"
        : "公開工程は未完了。",
    },
    completedSteps: [],
    stepProgress: {
      current: null,
      totals: {
        started: 0,
        completed: 0,
        failed: 0,
        failedTry: 0,
        skippedDryRun: 0,
        skippedResume: 0,
      },
      byStepId: {},
    },
    stepFailures: [],
    warnings: [],
    repairs: [],
    retries: [],
    publishes: [],
    notes: [],
  }
  writeRunSummary()
}

function writeRunSummary() {
  if (!runSummary) return
  const payload = {
    ...runSummary,
    updatedAtJst: formatJstTimestamp(),
  }
  if (runSummaryPath) writeJsonFileWithRetrySync(runSummaryPath, payload)
  if (runSummaryLatestPath) writeJsonFileWithRetrySync(runSummaryLatestPath, payload)
}

function pushRunSummaryEvent(key, event, { limit = 120 } = {}) {
  if (!runSummary) return
  const next = Array.isArray(runSummary[key]) ? runSummary[key].slice() : []
  next.push({
    atJst: formatJstTimestamp(),
    ...event,
  })
  if (next.length > limit) next.splice(0, next.length - limit)
  runSummary[key] = next
  writeRunSummary()
}

function boundedMessage(value, max = 800) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function classifyStepKind(label, command) {
  const text = `${label}\n${command}`
  const lower = text.toLowerCase()
  const phase = text.match(/\bPhase\s*([0-9]+[a-z]?)/i)?.[1] || text.match(/\bphase([0-9]+[a-z]?)/i)?.[1]
  if (/公開確認|verify.*publish|production|本番/i.test(text)) return phase ? `phase${phase}_publish_verify` : "publish_verify"
  if (/公開|publish|upload|r2|vercel|deploy/i.test(text)) return phase ? `phase${phase}_publish` : "publish"
  if (/検証|validate|verify|gate/i.test(text)) return phase ? `phase${phase}_validation` : "validation"
  if (/取得|fetch|scrape|snapshot|sportsnavi|yahoo/i.test(text)) return phase ? `phase${phase}_fetch` : "fetch"
  if (/派生|enrich|build|ranking|rankings|standings|トップ表示|top-/i.test(text)) return phase ? `phase${phase}_build` : "build"
  if (lower.includes("repair") || /修復|補完|再生成/.test(text)) return phase ? `phase${phase}_repair` : "repair"
  return phase ? `phase${phase}` : "step"
}

function classifyStepFailure({ label, command, error, timedOut, exitCode, tryMode = false }) {
  const text = `${label}\n${command}\n${error?.message ?? error ?? ""}`
  const lower = text.toLowerCase()
  let kind = "step_failed"
  if (timedOut) kind = "timeout"
  else if (/yahoo_scrape_enabled=1|yahoo への http 取得をしません|yahoo_scrape_guard/i.test(text)) kind = "yahoo_scrape_guard_blocked"
  else if (/enoent|cannot find path|no such file|not found/i.test(text)) kind = "missing_file_or_command"
  else if (/eacces|access is denied|permission denied|アクセスが拒否/i.test(text)) kind = "permission_denied"
  else if (/validation|validate|検証|gate/i.test(text)) kind = "validation_failure"
  else if (/公開|publish|upload|r2|vercel|deploy|verify_display/i.test(text)) kind = "publish_or_verify_failure"
  else if (/fetch|scrape|snapshot|sportsnavi|yahoo|取得/i.test(text)) kind = "fetch_failure"
  else if (/build|派生|ranking|rankings|standings|生成/i.test(text)) kind = "build_failure"
  else if (typeof exitCode === "number" && exitCode !== 0) kind = "exit_nonzero"
  return {
    kind,
    severity: tryMode ? "warning" : "fatal",
    retryable: Boolean(timedOut || /ebusy|etimedout|econnreset|temporar|一時的|open 失敗/i.test(lower)),
  }
}

function ensureStepProgress() {
  if (!runSummary) return null
  const current = runSummary.stepProgress && typeof runSummary.stepProgress === "object" ? runSummary.stepProgress : {}
  runSummary.stepProgress = {
    current: current.current ?? null,
    totals: {
      started: Number(current.totals?.started || 0),
      completed: Number(current.totals?.completed || 0),
      failed: Number(current.totals?.failed || 0),
      failedTry: Number(current.totals?.failedTry || 0),
      skippedDryRun: Number(current.totals?.skippedDryRun || 0),
      skippedResume: Number(current.totals?.skippedResume || 0),
    },
    byStepId: current.byStepId && typeof current.byStepId === "object" ? current.byStepId : {},
  }
  if (!Array.isArray(runSummary.stepFailures)) runSummary.stepFailures = []
  return runSummary.stepProgress
}

function recordPipelineStepStart({ label, command, stepId, tryMode = false }) {
  const progress = ensureStepProgress()
  if (!progress) return
  const atJst = formatJstTimestamp()
  const step = {
    label,
    command,
    stepId,
    kind: classifyStepKind(label, command),
    state: "running",
    tryMode: Boolean(tryMode),
    startedAtJst: atJst,
  }
  progress.current = step
  progress.totals.started += 1
  progress.byStepId[stepId] = {
    ...(progress.byStepId[stepId] ?? {}),
    ...step,
    lastStartedAtJst: atJst,
  }
  writeRunSummary()
}

function recordPipelineStepSkipped({ label, command, stepId, reason, tryMode = false }) {
  const progress = ensureStepProgress()
  if (!progress) return
  const atJst = formatJstTimestamp()
  const state = reason === "dry-run" ? "skipped-dry-run" : "skipped-resume"
  if (reason === "dry-run") progress.totals.skippedDryRun += 1
  else progress.totals.skippedResume += 1
  progress.current = null
  progress.byStepId[stepId] = {
    ...(progress.byStepId[stepId] ?? {}),
    label,
    command,
    stepId,
    kind: classifyStepKind(label, command),
    state,
    tryMode: Boolean(tryMode),
    skippedAtJst: atJst,
    skipReason: reason,
  }
  writeRunSummary()
}

function recordPipelineStepSuccess({ label, command, stepId, elapsed, attempts = 1, tryMode = false }) {
  const progress = ensureStepProgress()
  if (!progress) return
  const atJst = formatJstTimestamp()
  progress.current = null
  progress.totals.completed += 1
  progress.byStepId[stepId] = {
    ...(progress.byStepId[stepId] ?? {}),
    label,
    command,
    stepId,
    kind: classifyStepKind(label, command),
    state: "completed",
    tryMode: Boolean(tryMode),
    elapsed,
    attempts,
    completedAtJst: atJst,
  }
  writeRunSummary()
}

function recordPipelineStepFailure({ label, command, stepId, elapsed, error, exitCode, timedOut, tryMode = false }) {
  const progress = ensureStepProgress()
  if (!progress) return null
  const atJst = formatJstTimestamp()
  const classification = classifyStepFailure({ label, command, error, timedOut, exitCode, tryMode })
  const failure = {
    label,
    command,
    stepId,
    stepKind: classifyStepKind(label, command),
    state: tryMode ? "failed-try" : "failed",
    tryMode: Boolean(tryMode),
    elapsed,
    exitCode,
    timedOut: Boolean(timedOut),
    failureKind: classification.kind,
    severity: classification.severity,
    retryable: classification.retryable,
    message: boundedMessage(error?.message ?? error),
  }
  progress.current = null
  if (tryMode) progress.totals.failedTry += 1
  else progress.totals.failed += 1
  progress.byStepId[stepId] = {
    ...(progress.byStepId[stepId] ?? {}),
    ...failure,
    failedAtJst: atJst,
  }
  const failures = Array.isArray(runSummary.stepFailures) ? runSummary.stepFailures.slice() : []
  failures.push({
    atJst,
    ...failure,
  })
  if (failures.length > 120) failures.splice(0, failures.length - 120)
  runSummary.stepFailures = failures
  writeRunSummary()
  return failure
}

function setRunProgress(progressState, progressMessage, publishPatch = {}) {
  if (!runSummary) return
  runSummary.progressState = progressState
  runSummary.progressMessage = progressMessage
  runSummary.publishProgress = {
    ...(runSummary.publishProgress ?? {}),
    ...publishPatch,
  }
  writeRunSummary()
}

function progressPatchForStep(stepId, phase, ok = null) {
  const id = String(stepId || "").trim()
  const state = phase === "start" ? "running" : ok ? "completed" : "failed"
  if (id === "publish-fast-display") return { fastPublish: state }
  if (id === "publish-full-display-delta") return { fullDisplayPublish: state }
  if (id === "publish-full-derived" || id === "publish-daily-full-derived") {
    return { fullPublish: state }
  }
  if (id === "verify-display-publish-fast") return { fastVerify: state }
  if (id === "verify-display-publish-full") return { fullVerify: state }
  if (id === "verify-display-publish") {
    return { fastVerify: state }
  }
  return null
}

function updateProgressForStepStart(label, stepId) {
  const patch = progressPatchForStep(stepId, "start")
  if (!patch) return
  const id = String(stepId || "").trim()
  if (id === "publish-fast-display") {
    setRunProgress(
      "publishing_fast",
      "1回目公開を実行中。球場別など full derived はまだ本番反映完了と判定しない。",
      { ...patch, finalState: "not_complete", finalMessage: "1回目公開中。2回目公開は未完了。" },
    )
  } else if (id === "publish-full-display-delta" || id === "publish-full-derived" || id === "publish-daily-full-derived") {
    setRunProgress(
      "publishing_full",
      "2回目公開を実行中。予想投手タブと詳細派生を反映中。",
      { ...patch, finalState: "not_complete", finalMessage: "2回目公開中。公開確認は未完了。" },
    )
  } else if (id === "verify-display-publish" || id === "verify-display-publish-fast" || id === "verify-display-publish-full") {
    const isSecondVerify = id === "verify-display-publish-full" || /2回目/.test(String(label || ""))
    setRunProgress(
      isSecondVerify ? "verifying_full_publish" : "verifying_fast_publish",
      isSecondVerify
        ? "2回目公開後の確認中。ここが OK になるまで当日最終公開完了とは判定しない。"
        : "1回目公開後の確認中。OK でも full derived の公開完了とは判定しない。",
      {
        ...(isSecondVerify ? { fullVerify: "running" } : { fastVerify: "running" }),
        finalState: "not_complete",
        finalMessage: isSecondVerify ? "2回目公開確認中。" : "1回目公開確認中。2回目公開は未完了。",
      },
    )
  }
}

function updateProgressForStepSuccess(label, stepId) {
  const patch = progressPatchForStep(stepId, "success", true)
  if (!patch) return
  const id = String(stepId || "").trim()
  if (id === "publish-fast-display") {
    setRunProgress(
      "fast_publish_uploaded",
      "1回目公開のアップロード完了。球場別など full derived はまだ2回目公開待ち。",
      { ...patch, finalState: "not_complete", finalMessage: "1回目公開のみ完了。2回目公開は未完了。" },
    )
  } else if (id === "publish-full-display-delta" || id === "publish-full-derived" || id === "publish-daily-full-derived") {
    setRunProgress(
      "full_publish_uploaded",
      "2回目公開のアップロード完了。予想投手タブと詳細派生は R2 へ送信済み、公開確認待ち。",
      { ...patch, finalState: "not_complete", finalMessage: "2回目公開アップロード完了、確認待ち。" },
    )
  } else if (id === "verify-display-publish" || id === "verify-display-publish-fast" || id === "verify-display-publish-full") {
    const isSecondVerify = id === "verify-display-publish-full" || /2回目/.test(String(label || ""))
    setRunProgress(
      isSecondVerify ? "full_publish_verified" : "fast_publish_verified",
      isSecondVerify
        ? "2回目公開確認 OK。球場別を含む当日最終公開まで確認済み。"
        : "1回目公開確認 OK。これは途中公開の確認で、2回目公開完了ではない。",
      {
        ...(isSecondVerify ? { fullVerify: "completed" } : { fastVerify: "completed" }),
        finalState: isSecondVerify ? "complete" : "not_complete",
        finalMessage: isSecondVerify
          ? "2回目公開確認まで完了。"
          : "1回目公開確認のみ完了。2回目公開は未完了。",
      },
    )
  }
}

function updateProgressForStepFailure(label, stepId, message = "") {
  const patch = progressPatchForStep(stepId, "failure", false)
  if (!patch) return
  const id = String(stepId || "").trim()
  const suffix = message ? ` message=${message}` : ""
  if (id === "publish-fast-display") {
    setRunProgress(
      "failed_fast_publish",
      `1回目公開で失敗。2回目公開は未実行。${suffix}`.trim(),
      { ...patch, finalState: "failed_before_full_publish", finalMessage: "1回目公開で停止。2回目公開未実行。" },
    )
  } else if (id === "publish-full-display-delta" || id === "publish-full-derived" || id === "publish-daily-full-derived") {
    setRunProgress(
      "failed_full_publish",
      `2回目公開で失敗。予想投手タブと詳細派生の本番反映は完了扱いにしない。${suffix}`.trim(),
      { ...patch, finalState: "failed_full_publish", finalMessage: "2回目公開で停止。" },
    )
  } else if (id === "verify-display-publish" || id === "verify-display-publish-fast" || id === "verify-display-publish-full") {
    const isSecondVerify = id === "verify-display-publish-full" || /2回目/.test(String(label || ""))
    setRunProgress(
      isSecondVerify ? "failed_full_publish_verify" : "failed_fast_publish_verify",
      isSecondVerify
        ? `2回目公開後の確認で失敗。球場別を含む当日最終公開は未確認。${suffix}`.trim()
        : `1回目公開後の確認で失敗。2回目公開は未実行。${suffix}`.trim(),
      {
        ...(isSecondVerify ? { fullVerify: "failed" } : { fastVerify: "failed" }),
        finalState: isSecondVerify ? "failed_full_verify" : "failed_before_full_publish",
        finalMessage: isSecondVerify ? "2回目公開確認で停止。" : "1回目公開確認で停止。2回目公開未実行。",
      },
    )
  }
}

function assertFinalPublishCompletedBeforeFinalStatus(args) {
  if (args.dryRun || args.noPublish) return
  const progress = runSummary?.publishProgress ?? {}
  const missing = []
  if (progress.fullDisplayPublish !== "completed") missing.push("R2公開(2回目): full display delta")
  if (progress.fullPublish !== "completed") missing.push("R2公開(2回目): daily/full derived")
  if (progress.fullVerify !== "completed") missing.push("公開確認(2回目)")
  if (missing.length === 0) return

  runSummary.progressState = "failed_final_publish_incomplete"
  runSummary.progressMessage = `当日最終完了判定前に2回目公開の未完了を検出: ${missing.join(", ")}`
  runSummary.publishProgress = {
    ...progress,
    finalState: "failed_final_publish_incomplete",
    finalMessage: `2回目公開未完了: ${missing.join(", ")}`,
  }
  recordPipelineStepFailure({
    label: "最終完了判定: 2回目公開完了チェック",
    command: "internal:assertFinalPublishCompletedBeforeFinalStatus",
    stepId: "final-publish-completion-gate",
    elapsed: "0:00",
    error: new Error(`2回目公開未完了: ${missing.join(", ")}`),
    exitCode: 1,
    timedOut: false,
  })
  writeRunSummary()
  throw new Error(`completed-final blocked: missing ${missing.join(", ")}`)
}

function log(msg) {
  console.log(`[daily:npb-pipeline:v2] [${nowIsoLocal()}] #${++stepNo} ${msg}`)
}

function pipelineCheckpointPath() {
  return path.join(root, "_data", "scraped_games", "_meta", "pipeline_checkpoint_v2.json")
}

function pipelineCheckpointRunPath(runId = currentRunId) {
  const safeRunId = String(runId || "").trim()
  if (!safeRunId) return pipelineCheckpointPath()
  return path.join(root, "_data", "scraped_games", "_meta", `pipeline_checkpoint_v2_${safeRunId}.json`)
}

function writePipelineCheckpoint(status, label, command = "", extra = {}) {
  const inputSnapshot =
    Object.prototype.hasOwnProperty.call(extra, "inputSnapshot") ? extra.inputSnapshot : buildCheckpointInputSnapshot()
  const checkpoint = {
    runId: currentRunId,
    status,
    label,
    command,
    lastStep,
    stepNo,
    updatedAtJst: formatJstTimestamp(),
    args: currentArgs
      ? {
          runId: currentRunId,
          year: currentArgs.year,
          from: currentArgs.from,
          to: currentArgs.to,
          gameIds: Array.isArray(currentArgs.gameIds) ? currentArgs.gameIds.slice() : [],
          mode: deriveMode(currentArgs),
          dryRun: Boolean(currentArgs.dryRun),
          skipPrefetch: Boolean(currentArgs.skipPrefetch),
          noStatsText: Boolean(currentArgs.noStatsText),
          noScoreRaw: Boolean(currentArgs.noScoreRaw),
          strictQuality: Boolean(currentArgs.strictQuality),
          forceCanonical: Boolean(currentArgs.forceCanonical),
          yahooForce: Boolean(currentArgs.yahooForce),
          phase4Sleep: String(currentArgs.phase4Sleep || ""),
          skipScoreRawGate: Boolean(currentArgs.skipScoreRawGate),
          strictFullDerivedValidate: Boolean(currentArgs.strictFullDerivedValidate),
          strictPhase13Validate: Boolean(currentArgs.strictPhase13Validate),
          skipVsHandValidate: Boolean(currentArgs.skipVsHandValidate),
          strictVsHandValidate: Boolean(currentArgs.strictVsHandValidate),
          skipFastPublish: Boolean(currentArgs.skipFastPublish),
          noPublish: Boolean(currentArgs.noPublish),
          autoDeployProduction: Boolean(currentArgs.autoDeployProduction),
          build: Boolean(currentArgs.build),
        }
      : null,
    inputSnapshot,
    progressState: runSummary?.progressState ?? null,
    progressMessage: runSummary?.progressMessage ?? null,
    publishProgress: runSummary?.publishProgress ?? null,
    ...extra,
  }
  const latestPath = pipelineCheckpointPath()
  const runPath = pipelineCheckpointRunPath()
  fs.mkdirSync(path.dirname(latestPath), { recursive: true })
  writeJsonFileWithRetrySync(runPath, checkpoint)
  writeJsonFileWithRetrySync(latestPath, checkpoint)
}

function normalizeResumeText(value) {
  return String(value ?? "").trim().toLowerCase()
}

function normalizeStepIdText(value) {
  return normalizeResumeText(value)
    .replace(/・再試行後/g, "")
    .replace(/・再試行/g, "")
    .replace(/\(再実行\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function commandCoreStepId(command) {
  const cmd = normalizeResumeText(command).replace(/\s+/g, " ")
  let match = cmd.match(/^npm run ([^\s]+)/)
  if (match) return `npm:${match[1]}`
  match = cmd.match(/^node scripts\/([^\s]+)/)
  if (match) return `node:${match[1].replace(/\.(mjs|js)$/g, "")}`
  match = cmd.match(/^python(?: -u)? scripts\/([^\s]+)/)
  if (match) return `py:${match[1].replace(/\.py$/g, "")}`
  match = cmd.match(/^npx tsx scripts\/([^\s]+)/)
  if (match) return `tsx:${match[1].replace(/\.(ts|tsx)$/g, "")}`
  return ""
}

function inferStepId(label, command = "") {
  const core = commandCoreStepId(command)
  const labelNorm = normalizeStepIdText(label)
  if (core === "node:verify_display_publish_after_upload") {
    if (labelNorm.includes("1回目")) return "verify-display-publish-fast"
    if (labelNorm.includes("2回目")) return "verify-display-publish-full"
    if (normalizeResumeText(command).includes("--no-production")) return "verify-display-publish-r2-only"
  }
  if (core === "node:display_publish_fast_2026") return "publish-fast-display"
  if (core === "node:display_r2_upload_derived") {
    if (labelNorm.includes("daily full derived")) return "publish-daily-full-derived"
    if (labelNorm.includes("full derived")) return "publish-full-derived"
  }
  if (core === "npm:display:r2:upload:full-display-delta:2026") return "publish-full-display-delta"
  if (core === "npm:display:r2:upload:derived:2026") return "publish-full-derived"
  if (core === "npm:display:r2:upload:derived:2026:daily-full") return "publish-daily-full-derived"
  if (core) return core
  const fallback = labelNorm.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")
  return `label:${fallback || "unknown"}`
}

function stepIdVariants(value) {
  const base = normalizeResumeText(value)
  if (!base) return []
  const variants = new Set([base])
  variants.add(base.replace(/-retry-after$/g, ""))
  variants.add(base.replace(/-retry$/g, ""))
  return [...variants].filter(Boolean)
}

function resumeTokenVariants(value) {
  const base = normalizeResumeText(value)
  if (!base) return []
  const variants = new Set([base])
  variants.add(base.replace(/・再試行後/g, ""))
  variants.add(base.replace(/・再試行/g, ""))
  variants.add(base.replace(/\(1回目・再試行後\)/g, "(1回目)"))
  variants.add(base.replace(/\(2回目・再試行後\)/g, "(2回目)"))
  variants.add(base.replace(/\s+/g, " "))
  if (/公開1回目.*vercel本番プロキシ再デプロイ/.test(base)) {
    variants.add("公開確認(1回目): 主要表示 + 週次 + 選手成績")
    variants.add("verify-display-publish-fast")
  }
  if (/公開2回目.*vercel本番プロキシ再デプロイ/.test(base)) {
    variants.add("公開確認(2回目): 主要表示 + 週次 + 選手成績")
    variants.add("verify-display-publish-full")
  }
  return [...variants].filter(Boolean)
}

function configureResume(args) {
  const resumeFrom = String(args.resumeFrom ?? "").trim()
  const resumeAfter = String(args.resumeAfter ?? "").trim()
  const resumeFromStepId = String(args.resumeFromStepId ?? "").trim()
  const resumeAfterStepId = String(args.resumeAfterStepId ?? "").trim()
  if (resumeFrom && resumeAfter) {
    throw new Error("--resume-from と --resume-after は同時指定できません")
  }
  const token = resumeFrom || resumeAfter
  const stepId = resumeFromStepId || resumeAfterStepId
  resumeState = {
    mode: resumeFrom ? "from" : resumeAfter ? "after" : resumeFromStepId ? "from" : resumeAfterStepId ? "after" : "",
    token: normalizeResumeText(token),
    tokenVariants: resumeTokenVariants(token),
    stepId: normalizeResumeText(stepId),
    stepIdVariants: stepIdVariants(stepId),
    released: !(token || stepId),
  }
  if (token || stepId) {
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `resume ${resumeState.mode}: token=${token || "-"} stepId=${stepId || "-"}`,
    )
    console.log(
      `\n[daily:npb-pipeline:v2] resume ${resumeState.mode}: "${token || stepId}" に一致する工程までスキップします。\n`,
    )
  }
}

function applyResumeFromCheckpoint(args) {
  if (!args.resumeFromCheckpoint) return args
  if (args.resumeFrom || args.resumeAfter) {
    throw new Error("--resume-from-checkpoint と --resume-from / --resume-after は同時指定できません")
  }

  const checkpoint = readJsonOrNull(pipelineCheckpointPath())
  if (!checkpoint) {
    throw new Error("checkpoint が見つかりません。先に通常実行するか、_data/scraped_games/_meta/pipeline_checkpoint_v2.json を確認してください")
  }

  const checkpointArgs = checkpoint.args ?? {}
  const resumeLabel = String(checkpoint.resumeFrom || checkpoint.label || "").trim()
  const resumeStepId = String(
    checkpoint.resumeFromStepId || checkpoint.stepId || inferStepId(resumeLabel, checkpoint.command || ""),
  ).trim()
  if (!resumeLabel) {
    throw new Error("checkpoint に resume 対象の工程名がありません")
  }

  if (!args.fromExplicit && checkpointArgs.from) args.from = String(checkpointArgs.from).trim()
  if (!args.toExplicit && checkpointArgs.to) args.to = String(checkpointArgs.to).trim()
  if (checkpointArgs.year) args.year = String(checkpointArgs.year).trim()
  if (checkpoint.runId) args.runId = String(checkpoint.runId).trim()
  restoreCheckpointRunOptions(args, checkpointArgs)

  const checkpointMode = String(checkpointArgs.mode || "").trim()
  const checkpointStatus = String(checkpoint.status || "").trim()
  args.prefetchOnly = checkpointMode === "prefetch-only"
  args.fastOnly = checkpointMode === "fast-only"
  args.fullOnly = checkpointMode === "full-only"
  args.finalizePrecomputed = checkpointMode === "finalize-precomputed"
  const currentSnapshot = buildCheckpointInputSnapshot(args)
  const freshness = checkpointInputFreshnessStatus(checkpoint.inputSnapshot, currentSnapshot)
  if (freshness.stale) {
    const fallbackStepId = fallbackResumeStepIdForMode(checkpointMode)
    args.resumeFrom = ""
    args.resumeFromStepId = fallbackStepId
    args.resumeAfter = ""
    args.resumeAfterStepId = ""
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `checkpoint stale -> rewind stepId=${fallbackStepId || "-"} reasons=${freshness.reasons.join(",")}`,
    )
    console.warn(
      `\n[daily:npb-pipeline:v2] checkpoint は古い入力を指しているため、そのまま再開しません。 reasons=${freshness.reasons.join(",")}\n`,
    )
    if (fallbackStepId) {
      console.warn(
        `[daily:npb-pipeline:v2] 安全側へ巻き戻します: ${resumeLabel} / ${resumeStepId || "-"} → ${fallbackStepId}\n`,
      )
    }
  } else {
    const resumeAfterCompletedStep = checkpointStatusMeansStepAlreadySucceeded(checkpointStatus)
    if (resumeAfterCompletedStep) {
      args.resumeFrom = ""
      args.resumeFromStepId = ""
      args.resumeAfter = resumeLabel
      args.resumeAfterStepId = resumeStepId
      console.log(
        `\n[daily:npb-pipeline:v2] checkpoint の工程は成功済みのため、同じ工程は再実行せず次から再開します: ${resumeLabel} / ${resumeStepId || "-"}\n`,
      )
    } else {
      args.resumeFrom = resumeLabel
      args.resumeFromStepId = resumeStepId
      args.resumeAfter = ""
      args.resumeAfterStepId = ""
    }
  }

  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `resume-from-checkpoint status=${checkpoint.status || ""} label=${resumeLabel} stepId=${resumeStepId || "-"} from=${args.from} to=${args.to} mode=${checkpointMode || "all"} autoDeployProduction=${args.autoDeployProduction ? "true" : "false"} actualResumeMode=${args.resumeAfterStepId || args.resumeAfter ? "after" : "from"} actualResumeStepId=${args.resumeAfterStepId || args.resumeFromStepId || "-"}`,
  )
  console.log(
    `\n[daily:npb-pipeline:v2] checkpoint から再開します: ${resumeLabel} / ${args.resumeAfterStepId || args.resumeFromStepId || resumeStepId || "-"} (${args.from}〜${args.to}, mode=${checkpointMode || "all"}, autoDeployProduction=${args.autoDeployProduction ? "true" : "false"})\n`,
  )
  return args
}

function stepMatchesResumeToken(label, command, stepId = "") {
  const normalizedStepId = normalizeResumeText(stepId)
  if (resumeState.stepId) {
    const variants = Array.isArray(resumeState.stepIdVariants) && resumeState.stepIdVariants.length > 0
      ? resumeState.stepIdVariants
      : [resumeState.stepId]
    if (variants.some((token) => normalizedStepId === token)) return true
  }
  if (!resumeState.token) return false
  const haystack = normalizeResumeText(`${label}\n${command}`)
  const variants = Array.isArray(resumeState.tokenVariants) && resumeState.tokenVariants.length > 0
    ? resumeState.tokenVariants
    : [resumeState.token]
  return variants.some((token) => haystack.includes(token))
}

function shouldSkipForResume(label, command, stepId) {
  if (resumeState.released) return false
  const matched = stepMatchesResumeToken(label, command, stepId)
  if (!matched) {
    log(`← スキップ: ${label}（resume-${resumeState.mode} 待機中）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `resume skip: ${label}`)
    writePipelineCheckpoint("skipped-resume", label, command, {
      stepId,
      resumeMode: resumeState.mode,
      resumeToken: resumeState.token,
      resumeStepId: resumeState.stepId,
    })
    return true
  }
  resumeState.released = true
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `resume hit: ${label} stepId=${stepId || "-"}`)
  if (resumeState.mode === "after") {
    log(`← スキップ: ${label}（resume-after 一致工程）`)
    writePipelineCheckpoint("skipped-resume-hit", label, command, {
      stepId,
      resumeMode: resumeState.mode,
      resumeToken: resumeState.token,
      resumeStepId: resumeState.stepId,
    })
    return true
  }
  console.log(`\n[daily:npb-pipeline:v2] resume-from 一致: ${label} / ${stepId || "-"} から再開します。\n`)
  return false
}

function transientCommandRetryEligible(label, command, opts = {}) {
  if (opts.transientRetry === false) return false
  const text = `${label}\n${command}`.toLowerCase()
  if (/deploy|vercel|publish|upload|verify|validate|gate|検証|公開|本番/.test(text)) return false
  return /phase|ranking|rankings|ランキング|派生|補完|取得|backfill|enrich|build:yahoo/.test(text)
}

function execPipelineStepWithRetry(label, command, opts = {}) {
  const maxAttempts = transientCommandRetryEligible(label, command, opts) ? 3 : 1
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(command, {
        cwd: root,
        stdio: "inherit",
        shell: true,
        env: childEnvForCommand(command),
        timeout: opts.timeoutMs || commandTimeoutMs(opts.timeoutKind || "default"),
      })
      return { attempts: attempt }
    } catch (e) {
      lastError = e
      const timedOut = Boolean(e?.signal) || /timed out/i.test(String(e?.message ?? ""))
      if (timedOut || attempt >= maxAttempts) break
      const waitMs = attempt === 1 ? 5000 : 15000
      const message = `一時的なファイル open 失敗の可能性があるため再試行します: ${label} attempt=${attempt + 1}/${maxAttempts} wait=${Math.round(waitMs / 1000)}s`
      console.warn(`\n[daily:npb-pipeline:v2] ${message}\n`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `retry_transient_step ${message}`)
      pushRunSummaryEvent("retries", {
        kind: "transient_step_retry",
        label,
        command,
        attempt: attempt + 1,
        maxAttempts,
        waitMs,
        message: String(e?.message ?? e),
      })
      sleepSync(waitMs)
    }
  }
  throw lastError
}

function run(label, command, opts = {}) {
  lastStep = label
  const stepId = String(opts.stepId || inferStepId(label, command)).trim()
  lastStepId = stepId
  if (shouldSkipForResume(label, command, stepId)) {
    recordPipelineStepSkipped({ label, command, stepId, reason: "resume" })
    return
  }
  const startedAt = Date.now()
  log(`→ 開始: ${label}`)
  recordPipelineStepStart({ label, command, stepId })
  updateProgressForStepStart(label, stepId)
  writePipelineCheckpoint("running", label, command, { stepId })
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run: ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    recordPipelineStepSkipped({ label, command, stepId, reason: "dry-run" })
    writePipelineCheckpoint("skipped-dry-run", label, command, { stepId })
    return
  }
  let execResult = { attempts: 1 }
  try {
    execResult = execPipelineStepWithRetry(label, command, opts)
  } catch (e) {
    const elapsed = formatMs(Date.now() - startedAt)
    const code = e && typeof e.status === "number" ? e.status : 1
    const timedOut = Boolean(e?.signal) || /timed out/i.test(String(e?.message ?? ""))
    log(`← 失敗: ${label}（所要 ${elapsed}） exit=${code}${timedOut ? " timeout" : ""}`)
    updateProgressForStepFailure(label, stepId, e?.message || String(e))
    const failure = recordPipelineStepFailure({
      label,
      command,
      stepId,
      elapsed,
      error: e,
      exitCode: code,
      timedOut,
    })
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `失敗: ${label} 所要=${elapsed} exit=${code}${timedOut ? " timeout=1" : ""} failureKind=${failure?.failureKind || "step_failed"}`,
    )
    writePipelineCheckpoint("failed", label, command, {
      stepId,
      elapsed,
      exitCode: code,
      timedOut,
      failureKind: failure?.failureKind,
      stepKind: failure?.stepKind,
      retryable: failure?.retryable,
      resumeFrom: label,
      resumeFromStepId: stepId,
      resumeAfterPrevious: true,
    })
    throw e
  }
  const elapsed = formatMs(Date.now() - startedAt)
  log(`← 終了: ${label}（所要 ${elapsed}）`)
  updateProgressForStepSuccess(label, stepId)
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `完了: ${label} 所要=${elapsed}${execResult.attempts > 1 ? ` attempts=${execResult.attempts}` : ""}`,
  )
  recordPipelineStepSuccess({ label, command, stepId, elapsed, attempts: execResult.attempts })
  pushRunSummaryEvent("completedSteps", { label, stepId, elapsed, command, attempts: execResult.attempts })
  writePipelineCheckpoint("completed", label, command, { stepId, elapsed, attempts: execResult.attempts })
}

function runTry(label, command, opts = {}) {
  lastStep = label
  const stepId = String(opts.stepId || inferStepId(label, command)).trim()
  lastStepId = stepId
  if (shouldSkipForResume(label, command, stepId)) {
    recordPipelineStepSkipped({ label, command, stepId, reason: "resume", tryMode: true })
    return true
  }
  const startedAt = Date.now()
  log(`→ 開始: ${label}（失敗しても続行可）`)
  recordPipelineStepStart({ label, command, stepId, tryMode: true })
  updateProgressForStepStart(label, stepId)
  writePipelineCheckpoint("running-try", label, command, { stepId })
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run(try): ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    recordPipelineStepSkipped({ label, command, stepId, reason: "dry-run", tryMode: true })
    writePipelineCheckpoint("skipped-dry-run-try", label, command, { stepId })
    return true
  }
  try {
    const execResult = execPipelineStepWithRetry(label, command, opts)
    const elapsed = formatMs(Date.now() - startedAt)
    log(`← 終了: ${label}（所要 ${elapsed}）`)
    updateProgressForStepSuccess(label, stepId)
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `完了(try): ${label} 所要=${elapsed}${execResult.attempts > 1 ? ` attempts=${execResult.attempts}` : ""}`,
    )
    recordPipelineStepSuccess({ label, command, stepId, elapsed, tryMode: true, attempts: execResult.attempts })
    pushRunSummaryEvent("completedSteps", { label, stepId, elapsed, command, tryMode: true, attempts: execResult.attempts })
    writePipelineCheckpoint("completed-try", label, command, { stepId, elapsed, attempts: execResult.attempts })
    return true
  } catch (e) {
    const elapsed = formatMs(Date.now() - startedAt)
    const timedOut = Boolean(e?.signal) || /timed out/i.test(String(e?.message ?? ""))
    log(`← 失敗: ${label}（所要 ${elapsed}）${timedOut ? " timeout" : ""}`)
    updateProgressForStepFailure(label, stepId, e?.message || String(e))
    const code = e && typeof e.status === "number" ? e.status : 1
    const failure = recordPipelineStepFailure({
      label,
      command,
      stepId,
      elapsed,
      error: e,
      exitCode: code,
      timedOut,
      tryMode: true,
    })
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `失敗(try): ${label} 所要=${elapsed}${timedOut ? " timeout=1" : ""} failureKind=${failure?.failureKind || "step_failed"}`,
    )
    pushRunSummaryEvent("retries", {
      label,
      elapsed,
      command,
      result: "failed-try",
      timedOut,
      exitCode: code,
      failureKind: failure?.failureKind,
      stepKind: failure?.stepKind,
      retryable: failure?.retryable,
    })
    writePipelineCheckpoint("failed-try", label, command, {
      stepId,
      elapsed,
      timedOut,
      exitCode: code,
      failureKind: failure?.failureKind,
      stepKind: failure?.stepKind,
      retryable: failure?.retryable,
      resumeFrom: label,
      resumeFromStepId: stepId,
      warningOnly: true,
    })
    return false
  }
}

function runWarnOnlyValidation(label, command, { dryRun, strict = false, note = "" } = {}) {
  if (runTry(label, command, { dryRun })) return
  const message = `${label} がNGでした。${note || "公開は継続し、差分は後続調査対象としてログに残します。"}`
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message}`)
  pushRunSummaryEvent("warnings", {
    kind: "warn_only_validation",
    label,
    command,
    strict,
    message,
  })
  if (strict) {
    throw new Error(`${message} --strict-full-derived-validate 指定のため停止します。`)
  }
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
}

function vsHandFailureReportPath(year) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(root, "_data", "scraped_games", "_meta", `vs_hand_failure_${year}_${ts}.json`)
}

function writeVsHandFailureReport({ year, validationCommand, dryRun }) {
  const reportPath = vsHandFailureReportPath(year)
  if (dryRun) {
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `dry-run: vs_hand failure report path=${reportPath} cmd=${validationCommand} -- --report-json ${reportPath}`,
    )
    return reportPath
  }
  const reportCommand = `${validationCommand} -- --report-json "${reportPath}"`
  try {
    execSync(reportCommand, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: childEnv,
      timeout: commandTimeoutMs("validate"),
    })
  } catch {
    // 検証失敗で exit 1 でも、report-json が出力されていれば十分。
  }
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `vs_hand failure report=${reportPath}`)
  pushRunSummaryEvent("warnings", {
    kind: "vs_hand_failure_report",
    reportPath,
    validationCommand,
  })
  return reportPath
}

function deployProductionViaVercelAndWait({ publishStage, dryRun }) {
  const scopePrefix = vercelScopePrefix()
  const deployCommand = `${VERCEL_CLI}${scopePrefix} --prod --yes`
  if (dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run: ${publishStage} deploy cmd=${deployCommand}`)
    return
  }

  const deployStdout = execSync(deployCommand, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
    stdio: ["ignore", "pipe", "inherit"],
    timeout: commandTimeoutMs("publish"),
  })
  const deploymentUrl = extractFirstUrl(deployStdout)
  if (!deploymentUrl) {
    throw new Error(`${publishStage}: failed to capture Vercel deployment URL`)
  }
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `${publishStage}: vercel deployment url=${deploymentUrl}`)
  pushRunSummaryEvent("publishes", {
    kind: "vercel_production_deploy",
    publishStage,
    deploymentUrl,
  })

  const inspectCommand =
    `${VERCEL_CLI}${scopePrefix} inspect ${deploymentUrl} --logs --wait --timeout=10m`
  try {
    const inspectOutput = execSync(inspectCommand, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: childEnv,
      timeout: Math.max(commandTimeoutMs("publish"), 12 * 60 * 1000),
    })
    if (inspectOutput.trim()) console.log(inspectOutput.trimEnd())
  } catch (e) {
    const stdout = String(e?.stdout || "")
    const stderr = String(e?.stderr || "")
    const output = `${stdout}\n${stderr}`
    if (stdout.trim()) console.log(stdout.trimEnd())
    if (stderr.trim()) console.error(stderr.trimEnd())
    const ready = /status\s+.*Ready|Deployment completed/i.test(output)
    const cliUpgradeNoise = /Update available for Vercel CLI|Would you like to upgrade now|Upgrade failed|Failed to execute upgrade command|npm i -g vercel@latest/i.test(output)
    if (ready && cliUpgradeNoise) {
      const message =
        `${publishStage}: Vercel deployment reached Ready, but CLI self-update prompt failed; continuing as deploy success.`
      console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `warn: ${message}`)
      pushRunSummaryEvent("warnings", {
        kind: "vercel_cli_update_failed_after_ready",
        publishStage,
        deploymentUrl,
        message,
      })
      return
    }
    e.vercelDeploymentUrl = deploymentUrl
    e.vercelInspectCommand = inspectCommand
    throw e
  }
}

function isRecoverableProductionProxyInspectFailure(error) {
  if (!error?.vercelDeploymentUrl) return false
  const message = String(error?.message ?? "")
  const stdout = String(error?.stdout ?? "")
  const stderr = String(error?.stderr ?? "")
  const output = `${message}\n${stdout}\n${stderr}`
  return /fetch failed|Not able to load user|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network|temporar|一時的/i.test(output)
}

function warnProductionProxyDeployUnverified({ publishStage, error, elapsed }) {
  const deploymentUrl = String(error?.vercelDeploymentUrl || "").trim()
  const message =
    `${publishStage}: R2直確認はOK。Vercel本番デプロイURL取得後のinspect確認だけ失敗したため、日次処理は停止せず継続します。deploymentUrl=${deploymentUrl || "-"}`
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message} 所要=${elapsed}`)
  pushRunSummaryEvent("warnings", {
    kind: "production_proxy_deploy_unverified_after_r2_current",
    publishStage,
    deploymentUrl,
    elapsed,
    message,
    error: boundedMessage(error?.message ?? error),
  })
  setRunProgress(
    "production_proxy_deploy_unverified",
    `${publishStage}: R2は最新。本番プロキシ再デプロイ確認は失敗したが、品質確認済みのため継続。`,
    {
      finalState: "production_proxy_deploy_unverified",
      finalMessage: `${publishStage}: R2公開済み。本番プロキシ確認のみ未確定。`,
    },
  )
}

function warnProductionProxyVerifyUnverifiedAfterDeploy({ year, publishStage, scope, samplePlayerYahooId, samplePlayerNpbId, sampleDerivedCategories }) {
  const r2Current = runTry(
    `${publishStage}: Vercel再デプロイ後のR2直のみ再確認`,
    verifyCommandArgs({
      year,
      scope,
      noProduction: true,
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories,
    }),
  )
  if (!r2Current) return false

  const message =
    `${publishStage}: Vercel再デプロイ後の本番公開確認だけ失敗しましたが、R2直確認はOKのため日次処理は停止せず継続します。`
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message}`)
  pushRunSummaryEvent("warnings", {
    kind: "production_proxy_verify_unverified_after_deploy_r2_current",
    publishStage,
    message,
  })
  setRunProgress(
    "production_proxy_verify_unverified",
    `${publishStage}: R2は最新。本番確認のみ未確定だが、品質確認済みのため継続。`,
    {
      finalState: "production_proxy_verify_unverified",
      finalMessage: `${publishStage}: R2公開済み。本番確認のみ未確定。`,
    },
  )
  return true
}

function isScheduleCancelledForGame(year, gameId) {
  const seasonIndexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(seasonIndexPath)) return false
  const idx = JSON.parse(fs.readFileSync(seasonIndexPath, "utf8"))
  const byDate = idx?.byDate ?? {}
  for (const day of Object.keys(byDate)) {
    const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${day}.json`)
    if (!fs.existsSync(snapPath)) continue
    try {
      const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"))
      const games = Array.isArray(snap?.games) ? snap.games : []
      const hit = games.find((g) => String(g.gameId ?? "").trim() === gameId)
      const status = String(hit?.statusText ?? "").trim()
      if (/試合中止|ノーゲーム/.test(status)) return true
    } catch {
      // ignore
    }
  }
  return false
}

function runPhase2FetchBlock({ year, from, to, noStatsText, noScoreRaw, dryRun }) {
  if (!noStatsText) {
    run(
      "Phase2a 出場成績・テキスト速報 raw",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --from ${from} --to ${to}`,
      { dryRun },
    )
    const repairDate =
      from && to ? ` --from ${from} --to ${to}` : from ? ` --from ${from}` : to ? ` --to ${to}` : ""
    run(
      "Phase2a-repair 不完全な stats/text のみ再取得（--only-incomplete・日付範囲内）",
      `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${repairDate}`,
      { dryRun },
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      "Phase2a-repair (--only-incomplete) 実行済み（運用2: CSR 空テーブル対策）",
    )
    if (!noScoreRaw) {
      run(
        "Phase2a-b 一球速報 score?index= raw（全打席・テキストと同じインデックス・to まで）",
        `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --sleep 1.2 --from-date ${from} --to-date ${to}`,
        { dryRun },
      )
    } else {
      console.log(
        "\n[daily:npb-pipeline:v2] --no-score-raw: raw_sportsnavi_score をスキップ（Phase10 は既存キャッシュ/ネット取得に依存）\n",
      )
    }
  } else {
    console.log("\n[daily:npb-pipeline:v2] --no-stats-text: 出場成績・テキスト raw をスキップ（canonical が薄くなり得ます）\n")
  }
}

function runPhase2bCanonical({ year, from, to, forceCanonical, dryRun }) {
  const phase2bForce = forceCanonical ? " --force" : " --only-stale"
  const phase2bDate = from || to ? ` --from ${from} --to ${to}` : ""
  run(
    "Phase2b canonical 生成（raw 指紋不一致・thin のみ再生成。Phase10 一球ログは保持）",
    `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year}${phase2bDate}${phase2bForce}`,
    { dryRun },
  )
  run(
    "検証: canonical pitchingLines 列ずれガード",
    `node scripts/validate_canonical_pitching_lines_sanity.mjs --year ${year}${phase2bDate} --fail`,
    { dryRun },
  )
}

function scoreRawGateDateArgs(from, to) {
  if (from && to) return ` --from-date ${from} --to-date ${to}`
  if (from) return ` --from-date ${from}`
  if (to) return ` --to-date ${to}`
  return ""
}

function parseGateIncompleteDetails(combined) {
  const details = []
  for (const line of combined.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*(\d+):\s*(\S+)\s*$/)
    if (m) details.push({ gameId: m[1], reason: m[2] })
  }
  return details
}

function checkScoreRawGate({ year, from, to, gameIds }) {
  const dateArgs = scoreRawGateDateArgs(from, to)
  const gameIdsArg =
    Array.isArray(gameIds) && gameIds.length > 0 ? ` --game-ids ${gameIds.join(",")}` : ""
  const cmd =
    `python -u scripts/gate_score_raw_complete_for_pipeline.py --year ${year}${dateArgs}${gameIdsArg}` +
    " --fail --emit-incomplete-csv"
  try {
    const out = execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      env: childEnv,
      timeout: commandTimeoutMs("validate"),
    })
    if (out) process.stdout.write(out)
    return { ok: true }
  } catch (e) {
    const stdout = String(e.stdout || "")
    const stderr = String(e.stderr || "")
    if (stderr) process.stderr.write(stderr)
    if (stdout) process.stdout.write(stdout)
    const combined = `${stdout}\n${stderr}`
    const m = combined.match(/SCORE_RAW_GATE_INCOMPLETE_CSV=([^\r\n]+)/)
    const incompleteIds = m
      ? m[1].split(",").map((s) => s.trim()).filter(Boolean)
      : []
    const scriptError =
      /Traceback \(most recent call last\)|\b(Syntax|Type|Attribute|Name|Import)Error:/.test(combined)
    const gateNg = /\[score-raw-gate\] NG:/.test(combined)
    const incompleteDetails = parseGateIncompleteDetails(combined)
    const scoreRawRetryableIds = incompleteDetails
      .filter((d) => d.reason === "score_raw_incomplete")
      .map((d) => d.gameId)
    const statsTextRetryableIds = incompleteDetails
      .filter((d) => d.reason === "no_plate_appearances" || d.reason === "missing_text_raw")
      .map((d) => d.gameId)
    const asyncShellIds = incompleteDetails
      .filter((d) => d.reason === "async_shell_no_live_text")
      .map((d) => d.gameId)
    return {
      ok: false,
      incompleteIds,
      incompleteDetails,
      scoreRawRetryableIds,
      statsTextRetryableIds,
      asyncShellIds,
      scriptError,
      gateNg,
    }
  }
}

function runRenderedTextRecovery({ year, gameIds, dryRun }) {
  const gids = gameIds.join(",")
  console.warn(`\n[daily:npb-pipeline:v2] JS 空シェルの /text を描画後 HTML に差し替えます: ${gids}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `Playwright rendered text recovery gameIds=${gids}`)
  run(
    "Phase2a-repair rendered text（async shell 復旧）",
    `python scripts/refetch_sportsnavi_text_rendered_playwright.py --year ${year} --game-ids ${gids}`,
    { dryRun },
  )
}

function runPhase2StatsTextRepair({ year, from, to, gameIds, dryRun }) {
  const gids = gameIds.join(",")
  const dateScope =
    from && to ? ` from=${from} to=${to}` : from ? ` from=${from}` : to ? ` to=${to}` : ""
  console.warn(`\n[daily:npb-pipeline:v2] Phase2 stats/text を再取得します（no_plate_appearances / missing_text_raw）: ${gids}${dateScope}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `Phase2 stats/text 再取得 gameIds=${gids}${dateScope}`)
  run(
    "Phase2a-repair stats/text（未完了試合のみ）",
    `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete --game-ids ${gids}`,
    { dryRun },
  )
}

function runScoreRawGate({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, dryRun }) {
  if (dryRun || noScoreRaw || skipScoreRawGate || yahooForce) {
    if (skipScoreRawGate || yahooForce) {
      console.warn("\n[daily:npb-pipeline:v2] Phase4 前の score raw ゲートをスキップします（Phase4 がネット取得中心になり得ます）。\n")
    }
    return
  }

  const label = "ゲート: score raw 完了確認（未完了なら Phase4 前に停止）"
  const scoreRawRetryDisabled = process.env.TOPPAGE_SCORE_RAW_GATE_NO_RETRY === "1"
  let scoreRawRetryCount = 0
  let statsTextRetryCount = 0

  while (true) {
    lastStep = label
    const startedAt = Date.now()
    log(`→ 開始: ${label}${statsTextRetryCount > 0 || scoreRawRetryCount > 0 ? "（再確認）" : ""}`)
    const result = checkScoreRawGate({ year, from, to, gameIds })
    const elapsedLabel = formatMs(Date.now() - startedAt)

    if (result.ok) {
      log(`← 終了: ${label}（所要 ${elapsedLabel}）`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了: ${label} 所要=${elapsedLabel}`)
      return
    }

    if (result.scriptError) {
      log(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=1 — ゲートスクリプト異常`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗: ${label} 所要=${elapsedLabel} exit=1 reason=gate_script_error`)
      throw new Error("score raw gate script error")
    }

    const canRetryStatsText = statsTextRetryCount < 1 && result.statsTextRetryableIds.length > 0
    const canRetryScoreRaw =
      !scoreRawRetryDisabled && scoreRawRetryCount < 1 && result.scoreRawRetryableIds.length > 0

    if (!canRetryStatsText && !canRetryScoreRaw) {
      const incompleteLabel =
        result.incompleteDetails.length > 0
          ? result.incompleteDetails.map((d) => `${d.gameId}:${d.reason}`).join(",")
          : result.incompleteIds.join(",") || (result.gateNg ? "unknown" : "?")
      log(`← 失敗: ${label}（所要 ${elapsedLabel}） exit=1`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗: ${label} 所要=${elapsedLabel} exit=1 incomplete=${incompleteLabel}`)
      throw new Error("score raw gate failed")
    }

    if (result.asyncShellIds && result.asyncShellIds.length > 0) {
      runRenderedTextRecovery({ year, gameIds: result.asyncShellIds, dryRun })
      continue
    }

    if (canRetryStatsText) {
      runPhase2StatsTextRepair({ year, from, to, gameIds: result.statsTextRetryableIds, dryRun })
      statsTextRetryCount += 1
      continue
    }

    const gids = result.scoreRawRetryableIds.join(",")
    console.warn(`\n[daily:npb-pipeline:v2] score raw ゲート NG → 未完了試合のみ再取得して再ゲートします: ${gids}\n`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `score raw ゲート NG → 自動再取得 gameIds=${gids}`)
    const fromDate = from || to
    const toDate = to || from
    run(
      `score raw 自動再取得（ゲート NG・${result.scoreRawRetryableIds.length}試合）`,
      `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year}` +
        ` --from-date ${fromDate} --to-date ${toDate} --game-ids ${gids} --sleep 1.2`,
      { dryRun },
    )
    scoreRawRetryCount += 1
  }
}

function runStrictCanonicalValidation({ year, from, to, noStatsText, strictQuality, dryRun }) {
  if (dryRun || !strictQuality) {
    if (!strictQuality) {
      console.log("\n[daily:npb-pipeline:v2] --no-strict-quality: validate_phase2_canonical_nonempty をスキップします（空 canonical が残り得ます）。\n")
    }
    return
  }
  const validateCmd = `npx tsx scripts/validate_phase2_canonical_nonempty.ts --year ${year} --fail`
  const validateStartedAt = Date.now()
  const ok = runTry(
    "検証: canonical に打撃データが皆無の試合が残っていないこと（空だと個人打率が歪む）",
    validateCmd,
    { dryRun, timeoutKind: "validate" },
  )
  if (!ok) {
    console.warn("\n[daily:npb-pipeline:v2] 検証NG → 不足 raw の再取得と canonical 再生成を自動実行します（最大1回）。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `validate_phase2_canonical_nonempty NG → 自動リカバリ year=${year}`)
    const reportPath = path.join(root, "_data", "derived", `validate_phase2_canonical_nonempty_${year}.json`)
    try {
      if (fs.statSync(reportPath).mtimeMs + 1000 < validateStartedAt) {
        throw new Error("stale report")
      }
    } catch {
      throw new Error(`canonical nonempty validation failed but current report was not produced: ${reportPath}`)
    }
    const report = readJsonOrNull(reportPath)
    const badGameIdsRaw = Array.isArray(report?.bad)
      ? [...new Set(report.bad.map((item) => String(item?.gameId ?? "").trim()).filter(Boolean))]
      : []
    const badGameIds = nonCancelledGameIds(badGameIdsRaw)
    const ignoredCancelledGameIds = badGameIdsRaw.filter((id) => !badGameIds.includes(id))
    if (ignoredCancelledGameIds.length > 0) {
      console.warn(
        `[daily:npb-pipeline:v2] canonical 自動リカバリ対象から中止/ノーゲームを除外: ${ignoredCancelledGameIds.join(",")}`,
      )
      pushRunSummaryEvent("warnings", {
        kind: "canonical_nonempty_cancelled_games_ignored",
        gameIds: ignoredCancelledGameIds,
      })
    }
    if (badGameIds.length === 0) {
      console.warn(
        `[daily:npb-pipeline:v2] canonical nonempty NG は中止/ノーゲームのみだったため repair をスキップします: ${reportPath}`,
      )
      return
    }
    const gids = badGameIds.join(",")
    console.warn(`[daily:npb-pipeline:v2] canonical 自動リカバリ対象: ${gids}`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `canonical targeted recovery gameIds=${gids}`)
    if (!noStatsText) {
      run(
        `Phase2a-repair（自動リカバリ・${badGameIds.length}試合）stats/text 強制再取得`,
        `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --game-ids ${gids} --force`,
        { dryRun },
      )
    }
    run(
      `Phase2b canonical 再生成（自動リカバリ・${badGameIds.length}試合）`,
      `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year} --game-ids ${gids} --force`,
      { dryRun },
    )
    run(
      "実況テキストから resultSummaryJa 再補完（自動リカバリ後）",
      `npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts${gameIdsOrDateRangeTsxArgsArg({ year, gameIds: badGameIds })}`,
      { dryRun },
    )
    run(
      "検証: canonical に打撃データが皆無の試合が残っていないこと（自動リカバリ後・再実行）",
      validateCmd,
      { dryRun },
    )
  }
}

function runPrefetchStage({ year, from, to, noStatsText, noScoreRaw, forceCanonical, dryRun }) {
  run(
    "Phase0 日程スナップショット（当日分のみ）",
    `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${from} --to ${to} --merge`,
    { dryRun },
  )
  const gameIds = dryRun ? [] : targetGameIdsForArgs({ from, to, gameIds: [] })
  const phase1GameIdsArg = gameIds.length > 0 ? ` --game-ids ${gameIds.join(",")}` : ""
  run(
    "Phase1 試合ページ raw（トップ）",
    `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year}${phase1GameIdsArg}`,
    { dryRun },
  )
  runPhase2FetchBlock({ year, from, to, noStatsText, noScoreRaw, dryRun })
  runPhase2bCanonical({ year, from, to, forceCanonical, dryRun })
}

function readPhase4FailedGameIds(year, notBeforeMs, expectedTargetGameIds = []) {
  const reportPath = path.join(root, "_data", "scraped_games", "_meta", `phase4_last_run_${year}.json`)
  try {
    if (fs.statSync(reportPath).mtimeMs + 1000 < notBeforeMs) return []
  } catch {
    return []
  }
  const report = readJsonOrNull(reportPath)
  const expected = [...new Set(expectedTargetGameIds.map(String).filter(Boolean))].sort()
  const actual = Array.isArray(report?.targetGameIds)
    ? [...new Set(report.targetGameIds.map(String).filter(Boolean))].sort()
    : []
  if (expected.length > 0 && actual.join(",") !== expected.join(",")) return []
  return Array.isArray(report?.failedGameIds)
    ? nonCancelledGameIds(report.failedGameIds)
    : []
}

function runPhase4WithTargetedRetry({ year, targetArg, phase4Sleep, force, dryRun, label }) {
  const forceArg = force ? " --force" : ""
  const command = `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} ${targetArg} --sleep ${phase4Sleep || "1.2"}${forceArg}`
  const targetIdsMatch = targetArg.match(/--game-ids\s+([0-9,]+)/)
  const expectedTargetGameIds = targetIdsMatch
    ? targetIdsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : []
  if (dryRun) {
    run(label, command, { dryRun })
    return
  }
  const startedAt = Date.now()
  if (runTry(label, command, { dryRun })) return

  const failedGameIds = readPhase4FailedGameIds(year, startedAt, expectedTargetGameIds)
  if (failedGameIds.length === 0) {
    throw new Error("Phase4 failed but no current failedGameIds report was produced")
  }
  const gids = failedGameIds.join(",")
  console.warn(`\n[daily:npb-pipeline:v2] Phase4失敗 → 該当${failedGameIds.length}試合だけを1回再試行します: ${gids}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `Phase4 targeted retry gameIds=${gids}`)
  run(
    `Phase4: 失敗試合のみ再試行（${failedGameIds.length}試合）`,
    `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --game-ids ${gids} --sleep ${phase4Sleep || "1.2"}${forceArg}`,
    { dryRun },
  )
}

function readPitchCoverageRepairGameIds({ year, from, to }) {
  const command =
    `node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year ${year}` +
    ` --from-date ${from} --to-date ${to} --json`
  const stdout = execSync(command, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
    timeout: commandTimeoutMs("validate"),
  })
  const report = JSON.parse(stdout)
  const ids = [
    ...(Array.isArray(report?.gaps?.score_raw_but_no_canonical_event_game_ids)
      ? report.gaps.score_raw_but_no_canonical_event_game_ids
      : []),
    ...(Array.isArray(report?.gaps?.derived_not_merged_game_ids)
      ? report.gaps.derived_not_merged_game_ids
      : []),
  ]
  return nonCancelledGameIds(ids)
}

function runPitchCoverageValidationWithRepair({ year, from, to, phase4Sleep, dryRun }) {
  const validationCommand =
    `node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year ${year}` +
    ` --from-date ${from} --to-date ${to} --fail`
  const label = "検証: pitch-by-pitch coverage"
  if (runTry(label, validationCommand, { dryRun })) return
  if (dryRun) return

  const repairGameIds = readPitchCoverageRepairGameIds({ year, from, to })
  if (repairGameIds.length === 0) {
    throw new Error("pitch-by-pitch coverage failed but no repairable gameIds were found")
  }
  const gids = repairGameIds.join(",")
  console.warn(`\n[daily:npb-pipeline:v2] coverage NG → 該当${repairGameIds.length}試合のPhase4を1回再実行します: ${gids}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `pitch coverage targeted repair gameIds=${gids}`)
  runPhase4WithTargetedRetry({
    year,
    targetArg: `--game-ids ${gids}`,
    phase4Sleep,
    force: false,
    dryRun,
    label: `Phase4: coverage NG 試合のみ修復（${repairGameIds.length}試合）`,
  })
  run(
    "Phase4: coverage修復後の resultSummaryJa 再補完",
    `npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts${gameIdsOrDateRangeTsxArgsArg({ year, gameIds: repairGameIds })}`,
    { dryRun },
  )
  run("検証: pitch-by-pitch coverage（修復後・再実行）", validationCommand, { dryRun })
}

function runPhase4Stage({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, strictQuality, phase4Sleep, dryRun }) {
  const requestedTargetGameIds = Array.isArray(gameIds) ? gameIds.map(String).filter(Boolean) : []
  const targetGameIds = requestedTargetGameIds.length > 0 ? nonCancelledGameIds(requestedTargetGameIds) : []
  if (requestedTargetGameIds.length > 0 && targetGameIds.length === 0) {
    console.log("\n[daily:npb-pipeline:v2] Phase4 対象は中止/ノーゲームのみのためスキップします。\n")
    return
  }
  runScoreRawGate({
    year,
    from,
    to,
    gameIds: requestedTargetGameIds.length > 0 ? targetGameIds : gameIds,
    noScoreRaw,
    skipScoreRawGate,
    yahooForce,
    dryRun,
  })
  const phase4Force = yahooForce ? " --force" : ""
  const phase4Target =
    targetGameIds.length > 0
      ? `--game-ids ${targetGameIds.join(",")}`
      : `--from-date ${from} --to-date ${to}`
  runPhase4WithTargetedRetry({
    year,
    targetArg: phase4Target,
    phase4Sleep,
    force: Boolean(phase4Force),
    dryRun,
    label: targetGameIds.length > 0
      ? "Phase4: Yahoo 一球速報ログ復元 + canonical マージ（指定試合のみ）"
      : "Phase4: Yahoo 一球速報ログ復元 + canonical マージ",
  })
  run(
    "Phase4: 実況テキストから resultSummaryJa 再補完",
    `npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts${gameIdsOrDateRangeTsxArgsArg({ year, from, to, gameIds: targetGameIds })}`,
    { dryRun },
  )
  if (strictQuality) {
    runPitchCoverageValidationWithRepair({ year, from, to, phase4Sleep, dryRun })
  }
}

function runPhase19WithRetry({ dryRun }) {
  runTry("名簿: NPB 英字名更新（phase19 前）", "npm run roster:fetch-npb-en", { dryRun })
  run("NPB公式: 2026完投・完封を更新（phase19 前）", "npm run npb:official-cg:fetch:2026", {
    dryRun,
  })
  try {
    run("ランキング JSON: phase19 pitching rankings", "npm run phase19:build:pitching-rankings", { dryRun })
  } catch (e) {
    console.warn(
      "\n[daily:npb-pipeline:v2] phase19 失敗 → 名簿再取得後に1回だけ再試行します。\n",
    )
    pushRunSummaryEvent("retries", {
      kind: "phase19_rebuild_retry",
      message: "phase19 pitching rankings failed once and was retried after roster refresh.",
    })
    runTry("名簿: NPB 英字名再取得", "npm run roster:fetch-npb-en", { dryRun })
    run("ランキング JSON: phase19 pitching rankings（再試行）", "npm run phase19:build:pitching-rankings", { dryRun })
  }
}

function runPhase13ValidationWithRetry({
  dryRun,
  phase13BuildCommand = "npm run phase13:build:context",
  affectedYahooIds = [],
  strictPhase13Validate = false,
}) {
  const validationCommand =
    affectedYahooIds.length > 0
      ? `npm run validate:phase13-context-vs-phase11:fail -- --only-yahoo-ids ${affectedYahooIds.join(",")}`
      : "npm run validate:phase13-context-vs-phase11:fail"
  const ok = runTry(
    affectedYahooIds.length > 0
      ? `検証: phase13 対チーム vs Phase11（差分 ${affectedYahooIds.length}人）`
      : "検証: phase13 対チーム vs Phase11",
    validationCommand,
    { dryRun },
  )
  if (ok) return

  console.warn(
    "\n[daily:npb-pipeline:v2] phase13 検証NG → phase13 context を1回だけ再生成して再検証します。\n",
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    "validate_phase13_context_vs_phase11 NG → phase13 rebuild retry",
  )
  pushRunSummaryEvent("retries", {
    kind: "phase13_validation_retry",
    affectedYahooIdsCount: affectedYahooIds.length,
  })
  run("派生: phase13 context（検証NG後の再生成）", phase13BuildCommand, { dryRun })
  const retryOk = runTry(
    "検証: phase13 対チーム vs Phase11（再実行）",
    validationCommand,
    { dryRun },
  )
  if (retryOk) return

  const message =
    "phase13 対チーム vs Phase11 検証は再生成後もNGでした。ランキング/順位表/トップ表示とfull derived公開は継続し、個人ページ用 context 差分は後続調査対象としてログに残します。"
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message}`)
  pushRunSummaryEvent("warnings", {
    kind: "phase13_validation_failed_after_retry",
    affectedYahooIdsCount: affectedYahooIds.length,
    message,
  })
  if (strictPhase13Validate) {
    throw new Error(`${message} --strict-phase13-validate 指定のため停止します。`)
  }
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
}

function runVsHandValidationWithRetry({
  year,
  dryRun,
  phase15BuildCommand = "npm run phase15:build:batting-splits",
  affectedYahooIds = [],
  strictVsHandValidate = false,
}) {
  const validationCommand =
    affectedYahooIds.length > 0
      ? `npm run validate:vs-hand-vs-phase11 -- --only-yahoo-ids ${affectedYahooIds.join(",")}`
      : "npm run validate:vs-hand-vs-phase11"
  const validationLabel =
    affectedYahooIds.length > 0
      ? `検証: phase11 vs vs_hand P0（差分 ${affectedYahooIds.length}人）`
      : "検証: phase11 vs vs_hand P0"
  const ok = runTry(validationLabel, validationCommand, { dryRun })
  if (ok) return

  console.warn("\n[daily:npb-pipeline:v2] phase11 vs vs_hand 検証NG → Phase15を1回再生成して再検証します。\n")
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "validate vs_hand NG → phase15 rebuild retry")
  pushRunSummaryEvent("retries", {
    kind: "vs_hand_validation_retry",
    affectedYahooIdsCount: affectedYahooIds.length,
  })
  run("派生: phase15 batting splits（vs_hand検証NG後の再生成）", phase15BuildCommand, { dryRun })
  const retryOk = runTry(
    affectedYahooIds.length > 0
      ? `検証: phase11 vs vs_hand P0（差分 ${affectedYahooIds.length}人・再実行）`
      : "検証: phase11 vs vs_hand P0（再実行）",
    validationCommand,
    { dryRun },
  )
  if (retryOk) return

  const reportPath = writeVsHandFailureReport({ year, validationCommand, dryRun })
  const message =
    `phase11 vs vs_hand P0 検証は再生成後もNGでした。ランキング/順位表/トップ表示の公開は継続し、個人ページ用 splits の差分は後続調査対象としてログに残します。report=${reportPath}`
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message}`)
  pushRunSummaryEvent("warnings", {
    kind: "vs_hand_validation_failed_after_retry",
    affectedYahooIdsCount: affectedYahooIds.length,
    message,
    reportPath,
  })
  if (strictVsHandValidate) {
    throw new Error(`${message} --strict-vs-hand-validate 指定のため停止します。`)
  }
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
}

function repairStaleProductionProxyIfR2IsCurrent({
  year,
  dryRun,
  publishStage,
  autoDeployProduction,
  scope = "full",
  samplePlayerYahooId = "",
  samplePlayerNpbId = "",
  sampleDerivedCategories = [],
}) {
  const r2Current = runTry(
    `${publishStage}: R2直のみ再確認`,
    verifyCommandArgs({
      year,
      scope,
      noProduction: true,
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories,
    }),
    { dryRun },
  )
  if (!r2Current) return false

  if (!autoDeployProduction) {
    const allowProductionStale =
      String(process.env.TOPPAGE_ALLOW_PRODUCTION_STALE || "").trim() === "1"
    console.warn(
      `\n[daily:npb-pipeline:v2] ${publishStage}: R2は最新ですが本番 /data が古いままです。--auto-deploy-production 付きで本番プロキシを再デプロイしてください。\n`,
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `${publishStage}: R2 current + production stale; auto deploy disabled${allowProductionStale ? "; explicitly allowed" : ""}`,
    )
    pushRunSummaryEvent("warnings", {
      kind: "production_stale_only",
      publishStage,
      message: `${publishStage}: R2 is current but production is stale; auto deploy disabled${allowProductionStale ? "; explicitly allowed" : ""}`,
    })
    setRunProgress(
      allowProductionStale ? "production_stale_allowed" : "failed_production_stale",
      allowProductionStale
        ? `${publishStage}: R2は最新。本番 /data は古いが TOPPAGE_ALLOW_PRODUCTION_STALE=1 のため継続。`
        : `${publishStage}: R2は最新だが本番 /data が古いため、最終完了扱いにしない。`,
      {
        finalState: allowProductionStale ? "production_stale_allowed" : "failed_production_stale",
        finalMessage: allowProductionStale
          ? "R2公開は完了。本番 /data は古いまま許可済み。"
          : "--auto-deploy-production 付きで本番プロキシを再デプロイしてください。",
      },
    )
    if (allowProductionStale) return true
    throw new Error(
      `${publishStage}: R2は最新ですが本番 /data が古いままです。--auto-deploy-production 付きで再実行してください。`,
    )
  }

  console.warn(
      `\n[daily:npb-pipeline:v2] ${publishStage}: R2は最新ですが本番 /data が古いため、Vercel本番を自動デプロイします。\n`,
    )
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `${publishStage}: R2 current + production stale → Vercel production deploy`)
    pushRunSummaryEvent("publishes", {
      kind: "production_stale_triggered_vercel_deploy",
      publishStage,
    })
    if (dryRun) {
      run(`${publishStage}: Vercel本番プロキシ再デプロイ`, "npm run deploy:vercel:prod", { dryRun })
    } else {
      lastStep = `${publishStage}: Vercel本番プロキシ再デプロイ`
      const startedAt = Date.now()
      log(`→ 開始: ${lastStep}`)
      setRunProgress(
        "deploying_production_proxy",
        `${publishStage}: R2は最新。本番プロキシの再デプロイ中。`,
        { finalState: "not_complete", finalMessage: `${publishStage}: Vercel再デプロイ中。` },
      )
      try {
        deployProductionViaVercelAndWait({ publishStage, dryRun })
      } catch (e) {
        const elapsed = formatMs(Date.now() - startedAt)
        if (isRecoverableProductionProxyInspectFailure(e)) {
          log(`← 警告: ${lastStep}（所要 ${elapsed}）inspect確認失敗だがR2直確認OKのため継続`)
          warnProductionProxyDeployUnverified({ publishStage, error: e, elapsed })
          return true
        }
        log(`← 失敗: ${lastStep}（所要 ${elapsed}） exit=1`)
        setRunProgress(
          "failed_production_proxy_deploy",
          `${publishStage}: R2は最新だが、本番プロキシ再デプロイに失敗。`,
          { finalState: "failed_production_proxy_deploy", finalMessage: `${publishStage}: Vercel再デプロイ失敗。` },
        )
        appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗: ${lastStep} 所要=${elapsed} exit=1`)
        throw e
      }
      const elapsed = formatMs(Date.now() - startedAt)
      log(`← 終了: ${lastStep}（所要 ${elapsed}）`)
      setRunProgress(
        "production_proxy_deployed",
        `${publishStage}: 本番プロキシ再デプロイ完了。公開確認待ち。`,
        { finalState: "not_complete", finalMessage: `${publishStage}: Vercel再デプロイ完了、確認待ち。` },
      )
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了: ${lastStep} 所要=${elapsed}`)
    }
    const productionVerifiedAfterDeploy = runTry(
      `${publishStage}: Vercel再デプロイ後の公開確認`,
      verifyCommandArgs({
        year,
        scope,
        samplePlayerYahooId,
        samplePlayerNpbId,
        sampleDerivedCategories,
      }),
      { dryRun },
    )
    if (!productionVerifiedAfterDeploy && !warnProductionProxyVerifyUnverifiedAfterDeploy({
      year,
      publishStage,
      scope,
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories,
    })) {
      throw new Error(`${publishStage}: Vercel再デプロイ後の公開確認に失敗しました`)
    }
  return true
}

function verifyCommandArgs({ year, scope = "full", noProduction = false, samplePlayerYahooId = "", samplePlayerNpbId = "", sampleDerivedCategories = [] }) {
  const parts = [`node scripts/verify_display_publish_after_upload.mjs --year ${year} --scope ${scope}`]
  if (noProduction) parts.push("--no-production")
  if (samplePlayerYahooId) parts.push(`--sample-player-yahoo-id ${samplePlayerYahooId}`)
  if (samplePlayerNpbId) parts.push(`--sample-player-npb-id ${samplePlayerNpbId}`)
  if (Array.isArray(sampleDerivedCategories) && sampleDerivedCategories.length > 0) {
    parts.push(`--sample-derived-categories ${sampleDerivedCategories.join(",")}`)
  }
  return parts.join(" ")
}

function playerIdsCliArg(playerIds) {
  const ids = [...new Set((playerIds ?? []).map(String).map((s) => s.trim()).filter(Boolean))].sort()
  return ids.length > 0 ? ` --player-ids ${ids.join(",")}` : ""
}

function affectedDisplayPlayerIdsForArgs(args) {
  return [
    ...affectedYahooBatterIdsForArgs(args),
    ...collectNpbPitcherIdsForGames(targetGameIdsForArgs(args)),
  ]
}

function runFastDisplayDependencyPublish({ year, from, to, dryRun, label, playerIds = [] }) {
  run(label, `node scripts/display_publish_fast_2026.mjs --year ${year}${playerIdsCliArg(playerIds)}${dateRangeNodeArgsArg({ from, to })}`, {
    dryRun: dryRun ? true : false,
  })
}

function runFastDisplayPublishAndVerify({ year, from, to, dryRun, autoDeployProduction, samplePlayerYahooId = "", samplePlayerNpbId = "", playerIds = [] }) {
  const fastDerivedCategories = [
    "player_season_batting",
    "player_season_batting_period",
    "player_season_batting_count",
    "player_season_pitching_poc",
  ]
  if (dryRun) {
    console.log("\n[daily:npb-pipeline:v2] --dry-run: fast publish / verify は実行せず、工程判定だけ確認します。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "dry-run: simulate fast publish / verify")
  }
  run(
    "R2公開(1回目): rankings + standings + top leaders + player season totals",
    `node scripts/display_publish_fast_2026.mjs --year ${year}${playerIdsCliArg(playerIds)}${dateRangeNodeArgsArg({ from, to })}`,
    { dryRun },
  )

  const verified = runTry(
    "公開確認(1回目): 主要表示 + 週次 + 選手成績",
    verifyCommandArgs({
      year,
      scope: "fast",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fastDerivedCategories,
    }),
    { dryRun },
  )
  if (verified) return

  if (
    repairStaleProductionProxyIfR2IsCurrent({
      year,
      dryRun,
      publishStage: "公開1回目",
      autoDeployProduction,
      scope: "fast",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fastDerivedCategories,
    })
  ) return

  console.warn(
    "\n[daily:npb-pipeline:v2] 公開確認NG → VercelデプロイではなくR2アップロードを1回だけ再実行します。\n",
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `verify_display_publish_after_upload NG → R2 fast publish retry year=${year}`,
  )
  pushRunSummaryEvent("retries", {
    kind: "fast_publish_retry",
    year,
  })
  run(
    "R2公開(1回目・再試行): rankings + standings + top leaders + player season totals",
    `node scripts/display_publish_fast_2026.mjs --year ${year}${playerIdsCliArg(playerIds)}${dateRangeNodeArgsArg({ from, to })}`,
    { dryRun: false },
  )
  const retryVerified = runTry(
    "公開確認(1回目・再試行後): 主要表示 + 週次 + 選手成績",
    verifyCommandArgs({
      year,
      scope: "fast",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fastDerivedCategories,
    }),
    { dryRun },
  )
  if (retryVerified) return
  if (
    repairStaleProductionProxyIfR2IsCurrent({
      year,
      dryRun,
      publishStage: "公開1回目・再試行後",
      autoDeployProduction,
      scope: "fast",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fastDerivedCategories,
    })
  ) return
  throw new Error("fast publish verification failed after retry")
}

function runFullDisplayPublishCommands({ year, from, to, fullOnly, dryRun, retry = false, includeFastDependencies = false, playerIds = [] }) {
  const suffix = retry ? "・再試行" : ""
  if (includeFastDependencies) {
    runFastDisplayDependencyPublish({
      year,
      from,
      to,
      dryRun: false,
      label: `R2公開(2回目${suffix}): fast display dependencies`,
      playerIds,
    })
  }
  run(
    `R2公開(2回目${suffix}): full display delta`,
    "npm run display:r2:upload:full-display-delta:2026",
    { dryRun },
  )
  run(
    fullOnly ? `R2公開(2回目${suffix}): full derived` : `R2公開(2回目${suffix}): daily full derived`,
    fullOnly
      ? "npm run display:r2:upload:derived:2026"
      : `node scripts/display_r2_upload_derived.mjs --year ${year} --exclude player_profile,player_season_batting,player_season_batting_period,player_season_batting_count${playerIdsCliArg(playerIds)}`,
    { dryRun },
  )
}

function runFullDisplayPublishAndVerify({ year, from, to, fullOnly, dryRun, autoDeployProduction, samplePlayerYahooId = "", samplePlayerNpbId = "", playerIds = [] }) {
  const fullDerivedCategories = [
    "player_season_batting",
    "player_season_batting_context",
    "player_season_batting_splits",
    "player_season_batting_count",
    "player_season_batting_period",
    "player_season_pitching_poc",
  ]
  if (dryRun) {
    console.log("\n[daily:npb-pipeline:v2] --dry-run: full publish / verify はスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full publish in dry-run")
    return
  }
  runFullDisplayPublishCommands({ year, from, to, fullOnly, dryRun, playerIds })

  const verified = runTry(
    "公開確認(2回目): 主要表示 + 週次 + 選手成績",
    verifyCommandArgs({
      year,
      scope: "full",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fullDerivedCategories,
    }),
    { dryRun },
  )
  if (verified) return

  if (
    repairStaleProductionProxyIfR2IsCurrent({
      year,
      dryRun,
      publishStage: "公開2回目",
      autoDeployProduction,
      scope: "full",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fullDerivedCategories,
    })
  ) return

  console.warn(
    "\n[daily:npb-pipeline:v2] 2回目の公開確認NG → R2アップロードを1回だけ再実行します。\n",
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `verify_display_publish_after_upload NG → R2 full publish retry year=${year}`,
  )
  pushRunSummaryEvent("retries", {
    kind: "full_publish_retry",
    year,
  })
  runFullDisplayPublishCommands({ year, from, to, fullOnly, dryRun, retry: true, includeFastDependencies: true, playerIds })
  const retryVerified = runTry(
    "公開確認(2回目・再試行後): 主要表示 + 週次 + 選手成績",
    verifyCommandArgs({
      year,
      scope: "full",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fullDerivedCategories,
    }),
    { dryRun },
  )
  if (retryVerified) return
  if (
    repairStaleProductionProxyIfR2IsCurrent({
      year,
      dryRun,
      publishStage: "公開2回目・再試行後",
      autoDeployProduction,
      scope: "full",
      samplePlayerYahooId,
      samplePlayerNpbId,
      sampleDerivedCategories: fullDerivedCategories,
    })
  ) return
  throw new Error("full publish verification failed after retry")
}

function runUnknownPlayerResolutionAfterSecondPublish({ year, from, to, gameIds, dryRun }) {
  const ids = Array.isArray(gameIds) ? gameIds.map(String).filter(Boolean) : []
  const gameIdsArg = ids.length > 0 ? ` --game-ids ${ids.join(",")}` : ""
  run(
    "未知選手手続き: 2回目公開後の検出・分類",
    `npx tsx scripts/resolve_unknown_players_after_publish.ts --year ${year} --from ${from} --to ${to}${gameIdsArg}`,
    { dryRun },
  )
}

function runNpbOfficialCorrectionObservationAfterSecondPublish({ year, dryRun }) {
  const ok = runTry(
    "NPB公式記録訂正: 2回目公開後の公式サイト観察",
    `npm run npb-official-corrections:observe -- --year ${year}`,
    { dryRun, timeoutKind: "network" },
  )
  if (ok) return
  const message =
    "NPB公式サイトの訂正告知観察に失敗。公開後の警告として扱うが、次回実行前に npb-official-corrections:observe を確認する。"
  console.warn(`\n[daily:npb-pipeline:v2] ${message}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `warning: ${message}`)
  pushRunSummaryEvent("warnings", {
    kind: "npb_official_correction_observation_failed",
    year,
    message,
  })
}

function parseTriggerDetail(detail) {
  const raw = String(detail || "").trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function isPastWindowFinalizable(args) {
  const from = String(args?.from || "").trim()
  const to = String(args?.to || "").trim()
  if (!from || !to) return false
  const today = todayJstYmd()
  return from < today && to < today
}

function ensurePublishWindowHasFinalSchedule(args) {
  if (args.dryRun || args.noPublish || args.prefetchOnly) return
  const triggerReason = String(args.triggerReason || "").trim()
  if (triggerReason === "deadline_force") return
  const triggerDetail = parseTriggerDetail(args.triggerDetail)
  if (triggerDetail?.allGamesFinished === true) return

  const today = todayJstYmd()
  const blocked = []
  for (const dateJst of eachDateYmd(args.from, args.to)) {
    if (dateJst < today) continue
    if (scheduleAllFinishedForDate(dateJst)) continue
    blocked.push({
      dateJst,
      unfinished: unfinishedScheduleLabelsForDate(dateJst),
    })
  }
  if (blocked.length === 0) return

  const detail = blocked
    .map((item) => `${item.dateJst}[${item.unfinished.length ? item.unfinished.join(",") : "schedule_missing_or_not_final"}]`)
    .join(" ")
  const message =
    `publish blocked because schedule is not final for current/future date(s): ${detail}. ` +
    `監視スクリプトで全試合終了を待つか、公開しない場合は --no-publish を指定してください。`
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `publish_final_schedule_gate NG ${detail}`)
  pushRunSummaryEvent("warnings", {
    kind: "publish_final_schedule_gate",
    message,
    blocked,
  })
  throw new Error(message)
}

function classifyPipelineCompletion(args) {
  const mode = deriveMode(args)
  if (args.dryRun) {
    return {
      status: "completed-dry-run",
      logLabel: "dry-run完了",
      consoleLabel: "dry-run完了。",
    }
  }
  if (mode === "prefetch-only") {
    return {
      status: "completed-prefetch",
      logLabel: "事前取得完了",
      consoleLabel: "事前取得完了。",
    }
  }
  if (mode === "fast-only") {
    return {
      status: "completed-intermediate",
      logLabel: "途中更新完了",
      consoleLabel: "途中更新完了。",
    }
  }

  const triggerReason = String(args.triggerReason || "").trim()
  const triggerDetail = parseTriggerDetail(args.triggerDetail)
  const allGamesFinished = triggerDetail?.allGamesFinished === true
  const pastWindowFinalizable = isPastWindowFinalizable(args)

  if (triggerReason === "deadline_force") {
    return {
      status: "completed-deadline-force",
      logLabel: "期限到達のため暫定完了",
      consoleLabel: "期限到達のため暫定完了。",
    }
  }
  if (allGamesFinished || pastWindowFinalizable) {
    return {
      status: "completed-final",
      logLabel: "当日最終完了",
      consoleLabel: "当日最終完了。",
    }
  }
  return {
    status: "completed-intermediate",
    logLabel: "途中更新完了",
    consoleLabel: "途中更新完了。",
  }
}

function runFastStage({
  year,
  from,
  to,
  gameIds,
  noPublish,
  build,
  skipVsHandValidate,
  strictVsHandValidate,
  dryRun,
  useAffectedPhase11 = true,
  skipPhase15 = true,
  autoDeployProduction = false,
}) {
  const affectedYahooIds = affectedYahooBatterIdsForArgs({ from, to, gameIds })
  const affectedArg = onlyYahooIdsArg(affectedYahooIds)
  const derivedAffectedArg = derivedYahooArgsArg(affectedYahooIds, { from, to })
  const affectedNpbPitcherIds = collectNpbPitcherIdsForGames(targetGameIdsForArgs({ from, to, gameIds }))
  const affectedNpbPitcherArg = onlyNpbIdsArg(affectedNpbPitcherIds)
  const affectedDisplayPlayerIds = affectedDisplayPlayerIdsForArgs({ from, to, gameIds })
  if (affectedYahooIds.length > 0) {
    console.log(
      `\n[daily:npb-pipeline:v2] 差分対象打者: ${affectedYahooIds.length}人（${from}〜${to}）\n`,
    )
  }
  run("NPB公式記録訂正: 公式告知の反映", "npm run npb-official-corrections:apply", { dryRun })
  run("公式記録訂正: PA/出場成績ズレ修復（保険）", "npm run official-corrections:repair-from-pa", { dryRun })
  run("派生: enrich:text-play-headlines", `npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts${gameIdsOrDateRangeTsxArgsArg({ year, from, to })}`, { dryRun })
  run("派生: phase:pitcher-poc1", `npm run phase:pitcher-poc1${affectedNpbPitcherArg}`, { dryRun })
  run(
    useAffectedPhase11 && affectedYahooIds.length > 0
      ? `派生: phase11 batting（差分 ${affectedYahooIds.length}人）`
      : "派生: phase11 batting",
    `npm run phase11:build:batting${useAffectedPhase11 ? derivedAffectedArg : ""}`,
    { dryRun },
  )
  run("検証: 出場成績 打数列 vs 末尾スロット", "npm run validate:appearance-slots-vs-line-ab:fail", { dryRun })
  run("検証: appearance_slots の CS と代走のみ SB", "npm run verify:cs-runner-events-appearance-slots", { dryRun })
  run("派生: phase17 period", `npm run phase17:build:period${derivedAffectedArg}`, { dryRun })
  ensureBattingPeriodFresh({ year, from, to, gameIds, dryRun })
  run("派生: phase7 pitcher period", `npm run phase7:build:pitcher-period${affectedNpbPitcherArg}`, { dryRun })
  run("ランキング JSON: phase12 batting rankings", "npm run phase12:build:rankings", { dryRun })
  runPhase19WithRetry({ dryRun })
  run("ランキング JSON: phase28 weekly rankings", `npm run phase28:build:weekly-rankings${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("ランキング JSON: phase29 team standings", phase29Command({ from, to, includeToday: true }), { dryRun })
  run("検証: phase29 team standings", "npm run validate:team-standings:2026:fail", { dryRun })
  run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
  run("トップ表示: 今週リーダー", `npm run top-weekly-leaders:build:2026${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("検証: canonical batting completeness", `npm run validate:canonical-batting-completeness${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  if (skipPhase15) {
    console.log("\n[daily:npb-pipeline:v2] fast stage: phase15 batting splits をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: fast phase15 batting splits")
  } else {
    run(
      affectedYahooIds.length > 0
        ? `派生: phase15 batting splits（差分 ${affectedYahooIds.length}人）`
        : "派生: phase15 batting splits",
      `npm run phase15:build:batting-splits${derivedAffectedArg}`,
      { dryRun },
    )
  }
  if (skipVsHandValidate) {
    console.log("\n[daily:npb-pipeline:v2] --skip-vs-hand-validate: phase11 vs vs_hand P0 検証をスキップします。\n")
  } else if (skipPhase15) {
    console.log("\n[daily:npb-pipeline:v2] fast stage: phase15生成前のため vs_hand 検証をfull stageへ延期します。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "defer: fast vs_hand validation until full stage")
  } else {
    runVsHandValidationWithRetry({
      year,
      dryRun,
      phase15BuildCommand: `npm run phase15:build:batting-splits${derivedAffectedArg}`,
      affectedYahooIds,
      strictVsHandValidate,
    })
  }

  if (!noPublish) {
    runFastDisplayPublishAndVerify({
      year,
      from,
      to,
      dryRun,
      autoDeployProduction,
      samplePlayerYahooId: affectedYahooIds[0] || "",
      samplePlayerNpbId: affectedNpbPitcherIds[0] || "",
      playerIds: affectedDisplayPlayerIds,
    })
  }
  if (build) {
    run("本番ビルド（1回目後）", "npm run build:clean", { dryRun })
  }
}

function runFinalPrecomputedPublishStage({
  year,
  from,
  to,
  gameIds,
  noPublish,
  build,
  skipVsHandValidate,
  strictVsHandValidate,
  dryRun,
  autoDeployProduction = false,
}) {
  const affectedYahooIds = affectedYahooBatterIdsForArgs({ from, to, gameIds })
  const affectedArg = onlyYahooIdsArg(affectedYahooIds)
  const derivedAffectedArg = derivedYahooArgsArg(affectedYahooIds, { from, to })
  const affectedNpbPitcherIds = collectNpbPitcherIdsForGames(targetGameIdsForArgs({ from, to, gameIds }))
  const affectedNpbPitcherArg = onlyNpbIdsArg(affectedNpbPitcherIds)
  const affectedDisplayPlayerIds = affectedDisplayPlayerIdsForArgs({ from, to, gameIds })
  console.log("\n[daily:npb-pipeline:v2] 先行済み派生を使い、ランキング/順位表/トップリーダーを1回目公開向けに最終再計算します。\n")
  run("NPB公式記録訂正: 公式告知の反映", "npm run npb-official-corrections:apply", { dryRun })
  run("公式記録訂正: PA/出場成績ズレ修復（保険）", "npm run official-corrections:repair-from-pa", { dryRun })
  run("派生: enrich:text-play-headlines", `npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts${gameIdsOrDateRangeTsxArgsArg({ year, from, to })}`, { dryRun })
  ensureFastPublishInputsFresh({ year, from, to, gameIds, dryRun })
  ensureBattingPeriodFresh({
    year,
    from,
    to,
    gameIds,
    dryRun,
    rebuildPitchingPeriod: true,
  })
  run("ランキング JSON: phase12 batting rankings", "npm run phase12:build:rankings", { dryRun })
  runPhase19WithRetry({ dryRun })
  run("ランキング JSON: phase28 weekly rankings", `npm run phase28:build:weekly-rankings${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run(
    "ランキング JSON: phase29 team standings",
    phase29Command({ from, to, includeToday: true, requireTargetGameCacheNonEmpty: true }),
    { dryRun },
  )
  run("検証: phase29 team standings", "npm run validate:team-standings:2026:fail", { dryRun })
  run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
  run("トップ表示: 今週リーダー", `npm run top-weekly-leaders:build:2026${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("検証: canonical batting completeness", `npm run validate:canonical-batting-completeness${dateRangeNpmArgsArg({ from, to })}`, { dryRun })

  if (!noPublish) {
    runFastDisplayPublishAndVerify({
      year,
      from,
      to,
      dryRun,
      autoDeployProduction,
      samplePlayerYahooId: affectedYahooIds[0] || "",
      samplePlayerNpbId: affectedNpbPitcherIds[0] || "",
      playerIds: affectedDisplayPlayerIds,
    })
    if (affectedYahooIds.length > 0) {
      run(
        `派生: phase11 batting（1回目公開後・差分整備 ${affectedYahooIds.length}人）`,
        `npm run phase11:build:batting${derivedAffectedArg}`,
        { dryRun },
      )
    } else if (!from && !to && (!Array.isArray(gameIds) || gameIds.length === 0)) {
      run("派生: phase11 batting（1回目公開後・全件整備）", "npm run phase11:build:batting", { dryRun })
    } else {
      console.log("\n[daily:npb-pipeline:v2] 1回目公開後 phase11 整備: 差分対象なしのためスキップします。\n")
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: post-fast phase11 no affected batters")
    }
    ensureBattingSplitsFresh({ year, from, to, gameIds, dryRun })
    if (skipVsHandValidate) {
      console.log("\n[daily:npb-pipeline:v2] --skip-vs-hand-validate: phase11 vs vs_hand P0 検証をスキップします。\n")
    } else {
      runVsHandValidationWithRetry({
        year,
        dryRun,
        phase15BuildCommand: `npm run phase15:build:batting-splits${derivedAffectedArg}`,
        affectedYahooIds,
        strictVsHandValidate,
      })
    }
    runScheduleAheadBestEffort({ year, dryRun })
    runTopProbablesInputRefresh({ year, from, to, dryRun, advanceAfterCompletedWindow: true })
    run(
      "トップ表示: 予想投手",
      topProbablesBuildCommand({ year, from, to, advanceAfterCompletedWindow: true }),
      { dryRun },
    )
    runFullDisplayPublishAndVerify({
      year,
      from,
      to,
      fullOnly: false,
      dryRun,
      autoDeployProduction,
      samplePlayerYahooId: affectedYahooIds[0] || "",
      samplePlayerNpbId: affectedNpbPitcherIds[0] || "",
      playerIds: affectedDisplayPlayerIds,
    })
    runNpbOfficialCorrectionObservationAfterSecondPublish({ year, dryRun })
    runUnknownPlayerResolutionAfterSecondPublish({ year, from, to, gameIds, dryRun })
  }
  if (build) {
    run("本番ビルド（finalize-precomputed 後）", "npm run build:clean", { dryRun })
  }
}

function runScheduleAheadBestEffort({ year, dryRun }) {
  const label = "Phase0 未来日程（今日+14日・三連戦検出用）"
  const command = `npx tsx scripts/phase0_fetch_schedule_ahead.ts --year ${year}`
  const ok = runTry(label, command, { dryRun })
  if (ok) return
  const message =
    "Phase0 未来日程の更新に失敗しましたが、当日分の full 派生・公開は継続します。必要なら phase0:fetch:schedule-ahead を単独再実行してください。"
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `warn: schedule ahead failed; continue full stage year=${year}`)
  pushRunSummaryEvent("warnings", {
    kind: "schedule_ahead_failed_continue",
    message,
    command,
  })
}

function runTopProbablesInputRefresh({ year, from, to, dryRun, advanceAfterCompletedWindow = false }) {
  const asOfDate = topProbablesAsOfDateForWindow({ from, to, advanceAfterCompletedWindow })
  const tomorrowDate = addDaysYmdJst(asOfDate, 1)
  run(
    "Sporting News ローテーション取得（予想投手用）",
    `npx tsx scripts/phase35_fetch_sportingnews_rotation.ts --year ${year}`,
    { dryRun, timeoutKind: "network" },
  )
  run(
    "Yahoo! 当日予告先発取得（予想投手用）",
    `npx tsx scripts/fetch_yahoo_schedule_probables.ts --year ${year} --date ${asOfDate}`,
    { dryRun, timeoutKind: "network" },
  )
  run(
    "Yahoo! 翌日予告先発取得（予想投手用）",
    `npx tsx scripts/fetch_yahoo_schedule_probables.ts --year ${year} --date ${tomorrowDate}`,
    { dryRun, timeoutKind: "network" },
  )
}

function runFullStage({
  year,
  from,
  to,
  gameIds,
  noPublish,
  build,
  dryRun,
  fullOnly,
  strictFullDerivedValidate,
  strictPhase13Validate,
  strictVsHandValidate,
  skipPhase15 = false,
  skipRepeatedTopBuilds = false,
  validatePhase13AffectedOnly = true,
  allowFutureScheduleRefresh = true,
  autoDeployProduction = false,
}) {
  const affectedYahooIds = affectedYahooBatterIdsForArgs({ from, to, gameIds })
  const affectedArg = onlyYahooIdsArg(affectedYahooIds)
  const derivedAffectedArg = derivedYahooArgsArg(affectedYahooIds, { from, to })
  const affectedNpbPitcherIds = collectNpbPitcherIdsForGames(targetGameIdsForArgs({ from, to, gameIds }))
  const affectedNpbPitcherArg = onlyNpbIdsArg(affectedNpbPitcherIds)
  const affectedDisplayPlayerIds = affectedDisplayPlayerIdsForArgs({ from, to, gameIds })
  const phase13BuildCommand = `npm run phase13:build:context${affectedArg}`
  const phase15BuildCommand = `npm run phase15:build:batting-splits${derivedAffectedArg}`
  if (affectedYahooIds.length > 0) {
    console.log(
      `\n[daily:npb-pipeline:v2] full差分対象打者: ${affectedYahooIds.length}人（${from}〜${to}）\n`,
    )
  }
  run("NPB公式記録訂正: 公式告知の反映", "npm run npb-official-corrections:apply", { dryRun })
  run("公式記録訂正: PA/出場成績ズレ修復（保険）", "npm run official-corrections:repair-from-pa", { dryRun })
  if (allowFutureScheduleRefresh) {
    runScheduleAheadBestEffort({ year, dryRun })
  } else {
    console.log("\n[daily:npb-pipeline:v2] 1回目公開前扱いのため、未来日程・予想投手入力の更新をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: future schedule refresh before first publish")
  }
  run("派生: phase:pitcher-poc1", `npm run phase:pitcher-poc1${affectedNpbPitcherArg}`, { dryRun })
  run("派生: phase7 pitcher period", `npm run phase7:build:pitcher-period${affectedNpbPitcherArg}`, { dryRun })
  run("派生: phase6 pitcher-catcher splits", `npm run phase6:build:pitcher-catcher-splits${affectedNpbPitcherArg}`, { dryRun })
  run("派生: phase13 context", phase13BuildCommand, { dryRun })
  runPhase13ValidationWithRetry({
    dryRun,
    phase13BuildCommand,
    affectedYahooIds: validatePhase13AffectedOnly ? affectedYahooIds : [],
    strictPhase13Validate,
  })
  run("派生: phase14 pitch", `npm run phase14:build:pitch${affectedArg}`, { dryRun })
  if (skipPhase15) {
    console.log("\n[daily:npb-pipeline:v2] full stage: fast stage 済みのため phase15 batting splits をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full phase15 batting splits (already built in fast stage)")
  } else {
    run("派生: phase15 batting splits", phase15BuildCommand, { dryRun })
  }
  run("派生: phase16 batting count", `npm run phase16:build:batting-count${derivedAffectedArg}`, { dryRun })
  run("派生: pitcher season pitch types", `npm run phase25:build:pitcher-season-pitch-types${affectedNpbPitcherArg}`, { dryRun })
  run("派生: phase22 catcher appearances", `npm run phase22:build:catcher-appearances${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("派生: phase23 catcher-pitcher splits", `npm run phase23:build:catcher-pitcher-splits${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("派生: phase24 catcher defense basic", `npm run phase24:build:catcher-defense-basic${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  runWarnOnlyValidation(
    "検証: phase24 実守備捕手帰属",
    "npm run validate:catcher-defense-active:2026",
    {
      dryRun,
      strict: strictFullDerivedValidate,
      note: "捕手タブ派生の警告として扱い、full derived公開は継続します。",
    },
  )
  run("派生: phase25 catcher starting summary", `npm run phase25:build:catcher-starting-summary${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("派生: phase26 catcher pa round pitch types", `npm run phase26:build:catcher-pa-round-pitch-types${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  run("派生: phase20 pitcher zones", `npm run phase20:build:pitcher-zones -- --from ${from} --to ${to}`, { dryRun })
  run("派生: phase30 player matchup", `npm run phase30:build:player-matchup${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  runWarnOnlyValidation(
    "検証: phase31 対戦成績 vs Phase11",
    "npm run validate:phase31-matchup-vs-phase11:fail",
    {
      dryRun,
      strict: strictFullDerivedValidate,
      note: "対戦成績派生の警告として扱い、full derived公開は継続します。",
    },
  )
  if (allowFutureScheduleRefresh) {
    runTopProbablesInputRefresh({ year, from, to, dryRun })
    run("トップ表示: 予想投手", topProbablesBuildCommand({ year, from, to }), { dryRun })
  }
  run("派生: phase33 batter vs team count pitch types", `npm run phase33:build:batter-vs-team-count-pitch-types${affectedArg}`, { dryRun })
  runWarnOnlyValidation(
    "検証: phase34 球団別配球 vs Phase14",
    "npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail",
    {
      dryRun,
      strict: strictFullDerivedValidate,
      note: "球団別配球派生の警告として扱い、full derived公開は継続します。",
    },
  )
  run("派生: build yahoo npb full index", "npm run build:yahoo-npb-full-index", { dryRun })
  if (skipRepeatedTopBuilds) {
    console.log("\n[daily:npb-pipeline:v2] full stage: fast stage 済みのため top leaders 再生成をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full repeated top leaders builds")
  } else {
    run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
    run("トップ表示: 今週リーダー", `npm run top-weekly-leaders:build:2026${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  }
  run("検証: canonical batting completeness", `npm run validate:canonical-batting-completeness${dateRangeNpmArgsArg({ from, to })}`, { dryRun })
  runVsHandValidationWithRetry({
    year,
    dryRun,
    phase15BuildCommand,
    affectedYahooIds,
    strictVsHandValidate,
  })

  if (!noPublish) {
    runFullDisplayPublishAndVerify({
      year,
      from,
      to,
      fullOnly,
      dryRun,
      autoDeployProduction,
      samplePlayerYahooId: affectedYahooIds[0] || "",
      samplePlayerNpbId: affectedNpbPitcherIds[0] || "",
      playerIds: affectedDisplayPlayerIds,
    })
    runNpbOfficialCorrectionObservationAfterSecondPublish({ year, dryRun })
    runUnknownPlayerResolutionAfterSecondPublish({ year, from, to, gameIds, dryRun })
  }
  if (build) {
    run("本番ビルド（2回目後）", "npm run build:clean", { dryRun })
  }
}

function main() {
  const args = applyResumeFromCheckpoint(parseArgs(process.argv))
  currentArgs = args
  initRunSummary(args)
  const lockResult = acquirePipelineRunLock(args)
  if (!lockResult.acquired) {
    const existing = lockResult.existing || {}
    const message =
      `同じ日付範囲の pipeline が既に実行中です。` +
      ` from=${existing.from || args.from} to=${existing.to || args.to}` +
      ` mode=${existing.mode || "-"}` +
      ` runId=${existing.runId || "-"}` +
      ` startedAtJst=${existing.startedAtJst || "-"}`
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `duplicate_run_blocked ${message}`)
    runSummary.status = "blocked-duplicate-run"
    runSummary.failedAtJst = formatJstTimestamp()
    runSummary.lastStep = lastStep || "-"
    pushRunSummaryEvent("warnings", {
      kind: "duplicate_run_blocked",
      message,
      existing,
    })
    writeRunSummary()
    throw new Error(message)
  }
  if (lockResult.staleReason) {
    const message =
      `stale pipeline lock を置き換えて続行します。 reason=${lockResult.staleReason}` +
      ` previousRunId=${lockResult.staleExisting?.runId || "-"}` +
      ` previousStartedAtJst=${lockResult.staleExisting?.startedAtJst || "-"}`
    console.warn(`\n[daily:npb-pipeline:v2] ${message}\n`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `stale_run_lock_replaced ${message}`)
    pushRunSummaryEvent("warnings", {
      kind: "stale_run_lock_replaced",
      message,
      existing: lockResult.staleExisting,
    })
    writeRunSummary()
  }
  configureResume(args)
  const modeCount = [args.prefetchOnly, args.fastOnly, args.fullOnly, args.finalizePrecomputed].filter(Boolean).length
  if (modeCount > 1) {
    console.error("[daily:npb-pipeline:v2] --prefetch-only / --fast-only / --full-only / --finalize-precomputed は同時指定できません")
    process.exit(1)
  }

  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `開始 year=${args.year} from=${args.from} to=${args.to} mode=${args.prefetchOnly ? "prefetch-only" : args.fastOnly ? "fast-only" : args.fullOnly ? "full-only" : args.finalizePrecomputed ? "finalize-precomputed" : "all"} trigger=${args.triggerReason || "manual"}${args.triggerDetail ? ` detail=${args.triggerDetail}` : ""}`,
  )
  if (args.triggerReason || args.triggerDetail) {
    console.log(
      `\n[daily:npb-pipeline:v2] 起動理由: ${args.triggerReason || "manual"}${args.triggerDetail ? ` / ${args.triggerDetail}` : ""}\n`,
    )
    pushRunSummaryEvent("notes", {
      kind: "trigger_reason",
      reason: args.triggerReason || "manual",
      detail: args.triggerDetail || "",
    })
  }
  ensurePublishWindowHasFinalSchedule(args)

  if (args.prefetchOnly) {
    runPrefetchStage(args)
  } else if (args.fastOnly) {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
    ensurePhase4ConsistencyGate(args)
    runStrictCanonicalValidation(args)
    runFastStage(args)
  } else if (args.fullOnly) {
    ensurePhase4ConsistencyGate(args)
    runFullStage({
      ...args,
      allowFutureScheduleRefresh: !args.noPublish,
    })
  } else if (args.finalizePrecomputed) {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
    ensurePhase4ConsistencyGate(args)
    runStrictCanonicalValidation(args)
    runFinalPrecomputedPublishStage(args)
  } else {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
    ensurePhase4ConsistencyGate(args)
    runStrictCanonicalValidation(args)
    runFastStage({
      ...args,
      noPublish: args.noPublish || args.skipFastPublish,
      skipPhase15: true,
    })
    runFullStage({
      ...args,
      skipPhase15: false,
      skipRepeatedTopBuilds: true,
      validatePhase13AffectedOnly: true,
      allowFutureScheduleRefresh: !(args.noPublish || args.skipFastPublish),
    })
  }

  if ((resumeState.token || resumeState.stepId) && !resumeState.released) {
    throw new Error(`resume target did not match any step: token=${resumeState.token || "-"} stepId=${resumeState.stepId || "-"}`)
  }

  const completion = classifyPipelineCompletion(args)
  if (completion.status === "completed-final") {
    assertFinalPublishCompletedBeforeFinalStatus(args)
  }
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `${completion.logLabel} exit=0 lastStep=${lastStep || "-"} runId=${currentRunId}`,
  )
  runSummary.status = completion.status
  runSummary.completedAtJst = formatJstTimestamp()
  runSummary.lastStep = lastStep || "-"
  runSummary.completion = {
    ...completion,
    runId: currentRunId,
  }
  if (completion.status === "completed-final") {
    runSummary.progressState = "completed_final"
    runSummary.progressMessage = "当日最終完了。2回目公開と本番 /data を含む公開確認まで完了した状態として扱う。"
    runSummary.publishProgress = {
      ...(runSummary.publishProgress ?? {}),
      finalState: "complete",
      finalMessage: "当日最終公開完了。球場別・予想投手を含む詳細派生と本番 /data 反映も確認済み。",
    }
  } else if (completion.status === "completed-intermediate") {
    runSummary.progressState = "completed_intermediate"
    runSummary.progressMessage = "途中更新完了。1回目公開までの可能性があるため、球場別を含む最終公開完了とは判定しない。"
    runSummary.publishProgress = {
      ...(runSummary.publishProgress ?? {}),
      finalState: "intermediate_only",
      finalMessage: "途中公開完了。2回目公開完了の証拠ではない。",
    }
  } else if (completion.status === "completed-prefetch") {
    runSummary.progressState = "completed_prefetch_only"
    runSummary.progressMessage = "事前取得のみ完了。公開完了とは判定しない。"
    runSummary.publishProgress = {
      ...(runSummary.publishProgress ?? {}),
      finalState: "not_published",
      finalMessage: "prefetch-only のため公開なし。",
    }
  } else if (completion.status === "completed-deadline-force") {
    runSummary.progressState = "completed_deadline_force"
    runSummary.progressMessage = "期限到達の暫定完了。最終公開完了かは publishProgress と公開確認結果を見る。"
    runSummary.publishProgress = {
      ...(runSummary.publishProgress ?? {}),
      finalState: runSummary.publishProgress?.finalState ?? "deadline_force",
      finalMessage: runSummary.publishProgress?.finalMessage ?? "期限到達の暫定完了。",
    }
  } else if (completion.status === "completed-dry-run") {
    runSummary.progressState = "completed_dry_run"
    runSummary.progressMessage = "dry-run 完了。実データ公開は行っていない。"
    runSummary.publishProgress = {
      ...(runSummary.publishProgress ?? {}),
      finalState: "not_published",
      finalMessage: "dry-run のため公開なし。",
    }
  }
  writeRunSummary()
  writePipelineCheckpoint(completion.status, lastStep || "-", "", {
    stepId: lastStepId || inferStepId(lastStep || "-", ""),
    resumeMode: resumeState.mode,
    resumeToken: resumeState.token,
    resumeStepId: resumeState.stepId,
  })
  writePipelineRunLock(args, {
    schemaVersion: "pipeline-run-v2-lock-1",
    state: completion.status,
    runId: currentRunId,
    pid: process.pid,
    year: args.year,
    from: args.from,
    to: args.to,
    mode: deriveMode(args),
    startedAtJst: runSummary.startedAtJst,
    completedAtJst: formatJstTimestamp(),
  })
  console.log(`\n[daily:npb-pipeline:v2] ${completion.consoleLabel}\n`)
}

try {
  main()
} catch (e) {
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `異常終了 exit=1 lastStep=${lastStep || "-"} message=${String(e?.message ?? e)}`,
  )
  if (runSummary) {
    runSummary.status = "failed"
    runSummary.failedAtJst = formatJstTimestamp()
    runSummary.lastStep = lastStep || "-"
    const topLevelMessage = String(e?.message ?? e)
    const alreadyRecordedFailure = Array.isArray(runSummary.stepFailures)
      ? runSummary.stepFailures.some((failure) => {
          if (topLevelMessage.includes("completed-final blocked") && failure.stepId === "final-publish-completion-gate") return true
          if (lastStepId && failure.stepId === lastStepId && failure.severity === "fatal") return true
          return failure.message === boundedMessage(topLevelMessage)
        })
      : false
    let topLevelFailure = null
    if (!alreadyRecordedFailure) {
      topLevelFailure = recordPipelineStepFailure({
        label: lastStep || "pipeline main",
        command: "internal:top-level-catch",
        stepId: lastStepId || "pipeline-main",
        elapsed: "0:00",
        error: e,
        exitCode: typeof e?.status === "number" ? e.status : 1,
        timedOut: Boolean(e?.signal) || /timed out/i.test(topLevelMessage),
      })
    } else {
      topLevelFailure = Array.isArray(runSummary.stepFailures) ? runSummary.stepFailures[runSummary.stepFailures.length - 1] : null
    }
    if (!runSummary.progressState || !String(runSummary.progressState).startsWith("failed")) {
      runSummary.progressState = "failed"
      runSummary.progressMessage =
        `異常終了。lastStep=${lastStep || "-"}。公開完了判定は publishProgress.finalState を確認する。`
      runSummary.publishProgress = {
        ...(runSummary.publishProgress ?? {}),
        finalState: runSummary.publishProgress?.finalState ?? "failed_unknown_publish_state",
        finalMessage:
          runSummary.publishProgress?.finalMessage ??
          "異常終了。公開工程の到達状況を completedSteps と publishProgress で確認する。",
      }
    }
    pushRunSummaryEvent("warnings", {
      kind: "pipeline_failed",
      message: topLevelMessage,
      lastStep: lastStep || "-",
      lastStepId: lastStepId || "-",
      failureKind: topLevelFailure?.failureKind,
      stepKind: topLevelFailure?.stepKind,
    })
    writeRunSummary()
  }
  if (currentArgs) {
    writePipelineRunLock(currentArgs, {
      schemaVersion: "pipeline-run-v2-lock-1",
      state: "failed",
      runId: currentRunId,
      pid: process.pid,
      year: currentArgs.year,
      from: currentArgs.from,
      to: currentArgs.to,
      mode: deriveMode(currentArgs),
      startedAtJst: runSummary?.startedAtJst || formatJstTimestamp(),
      failedAtJst: formatJstTimestamp(),
      lastStep: lastStep || "-",
      message: String(e?.message ?? e),
    })
  }
  console.error("[daily:npb-pipeline:v2] failed:", e?.message || e)
  process.exit(1)
}
