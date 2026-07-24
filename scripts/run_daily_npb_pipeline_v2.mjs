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
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const childEnv = {
  ...process.env,
  PYTHONUNBUFFERED: "1",
  TOPPAGE_PLATE_RESULT_SOURCE: process.env.TOPPAGE_PLATE_RESULT_SOURCE ?? "appearance_only",
  TOPPAGE_BATTING_SEASON_AGG: process.env.TOPPAGE_BATTING_SEASON_AGG ?? "appearance_slots",
  TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD:
    process.env.TOPPAGE_STRICT_PHASE2_CANONICAL_REBUILD ?? "1",
}
const VERCEL_CLI = process.env.TOPPAGE_VERCEL_CLI || (process.platform === "win32" ? "vercel.cmd" : "vercel")

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
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
    resumeFrom: "",
    resumeAfter: "",
    dryRun: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) out.year = String(argv[++i]).trim()
    else if (a === "--from" && argv[i + 1]) out.from = String(argv[++i]).trim()
    else if (a === "--to" && argv[i + 1]) out.to = String(argv[++i]).trim()
    else if (a === "--game-ids" && argv[i + 1]) {
      out.gameIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
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
    else if (a === "--phase4-sleep" && argv[i + 1]) out.phase4Sleep = String(argv[++i]).trim()
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

function gameIdsForDate(dateJst) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
  const snap = readJsonOrNull(snapPath)
  if (Array.isArray(snap?.gameIds)) return snap.gameIds.map(String).filter(Boolean)
  const games = Array.isArray(snap?.games) ? snap.games : []
  return games.map((g) => String(g?.gameId ?? "").trim()).filter(Boolean)
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

function affectedYahooBatterIdsForArgs(args) {
  const gameIds = targetGameIdsForArgs(args)
  return collectYahooBatterIdsForGames(gameIds)
}

function onlyYahooIdsArg(ids) {
  return ids.length > 0 ? ` -- --only-yahoo-ids ${ids.join(",")}` : ""
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

  run("派生: phase17 period（鮮度NGのため再生成）", "npm run phase17:build:period", { dryRun })
  if (rebuildPitchingPeriod) {
    run("派生: phase7 pitcher period（phase17再生成に合わせて再生成）", "npm run phase7:build:pitcher-period", {
      dryRun,
    })
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

function collectFinishedRawFreshnessFailures({ from, to, gameIds, noStatsText, noScoreRaw }) {
  const stale = []
  const kinds = []
  if (!noStatsText) kinds.push("stats", "text")
  if (!noScoreRaw) kinds.push("score")
  const gameIdsFilter = Array.isArray(gameIds) && gameIds.length > 0 ? new Set(gameIds) : null
  for (const dateJst of eachDateYmd(from, to)) {
    const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${dateJst}.json`)
    const snap = readJsonOrNull(snapPath)
    const scheduleFetchedAtMs = parseIsoMs(snap?.fetchedAt)
    const games = Array.isArray(snap?.games) ? snap.games : []
    if (scheduleFetchedAtMs <= 0 || games.length === 0) continue
    for (const game of games) {
      const gameId = String(game?.gameId ?? "").trim()
      const status = String(game?.statusText ?? "").trim()
      if (gameIdsFilter && !gameIdsFilter.has(gameId)) continue
      if (!gameId || !/試合終了/.test(status)) continue
      const staleKinds = kinds.filter((kind) => rawMetaFetchedAtMs(kind, gameId) < scheduleFetchedAtMs)
      if (staleKinds.length > 0) stale.push({ dateJst, gameId, staleKinds })
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
let resumeState = {
  mode: "",
  token: "",
  released: true,
}

function log(msg) {
  console.log(`[daily:npb-pipeline:v2] [${nowIsoLocal()}] #${++stepNo} ${msg}`)
}

function pipelineCheckpointPath() {
  return path.join(root, "_data", "scraped_games", "_meta", "pipeline_checkpoint_v2.json")
}

function writePipelineCheckpoint(status, label, command = "", extra = {}) {
  const checkpoint = {
    status,
    label,
    command,
    lastStep,
    stepNo,
    updatedAt: new Date().toISOString(),
    args: currentArgs
      ? {
          year: currentArgs.year,
          from: currentArgs.from,
          to: currentArgs.to,
          mode: currentArgs.prefetchOnly
            ? "prefetch-only"
            : currentArgs.fastOnly
              ? "fast-only"
              : currentArgs.fullOnly
                ? "full-only"
                : currentArgs.finalizePrecomputed
                  ? "finalize-precomputed"
                  : "all",
          dryRun: Boolean(currentArgs.dryRun),
          noPublish: Boolean(currentArgs.noPublish),
        }
      : null,
    ...extra,
  }
  const p = pipelineCheckpointPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(checkpoint, null, 2), "utf8")
}

function normalizeResumeText(value) {
  return String(value ?? "").trim().toLowerCase()
}

function configureResume(args) {
  const resumeFrom = String(args.resumeFrom ?? "").trim()
  const resumeAfter = String(args.resumeAfter ?? "").trim()
  if (resumeFrom && resumeAfter) {
    throw new Error("--resume-from と --resume-after は同時指定できません")
  }
  const token = resumeFrom || resumeAfter
  resumeState = {
    mode: resumeFrom ? "from" : resumeAfter ? "after" : "",
    token: normalizeResumeText(token),
    released: !token,
  }
  if (token) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `resume ${resumeState.mode}: token=${token}`)
    console.log(`\n[daily:npb-pipeline:v2] resume ${resumeState.mode}: "${token}" に一致する工程までスキップします。\n`)
  }
}

function stepMatchesResumeToken(label, command) {
  if (!resumeState.token) return false
  const haystack = normalizeResumeText(`${label}\n${command}`)
  return haystack.includes(resumeState.token)
}

function shouldSkipForResume(label, command) {
  if (resumeState.released) return false
  const matched = stepMatchesResumeToken(label, command)
  if (!matched) {
    log(`← スキップ: ${label}（resume-${resumeState.mode} 待機中）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `resume skip: ${label}`)
    writePipelineCheckpoint("skipped-resume", label, command, {
      resumeMode: resumeState.mode,
      resumeToken: resumeState.token,
    })
    return true
  }
  resumeState.released = true
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `resume hit: ${label}`)
  if (resumeState.mode === "after") {
    log(`← スキップ: ${label}（resume-after 一致工程）`)
    writePipelineCheckpoint("skipped-resume-hit", label, command, {
      resumeMode: resumeState.mode,
      resumeToken: resumeState.token,
    })
    return true
  }
  console.log(`\n[daily:npb-pipeline:v2] resume-from 一致: ${label} から再開します。\n`)
  return false
}

function run(label, command, opts = {}) {
  lastStep = label
  if (shouldSkipForResume(label, command)) return
  const startedAt = Date.now()
  log(`→ 開始: ${label}`)
  writePipelineCheckpoint("running", label, command)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run: ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    writePipelineCheckpoint("skipped-dry-run", label, command)
    return
  }
  try {
    execSync(command, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: childEnv,
      timeout: opts.timeoutMs || commandTimeoutMs(opts.timeoutKind || "default"),
    })
  } catch (e) {
    const elapsed = formatMs(Date.now() - startedAt)
    const code = e && typeof e.status === "number" ? e.status : 1
    const timedOut = Boolean(e?.signal) || /timed out/i.test(String(e?.message ?? ""))
    log(`← 失敗: ${label}（所要 ${elapsed}） exit=${code}${timedOut ? " timeout" : ""}`)
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `失敗: ${label} 所要=${elapsed} exit=${code}${timedOut ? " timeout=1" : ""}`,
    )
    writePipelineCheckpoint("failed", label, command, {
      elapsed,
      exitCode: code,
      timedOut,
      resumeFrom: label,
      resumeAfterPrevious: true,
    })
    throw e
  }
  const elapsed = formatMs(Date.now() - startedAt)
  log(`← 終了: ${label}（所要 ${elapsed}）`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了: ${label} 所要=${elapsed}`)
  writePipelineCheckpoint("completed", label, command, { elapsed })
}

function runTry(label, command, opts = {}) {
  lastStep = label
  if (shouldSkipForResume(label, command)) return true
  const startedAt = Date.now()
  log(`→ 開始: ${label}（失敗しても続行可）`)
  writePipelineCheckpoint("running-try", label, command)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run(try): ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    writePipelineCheckpoint("skipped-dry-run-try", label, command)
    return true
  }
  try {
    execSync(command, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: childEnv,
      timeout: opts.timeoutMs || commandTimeoutMs(opts.timeoutKind || "default"),
    })
    const elapsed = formatMs(Date.now() - startedAt)
    log(`← 終了: ${label}（所要 ${elapsed}）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了(try): ${label} 所要=${elapsed}`)
    writePipelineCheckpoint("completed-try", label, command, { elapsed })
    return true
  } catch (e) {
    const elapsed = formatMs(Date.now() - startedAt)
    const timedOut = Boolean(e?.signal) || /timed out/i.test(String(e?.message ?? ""))
    log(`← 失敗: ${label}（所要 ${elapsed}）${timedOut ? " timeout" : ""}`)
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `失敗(try): ${label} 所要=${elapsed}${timedOut ? " timeout=1" : ""}`,
    )
    writePipelineCheckpoint("failed-try", label, command, {
      elapsed,
      timedOut,
      resumeFrom: label,
      warningOnly: true,
    })
    return false
  }
}

function runWarnOnlyValidation(label, command, { dryRun, strict = false, note = "" } = {}) {
  if (runTry(label, command, { dryRun })) return
  const message = `${label} がNGでした。${note || "公開は継続し、差分は後続調査対象としてログに残します。"}`
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `WARN: ${message}`)
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

  const inspectCommand =
    `${VERCEL_CLI}${scopePrefix} inspect ${deploymentUrl} --logs --wait --timeout=10m`
  execSync(inspectCommand, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: childEnv,
    timeout: Math.max(commandTimeoutMs("publish"), 12 * 60 * 1000),
  })
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
    const badGameIds = Array.isArray(report?.bad)
      ? [...new Set(report.bad.map((item) => String(item?.gameId ?? "").trim()).filter(Boolean))]
      : []
    if (badGameIds.length === 0) {
      throw new Error(`canonical nonempty validation failed but no repairable gameIds were found in ${reportPath}`)
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
      "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
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
    ? [...new Set(report.failedGameIds.map(String).map((id) => id.trim()).filter(Boolean))]
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
  return [...new Set(ids.map(String).map((id) => id.trim()).filter(Boolean))]
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
    "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
    { dryRun },
  )
  run("検証: pitch-by-pitch coverage（修復後・再実行）", validationCommand, { dryRun })
}

function runPhase4Stage({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, strictQuality, phase4Sleep, dryRun }) {
  runScoreRawGate({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, dryRun })
  const phase4Force = yahooForce ? " --force" : ""
  const targetGameIds = Array.isArray(gameIds) ? gameIds.filter(Boolean) : []
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
    "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
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
  if (strictVsHandValidate) {
    throw new Error(`${message} --strict-vs-hand-validate 指定のため停止します。`)
  }
  console.warn(`\n[daily:npb-pipeline:v2] WARN: ${message}\n`)
}

function repairStaleProductionProxyIfR2IsCurrent({ year, dryRun, publishStage, autoDeployProduction }) {
  if (!autoDeployProduction) {
    console.warn(
      `\n[daily:npb-pipeline:v2] ${publishStage}: R2直が最新でも、本番 deploy は自動実行しません。必要なら --auto-deploy-production を付けて再実行してください。\n`,
    )
    appendPipelineBulkLog(
      root,
      "daily:npb-pipeline:v2",
      `${publishStage}: production stale but auto deploy disabled`,
    )
    return false
  }
  const r2Current = runTry(
    `${publishStage}: R2直のみ再確認`,
    `node scripts/verify_display_publish_after_upload.mjs --year ${year} --no-production`,
    { dryRun },
  )
  if (!r2Current) return false

  console.warn(
      `\n[daily:npb-pipeline:v2] ${publishStage}: R2は最新ですが本番 /data が古いため、Vercel本番を自動デプロイします。\n`,
    )
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `${publishStage}: R2 current + production stale → Vercel production deploy`)
    if (dryRun) {
      run(`${publishStage}: Vercel本番プロキシ再デプロイ`, "npm run deploy:vercel:prod", { dryRun })
    } else {
      lastStep = `${publishStage}: Vercel本番プロキシ再デプロイ`
      const startedAt = Date.now()
      log(`→ 開始: ${lastStep}`)
      try {
        deployProductionViaVercelAndWait({ publishStage, dryRun })
      } catch (e) {
        const elapsed = formatMs(Date.now() - startedAt)
        log(`← 失敗: ${lastStep}（所要 ${elapsed}） exit=1`)
        appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗: ${lastStep} 所要=${elapsed} exit=1`)
        throw e
      }
      const elapsed = formatMs(Date.now() - startedAt)
      log(`← 終了: ${lastStep}（所要 ${elapsed}）`)
      appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了: ${lastStep} 所要=${elapsed}`)
    }
    run(
      `${publishStage}: Vercel再デプロイ後の公開確認`,
      `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
  return true
}

function runFastDisplayPublishAndVerify({ year, dryRun, autoDeployProduction }) {
  if (dryRun) {
    console.log("\n[daily:npb-pipeline:v2] --dry-run: fast publish / verify はスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: fast publish in dry-run")
    return
  }
  run(
    "R2公開(1回目): rankings + standings + top leaders + player season totals",
    `node scripts/display_publish_fast_2026.mjs --year ${year}`,
    { dryRun: false },
  )

  const verified = runTry(
    "公開確認(1回目): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
  if (verified) return

  if (repairStaleProductionProxyIfR2IsCurrent({ year, dryRun, publishStage: "公開1回目", autoDeployProduction })) return

  console.warn(
    "\n[daily:npb-pipeline:v2] 公開確認NG → VercelデプロイではなくR2アップロードを1回だけ再実行します。\n",
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `verify_display_publish_after_upload NG → R2 fast publish retry year=${year}`,
  )
  run(
    "R2公開(1回目・再試行): rankings + standings + top leaders + player season totals",
    `node scripts/display_publish_fast_2026.mjs --year ${year}`,
    { dryRun: false },
  )
  run(
    "公開確認(1回目・再試行後): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
}

function runFullDisplayPublishCommands({ fullOnly, dryRun, retry = false }) {
  const suffix = retry ? "・再試行" : ""
  run(
    `R2公開(2回目${suffix}): full display delta`,
    "npm run display:r2:upload:full-display-delta:2026",
    { dryRun },
  )
  run(
    fullOnly ? `R2公開(2回目${suffix}): full derived` : `R2公開(2回目${suffix}): daily full derived`,
    fullOnly ? "npm run display:r2:upload:derived:2026" : "npm run display:r2:upload:derived:2026:daily-full",
    { dryRun },
  )
}

function runFullDisplayPublishAndVerify({ year, fullOnly, dryRun, autoDeployProduction }) {
  if (dryRun) {
    console.log("\n[daily:npb-pipeline:v2] --dry-run: full publish / verify はスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full publish in dry-run")
    return
  }
  runFullDisplayPublishCommands({ fullOnly, dryRun })

  const verified = runTry(
    "公開確認(2回目): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
  if (verified) return

  if (repairStaleProductionProxyIfR2IsCurrent({ year, dryRun, publishStage: "公開2回目", autoDeployProduction })) return

  console.warn(
    "\n[daily:npb-pipeline:v2] 2回目の公開確認NG → R2アップロードを1回だけ再実行します。\n",
  )
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `verify_display_publish_after_upload NG → R2 full publish retry year=${year}`,
  )
  runFullDisplayPublishCommands({ fullOnly, dryRun, retry: true })
  run(
    "公開確認(2回目・再試行後): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
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
  skipPhase15 = false,
  autoDeployProduction = false,
}) {
  const affectedYahooIds = affectedYahooBatterIdsForArgs({ from, to, gameIds })
  const affectedArg = onlyYahooIdsArg(affectedYahooIds)
  if (affectedYahooIds.length > 0) {
    console.log(
      `\n[daily:npb-pipeline:v2] 差分対象打者: ${affectedYahooIds.length}人（${from}〜${to}）\n`,
    )
  }
  run("派生: enrich:text-play-headlines", "npm run enrich:text-play-headlines", { dryRun })
  run("派生: phase:pitcher-poc1", "npm run phase:pitcher-poc1", { dryRun })
  run(
    useAffectedPhase11 && affectedYahooIds.length > 0
      ? `派生: phase11 batting（差分 ${affectedYahooIds.length}人）`
      : "派生: phase11 batting",
    `npm run phase11:build:batting${useAffectedPhase11 ? affectedArg : ""}`,
    { dryRun },
  )
  run("検証: 出場成績 打数列 vs 末尾スロット", "npm run validate:appearance-slots-vs-line-ab:fail", { dryRun })
  run("検証: appearance_slots の CS と代走のみ SB", "npm run verify:cs-runner-events-appearance-slots", { dryRun })
  run("派生: phase17 period", "npm run phase17:build:period", { dryRun })
  ensureBattingPeriodFresh({ year, from, to, gameIds, dryRun })
  run("派生: phase7 pitcher period", "npm run phase7:build:pitcher-period", { dryRun })
  run("ランキング JSON: phase12 batting rankings", "npm run phase12:build:rankings", { dryRun })
  runPhase19WithRetry({ dryRun })
  run("ランキング JSON: phase28 weekly rankings", "npm run phase28:build:weekly-rankings", { dryRun })
  run("ランキング JSON: phase29 team standings", "npm run phase29:build:standings", { dryRun })
  run("検証: phase29 team standings", "npm run validate:team-standings:2026:fail", { dryRun })
  run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
  run("トップ表示: 今週リーダー", "npm run top-weekly-leaders:build:2026", { dryRun })
  run("検証: canonical batting completeness", "npm run validate:canonical-batting-completeness", { dryRun })
  if (skipPhase15) {
    console.log("\n[daily:npb-pipeline:v2] fast stage: phase15 batting splits をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: fast phase15 batting splits")
  } else {
    run(
      affectedYahooIds.length > 0
        ? `派生: phase15 batting splits（差分 ${affectedYahooIds.length}人）`
        : "派生: phase15 batting splits",
      `npm run phase15:build:batting-splits${affectedArg}`,
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
      phase15BuildCommand: `npm run phase15:build:batting-splits${affectedArg}`,
      affectedYahooIds,
      strictVsHandValidate,
    })
  }

  if (!noPublish) {
    runFastDisplayPublishAndVerify({ year, dryRun, autoDeployProduction })
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
  console.log("\n[daily:npb-pipeline:v2] 先行済み派生を使い、ランキング/順位表/トップ表示だけ最終再計算します。\n")
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
  run("ランキング JSON: phase28 weekly rankings", "npm run phase28:build:weekly-rankings", { dryRun })
  run("ランキング JSON: phase29 team standings", "npm run phase29:build:standings", { dryRun })
  run("検証: phase29 team standings", "npm run validate:team-standings:2026:fail", { dryRun })
  run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
  run("トップ表示: 今週リーダー", "npm run top-weekly-leaders:build:2026", { dryRun })
  run("検証: canonical batting completeness", "npm run validate:canonical-batting-completeness", { dryRun })
  if (skipVsHandValidate) {
    console.log("\n[daily:npb-pipeline:v2] --skip-vs-hand-validate: phase11 vs vs_hand P0 検証をスキップします。\n")
  } else {
    runVsHandValidationWithRetry({
      year,
      dryRun,
      phase15BuildCommand: `npm run phase15:build:batting-splits${affectedArg}`,
      affectedYahooIds,
      strictVsHandValidate,
    })
  }

  if (!noPublish) {
    runFastDisplayPublishAndVerify({ year, dryRun, autoDeployProduction })
  }
  if (build) {
    run("本番ビルド（finalize-precomputed 後）", "npm run build:clean", { dryRun })
  }
}

function runTopProbablesInputRefresh({ year, dryRun }) {
  const asOfDate = todayJstYmd()
  const tomorrowDate = addDaysYmd(asOfDate, 1)
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
  validatePhase13AffectedOnly = false,
  autoDeployProduction = false,
}) {
  const affectedYahooIds = affectedYahooBatterIdsForArgs({ from, to, gameIds })
  const affectedArg = onlyYahooIdsArg(affectedYahooIds)
  const phase13BuildCommand = `npm run phase13:build:context${affectedArg}`
  const phase15BuildCommand = `npm run phase15:build:batting-splits${affectedArg}`
  if (affectedYahooIds.length > 0) {
    console.log(
      `\n[daily:npb-pipeline:v2] full差分対象打者: ${affectedYahooIds.length}人（${from}〜${to}）\n`,
    )
  }
  run("Phase0 未来日程（今日+14日・三連戦検出用）", `npx tsx scripts/phase0_fetch_schedule_ahead.ts --year ${year}`, {
    dryRun,
  })
  run("派生: phase6 pitcher-catcher splits", "npm run phase6:build:pitcher-catcher-splits", { dryRun })
  run("派生: phase13 context", phase13BuildCommand, { dryRun })
  runPhase13ValidationWithRetry({
    dryRun,
    phase13BuildCommand,
    affectedYahooIds: validatePhase13AffectedOnly ? affectedYahooIds : [],
    strictPhase13Validate,
  })
  run("派生: phase14 pitch", "npm run phase14:build:pitch", { dryRun })
  if (skipPhase15) {
    console.log("\n[daily:npb-pipeline:v2] full stage: fast stage 済みのため phase15 batting splits をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full phase15 batting splits (already built in fast stage)")
  } else {
    run("派生: phase15 batting splits", phase15BuildCommand, { dryRun })
  }
  run("派生: phase16 batting count", "npm run phase16:build:batting-count", { dryRun })
  run("派生: pitcher season pitch types", "npm run phase25:build:pitcher-season-pitch-types", { dryRun })
  run("派生: phase22 catcher appearances", "npm run phase22:build:catcher-appearances", { dryRun })
  run("派生: phase23 catcher-pitcher splits", "npm run phase23:build:catcher-pitcher-splits", { dryRun })
  run("派生: phase24 catcher defense basic", "npm run phase24:build:catcher-defense-basic", { dryRun })
  runWarnOnlyValidation(
    "検証: phase24 実守備捕手帰属",
    "npm run validate:catcher-defense-active:2026",
    {
      dryRun,
      strict: strictFullDerivedValidate,
      note: "捕手タブ派生の警告として扱い、full derived公開は継続します。",
    },
  )
  run("派生: phase25 catcher starting summary", "npm run phase25:build:catcher-starting-summary", { dryRun })
  run("派生: phase26 catcher pa round pitch types", "npm run phase26:build:catcher-pa-round-pitch-types", { dryRun })
  run("派生: phase20 pitcher zones", "npm run phase20:build:pitcher-zones", { dryRun })
  run("派生: phase30 player matchup", "npm run phase30:build:player-matchup", { dryRun })
  runWarnOnlyValidation(
    "検証: phase31 対戦成績 vs Phase11",
    "npm run validate:phase31-matchup-vs-phase11:fail",
    {
      dryRun,
      strict: strictFullDerivedValidate,
      note: "対戦成績派生の警告として扱い、full derived公開は継続します。",
    },
  )
  runTopProbablesInputRefresh({ year, dryRun })
  run("トップ表示: 予想投手", "npm run phase36:build:top-probables", { dryRun })
  run("派生: phase33 batter vs team count pitch types", "npm run phase33:build:batter-vs-team-count-pitch-types", { dryRun })
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
    run("トップ表示: 今週リーダー", "npm run top-weekly-leaders:build:2026", { dryRun })
  }
  run("検証: canonical batting completeness", "npm run validate:canonical-batting-completeness", { dryRun })
  runVsHandValidationWithRetry({
    year,
    dryRun,
    phase15BuildCommand,
    affectedYahooIds,
    strictVsHandValidate,
  })

  if (!noPublish) {
    runFullDisplayPublishAndVerify({ year, fullOnly, dryRun, autoDeployProduction })
  }
  if (build) {
    run("本番ビルド（2回目後）", "npm run build:clean", { dryRun })
  }
}

function main() {
  const args = parseArgs(process.argv)
  currentArgs = args
  configureResume(args)
  const modeCount = [args.prefetchOnly, args.fastOnly, args.fullOnly, args.finalizePrecomputed].filter(Boolean).length
  if (modeCount > 1) {
    console.error("[daily:npb-pipeline:v2] --prefetch-only / --fast-only / --full-only / --finalize-precomputed は同時指定できません")
    process.exit(1)
  }

  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `開始 year=${args.year} from=${args.from} to=${args.to} mode=${args.prefetchOnly ? "prefetch-only" : args.fastOnly ? "fast-only" : args.fullOnly ? "full-only" : args.finalizePrecomputed ? "finalize-precomputed" : "all"}`,
  )

  if (args.prefetchOnly) {
    runPrefetchStage(args)
  } else if (args.fastOnly) {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
    runStrictCanonicalValidation(args)
    runFastStage(args)
  } else if (args.fullOnly) {
    runFullStage(args)
  } else if (args.finalizePrecomputed) {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
    runStrictCanonicalValidation(args)
    runFinalPrecomputedPublishStage(args)
  } else {
    if (!args.skipPrefetch) runPrefetchStage(args)
    runFinishedRawFreshnessGate(args)
    runPhase4Stage(args)
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
    })
  }

  if (resumeState.token && !resumeState.released) {
    throw new Error(`resume token did not match any step: ${resumeState.token}`)
  }

  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了 exit=0 lastStep=${lastStep || "-"}`)
  writePipelineCheckpoint("pipeline-completed", lastStep || "-", "", {
    resumeMode: resumeState.mode,
    resumeToken: resumeState.token,
  })
  console.log("\n[daily:npb-pipeline:v2] 完了。\n")
}

try {
  main()
} catch (e) {
  appendPipelineBulkLog(
    root,
    "daily:npb-pipeline:v2",
    `異常終了 exit=1 lastStep=${lastStep || "-"} message=${String(e?.message ?? e)}`,
  )
  console.error("[daily:npb-pipeline:v2] failed:", e?.message || e)
  process.exit(1)
}
