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
    skipVsHandValidate: false,
    skipFastPublish: false,
    noPublish: false,
    build: false,
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
    else if (a === "--skip-vs-hand-validate") out.skipVsHandValidate = true
    else if (a === "--skip-fast-publish") out.skipFastPublish = true
    else if (a === "--no-publish") out.noPublish = true
    else if (a === "--build") out.build = true
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

function runFinishedRawFreshnessGate({ from, to, gameIds, noStatsText, noScoreRaw, dryRun }) {
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
      if (staleKinds.length > 0) stale.push(`${gameId}:${staleKinds.join("+")}_raw_before_game_finished`)
    }
  }
  if (stale.length === 0) {
    console.log("\n[daily:npb-pipeline:v2] 終了済み試合 raw 鮮度ゲート OK\n")
    return
  }
  console.error("\n[daily:npb-pipeline:v2] 終了済み試合 raw 鮮度ゲート NG:")
  for (const item of stale) console.error(`  - ${item}`)
  console.error("  → 試合終了表示を確認する前に取得した raw が残っています。対象試合を再取得してください。\n")
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `finished_raw_freshness_gate NG ${stale.join(",")}`)
  if (!dryRun) throw new Error("finished raw freshness gate failed")
}

let stepNo = 0
let lastStep = ""

function log(msg) {
  console.log(`[daily:npb-pipeline:v2] [${nowIsoLocal()}] #${++stepNo} ${msg}`)
}

function run(label, command, opts = {}) {
  lastStep = label
  const startedAt = Date.now()
  log(`→ 開始: ${label}`)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run: ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    return
  }
  try {
    execSync(command, { cwd: root, stdio: "inherit", shell: true, env: childEnv })
  } catch (e) {
    const elapsed = formatMs(Date.now() - startedAt)
    const code = e && typeof e.status === "number" ? e.status : 1
    log(`← 失敗: ${label}（所要 ${elapsed}） exit=${code}`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗: ${label} 所要=${elapsed} exit=${code}`)
    throw e
  }
  const elapsed = formatMs(Date.now() - startedAt)
  log(`← 終了: ${label}（所要 ${elapsed}）`)
  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了: ${label} 所要=${elapsed}`)
}

function runTry(label, command, opts = {}) {
  lastStep = label
  const startedAt = Date.now()
  log(`→ 開始: ${label}（失敗しても続行可）`)
  console.log(`\n========== ${label} ==========\n${command}\n`)
  if (opts.dryRun) {
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `dry-run(try): ${label} cmd=${command}`)
    log(`← 省略: ${label}（dry-run）`)
    return true
  }
  try {
    execSync(command, { cwd: root, stdio: "inherit", shell: true, env: childEnv })
    const elapsed = formatMs(Date.now() - startedAt)
    log(`← 終了: ${label}（所要 ${elapsed}）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了(try): ${label} 所要=${elapsed}`)
    return true
  } catch {
    const elapsed = formatMs(Date.now() - startedAt)
    log(`← 失敗: ${label}（所要 ${elapsed}）`)
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `失敗(try): ${label} 所要=${elapsed}`)
    return false
  }
}

function listGameIdsForDateRange(year, from, to) {
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fs.existsSync(idxPath)) return []
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"))
  const byDate = idx?.byDate ?? {}
  const out = []
  for (const [day, ids] of Object.entries(byDate)) {
    if (from && day < from) continue
    if (to && day > to) continue
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const s = String(id ?? "").trim()
      if (s) out.push(s)
    }
  }
  return [...new Set(out)]
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
    const out = execSync(cmd, { cwd: root, encoding: "utf8", env: childEnv })
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
  const ok = runTry(
    "検証: canonical に打撃データが皆無の試合が残っていないこと（空だと個人打率が歪む）",
    validateCmd,
    { dryRun },
  )
  if (!ok) {
    console.warn("\n[daily:npb-pipeline:v2] 検証NG → 不足 raw の再取得と canonical 再生成を自動実行します（最大1回）。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `validate_phase2_canonical_nonempty NG → 自動リカバリ year=${year}`)
    if (!noStatsText) {
      const repairDate =
        from && to ? ` --from ${from} --to ${to}` : from ? ` --from ${from}` : to ? ` --to ${to}` : ""
      run(
        "Phase2a-repair（自動リカバリ）不完全な stats/text のみ再取得",
        `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete${repairDate}`,
        { dryRun },
      )
    }
    run(
      "Phase2b canonical 再生成（自動リカバリ・--force）",
      `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year} --force`,
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
  const gameIds = dryRun ? [] : listGameIdsForDateRange(year, from, to)
  const phase1GameIdsArg = gameIds.length > 0 ? ` --game-ids ${gameIds.join(",")}` : ""
  run(
    "Phase1 試合ページ raw（トップ）",
    `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year}${phase1GameIdsArg}`,
    { dryRun },
  )
  runPhase2FetchBlock({ year, from, to, noStatsText, noScoreRaw, dryRun })
  runPhase2bCanonical({ year, from, to, forceCanonical, dryRun })
}

function runPhase4Stage({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, strictQuality, phase4Sleep, dryRun }) {
  runScoreRawGate({ year, from, to, gameIds, noScoreRaw, skipScoreRawGate, yahooForce, dryRun })
  const phase4Force = yahooForce ? " --force" : ""
  const targetGameIds = Array.isArray(gameIds) ? gameIds.filter(Boolean) : []
  const phase4Target =
    targetGameIds.length > 0
      ? `--game-ids ${targetGameIds.join(",")}`
      : `--from-date ${from} --to-date ${to}`
  run(
    targetGameIds.length > 0
      ? "Phase4: Yahoo 一球速報ログ復元 + canonical マージ（指定試合のみ）"
      : "Phase4: Yahoo 一球速報ログ復元 + canonical マージ",
    `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} ${phase4Target} --sleep ${phase4Sleep || "1.2"}${phase4Force}`,
    { dryRun },
  )
  run(
    "Phase4: 実況テキストから resultSummaryJa 再補完",
    "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
    { dryRun },
  )
  if (strictQuality) {
    run(
      "検証: pitch-by-pitch coverage",
      `node scripts/diag_pitch_by_pitch_coverage_all_games.mjs --year ${year} --from-date ${from} --to-date ${to} --fail`,
      { dryRun },
    )
  }
}

function runPhase19WithRetry({ dryRun }) {
  runTry("名簿: NPB 英字名更新（phase19 前）", "npm run roster:fetch-npb-en", { dryRun })
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
  run(
    "検証: phase13 対チーム vs Phase11（再実行）",
    validationCommand,
    { dryRun },
  )
}

function runFastDisplayPublishAndVerify({ year, dryRun }) {
  run(
    "R2公開(1回目): rankings + standings + top leaders + player season totals",
    `node scripts/display_publish_fast_2026.mjs --year ${year}${dryRun ? " --dry-run" : ""}`,
    { dryRun: false },
  )

  const verified = runTry(
    "公開確認(1回目): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
  if (verified) return

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
    `node scripts/display_publish_fast_2026.mjs --year ${year}${dryRun ? " --dry-run" : ""}`,
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

function runFullDisplayPublishAndVerify({ year, fullOnly, dryRun }) {
  runFullDisplayPublishCommands({ fullOnly, dryRun })

  const verified = runTry(
    "公開確認(2回目): R2直 + 本番 /data standings/rankings/top-leaders",
    `node scripts/verify_display_publish_after_upload.mjs --year ${year}`,
    { dryRun },
  )
  if (verified) return

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
  dryRun,
  useAffectedPhase11 = true,
  skipPhase15 = false,
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
  } else {
    run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11", { dryRun })
  }

  if (!noPublish) {
    runFastDisplayPublishAndVerify({ year, dryRun })
  }
  if (build) {
    run("本番ビルド（1回目後）", "npm run build:clean", { dryRun })
  }
}

function runFinalPrecomputedPublishStage({ year, noPublish, build, skipVsHandValidate, dryRun }) {
  console.log("\n[daily:npb-pipeline:v2] 先行済み派生を使い、ランキング/順位表/トップ表示だけ最終再計算します。\n")
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
    run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11", { dryRun })
  }

  if (!noPublish) {
    runFastDisplayPublishAndVerify({ year, dryRun })
  }
  if (build) {
    run("本番ビルド（finalize-precomputed 後）", "npm run build:clean", { dryRun })
  }
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
  skipPhase15 = false,
  skipRepeatedTopBuilds = false,
  validatePhase13AffectedOnly = false,
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
  run("検証: phase24 実守備捕手帰属", "npm run validate:catcher-defense-active:2026", { dryRun })
  run("派生: phase25 catcher starting summary", "npm run phase25:build:catcher-starting-summary", { dryRun })
  run("派生: phase26 catcher pa round pitch types", "npm run phase26:build:catcher-pa-round-pitch-types", { dryRun })
  run("派生: phase20 pitcher zones", "npm run phase20:build:pitcher-zones", { dryRun })
  run("派生: phase30 player matchup", "npm run phase30:build:player-matchup", { dryRun })
  run("検証: phase31 対戦成績 vs Phase11", "npm run validate:phase31-matchup-vs-phase11:fail", { dryRun })
  run("トップ表示: 予想投手", "npm run phase36:build:top-probables", { dryRun })
  run("派生: phase33 batter vs team count pitch types", "npm run phase33:build:batter-vs-team-count-pitch-types", { dryRun })
  run("検証: phase34 球団別配球 vs Phase14", "npm run validate:phase34-batter-vs-team-pitch-vs-phase14:fail", { dryRun })
  run("派生: build yahoo npb full index", "npm run build:yahoo-npb-full-index", { dryRun })
  if (skipRepeatedTopBuilds) {
    console.log("\n[daily:npb-pipeline:v2] full stage: fast stage 済みのため top leaders 再生成をスキップします。\n")
    appendPipelineBulkLog(root, "daily:npb-pipeline:v2", "skip: full repeated top leaders builds")
  } else {
    run("トップ表示: 通算リーダー", "npm run top-leaders:build:2026", { dryRun })
    run("トップ表示: 今週リーダー", "npm run top-weekly-leaders:build:2026", { dryRun })
  }
  run("検証: canonical batting completeness", "npm run validate:canonical-batting-completeness", { dryRun })
  run("検証: phase11 vs vs_hand P0", "npm run validate:vs-hand-vs-phase11", { dryRun })

  if (!noPublish) {
    runFullDisplayPublishAndVerify({ year, fullOnly, dryRun })
  }
  if (build) {
    run("本番ビルド（2回目後）", "npm run build:clean", { dryRun })
  }
}

function main() {
  const args = parseArgs(process.argv)
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

  appendPipelineBulkLog(root, "daily:npb-pipeline:v2", `完了 exit=0 lastStep=${lastStep || "-"}`)
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
