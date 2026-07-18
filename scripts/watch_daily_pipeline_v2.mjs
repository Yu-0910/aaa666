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
 *   node scripts/watch_daily_pipeline_v2.mjs --year 2026 --date 2026-07-18 --auto-deploy-production
 */

import fs from "node:fs"
import path from "node:path"
import { execSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

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
    autoDeployProduction: argv.includes("--auto-deploy-production"),
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

function alreadyRanToday(dateJst, force) {
  return !force && fs.existsSync(lockPath(dateJst))
}

function writeLock(dateJst, payload) {
  const p = lockPath(dateJst)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8")
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
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
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

function scheduleAllFinishedForDate(dateJst) {
  const statusMap = scheduleStatusMapForDate(dateJst)
  if (statusMap.size === 0) return false
  for (const status of statusMap.values()) {
    if (!/試合終了|試合中止|ノーゲーム/.test(status)) return false
  }
  return true
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

function pendingGameIdsForRepair(readiness) {
  const ids = new Set()
  for (const p of readiness.pending ?? []) {
    const text = String(p)
    if (
      !/score_raw_gate|raw_before_game_finished|missing_canonical|battingLines=0|textPlayByPlay=0|bad_canonical_json/.test(
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

function repairAttemptKey(dateJst, gameId) {
  return `${gameId}:${scheduleSnapshotFetchedAtMs(dateJst)}`
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
  const pending = []
  if (gate.status !== 0) {
    pending.push(`score_raw_gate${scoreRawGateGameIds.length ? `:${scoreRawGateGameIds.join(",")}` : ""}`)
  }
  const scoreRawCompletenessGameIds = new Set(scoreRawGateGameIds)

  const statusMap = scheduleStatusMapForDate(dateJst)
  const scheduleFetchedAtMs = scheduleSnapshotFetchedAtMs(dateJst)
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
      if (/試合終了/.test(status) && scheduleFetchedAtMs > 0) {
        const staleKinds = ["stats", "text", "score"].filter((kind) => rawMetaFetchedAtMs(kind, gameId) < scheduleFetchedAtMs)
        if (staleKinds.length > 0) {
          pending.push(`${gameId}:raw_before_game_finished=${staleKinds.join("+")}`)
          scoreRawCompletenessGameIds.add(gameId)
        }
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
    gateStdErr: gate.stderr || "",
  }
}

function runPipelineV2(year, dateJst, dryRun, autoDeployProduction) {
  const cmd = `node scripts/run_daily_npb_pipeline_v2.mjs --year ${year} --from ${dateJst} --to ${dateJst} --skip-prefetch --finalize-precomputed${autoDeployProduction ? " --auto-deploy-production" : ""}${dryRun ? " --dry-run" : ""}`
  log(`v2 pipeline 実行: ${cmd}`)
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
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
    ["phase13 context 差分", `npm run phase13:build:context -- --only-yahoo-ids ${idCsv}`],
    ["phase15 batting splits 差分", `npm run phase15:build:batting-splits -- --only-yahoo-ids ${idCsv}`],
  ]
  appendPipelineBulkLog(
    root,
    "watch:daily-pipeline:v2",
    `player_derivation_precompute gameIds=${gameIds.join(",")} yahooIds=${yahooIds.length}`,
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
  const pendingGameIds = new Set()
  for (const p of readiness.pending ?? []) {
    for (const m of String(p).matchAll(/\d{10}/g)) pendingGameIds.add(m[0])
  }
  const targets = []
  for (const gameId of listGameIdsForDate(year, dateJst)) {
    if (pendingGameIds.has(gameId)) continue
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
  if (!dryRun) execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  for (const t of targets) processedSignatures.set(t.gameId, t.sig)
  return ids
}

function runTargetedScoreRawRepair(year, dateJst, gameIds, dryRun) {
  const ids = [...new Set(gameIds)].filter(Boolean)
  if (ids.length === 0) return
  const idCsv = ids.join(",")
  const statsTextCmd = `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --game-ids ${idCsv} --force`
  const scoreRawCmd = `python -u scripts/fetch_sportsnavi_score_raw_snapshot.py --year ${year} --from-date ${dateJst} --to-date ${dateJst} --game-ids ${idCsv} --force --sleep 1.2`
  log(`試合終了後の score raw 未完了を検出: ${idCsv}`)
  log(`stats/text 再取得: ${statsTextCmd}`)
  if (!dryRun) execSync(statsTextCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
  log(`score raw 再取得: ${scoreRawCmd}`)
  if (!dryRun) execSync(scoreRawCmd, { cwd: root, stdio: "inherit", shell: true, env: process.env })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dateJst = args.dateJst || todayJstYmd()

  if (alreadyRanToday(dateJst, args.force)) {
    log(`本日 (${dateJst}) は既に起動済みです。--force で再実行`)
    return
  }

  log(
    `開始 year=${args.year} date=${dateJst} poll=${args.pollMinutes}min endgamePoll=${args.endgamePollMinutes}min deadline=翌${args.deadline} dryRun=${args.dryRun} autoDeployProduction=${args.autoDeployProduction}`,
  )
  await waitUntilWatchStart(dateJst, args.skipWaitForStart)

  const deadlineMs = deadlineMsForWatchDate(dateJst, args.deadline)
  const repairedGameKeys = new Set()
  const partialPhase4Signatures = new Map()
  for (;;) {
    runPrefetch(args.year, dateJst, args.dryRun)
    let readiness = checkLocalReady(args.year, dateJst)

    if (readiness.noGames) {
      log(`当日の試合なし (${dateJst})`)
      if (!args.dryRun) writeLock(dateJst, { ranAt: new Date().toISOString(), reason: "no_games_today" })
      return
    }

    if (readiness.ready) {
      if (args.partialPhase4) {
        const finalTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
        const precomputedGameIds = runPartialPhase4(args.year, finalTargets, partialPhase4Signatures, args.dryRun)
        runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
      }
      log("必要データが全試合で揃ったため、v2 pipeline を起動します")
      appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `all_ready date=${dateJst}`)
      if (!args.dryRun) {
        writeLock(dateJst, { ranAt: new Date().toISOString(), reason: "all_data_ready" })
      }
      runPipelineV2(args.year, dateJst, args.dryRun, args.autoDeployProduction)
      return
    }

    const repairablePendingIds = new Set(pendingGameIdsForRepair(readiness))
    const finishedIds = finishedGameIdsForDate(dateJst)
    const finishedPendingIds = finishedIds
      .filter((id) => repairablePendingIds.has(id))
      .filter((id) => !repairedGameKeys.has(repairAttemptKey(dateJst, id)))

    if (finishedPendingIds.length > 0) {
      for (const id of finishedPendingIds) repairedGameKeys.add(repairAttemptKey(dateJst, id))
      appendPipelineBulkLog(
        root,
        "watch:daily-pipeline:v2",
        `score_raw_repair_finished date=${dateJst} gameIds=${finishedPendingIds.join(",")}`,
      )
      runTargetedScoreRawRepair(args.year, dateJst, finishedPendingIds, args.dryRun)
      readiness = checkLocalReady(args.year, dateJst)
      if (readiness.ready) {
        if (args.partialPhase4) {
          const finalTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
          const precomputedGameIds = runPartialPhase4(args.year, finalTargets, partialPhase4Signatures, args.dryRun)
          runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
        }
        log("再取得後に必要データが揃ったため、v2 pipeline を起動します")
        appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `all_ready_after_repair date=${dateJst}`)
        if (!args.dryRun) {
          writeLock(dateJst, { ranAt: new Date().toISOString(), reason: "all_data_ready_after_repair" })
        }
        runPipelineV2(args.year, dateJst, args.dryRun, args.autoDeployProduction)
        return
      }
    }

    log(`未完了: ${readiness.pending.join(", ")}`)
    appendPipelineBulkLog(root, "watch:daily-pipeline:v2", `pending date=${dateJst} ${readiness.pending.join(",")}`)

    if (args.partialPhase4) {
      const partialTargets = collectPartialPhase4Targets(args.year, dateJst, readiness, partialPhase4Signatures)
      if (partialTargets.length > 0) {
        const precomputedGameIds = runPartialPhase4(args.year, partialTargets, partialPhase4Signatures, args.dryRun)
        runPlayerDerivationPrecompute(args.year, precomputedGameIds, args.dryRun)
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
      if (!args.dryRun) {
        writeLock(dateJst, {
          ranAt: new Date().toISOString(),
          reason: "deadline_force",
          pending: readiness.pending,
        })
      }
      runPipelineV2(args.year, dateJst, args.dryRun, args.autoDeployProduction)
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
  console.error("[watch:daily-pipeline:v2] failed:", e)
  process.exit(1)
})
