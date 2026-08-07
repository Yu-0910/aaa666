/**
 * Phase 4: 一球速報（Yahoo score?index）を全試合へ拡大し、canonical にマージする。
 *
 * これは「3/27 広島×中日でできている Phase10 復元＋マージ」を、season index の gameIds 全件へ適用するラッパー。
 *
 * 実行:
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --force
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --limit 5
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --sleep 1.2
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --force --to-date 2026-04-19
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --from-date 2026-05-04 --to-date 2026-05-06
 *   node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year 2026 --game-ids 2021039122,2021039124
 *     … byDate 上でその期間（両端含む）の gameId のみ処理
 *
 * 注意:
 * - ネットワーク負荷が大きい（打席ごとにアクセス）。途中停止しても再実行で続きから再開できる。
 * - **空の `pitchRows` だけの derived は「未完了」**（docs/data_operation_rules.md §一括取得 2026-05）。
 *   存在しても restore を再実行する（`--force` なし・キャッシュ HTML 利用可）。
 * - merge stamp 指紋は **`pitchRows` のみ**を正とする（`rows` キーは読まない）。誤 stamp は mergeVersion bump で無効化。
 * - 試合中止/ノーゲームは score raw ゲートと同様 **restore・merge 対象外**（打席 0 で exit 2 にならない）。
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { isSportsnaviMainGameCancelled } from "../lib/yahooGame/sportsnaviStatsTextParse.mjs"
import { isScheduleCancelledGame } from "../lib/yahooGame/sportsnaviScheduleStatus.mjs"
import { writeJsonFileWithRetrySync, writeTextFileWithRetrySync } from "./writeFileWithRetry.mjs"

const MERGE_STAMP_SCHEMA = "phase4-yahoo-phase10-merge-stamp-v1"
// merge ロジックを変えたら bump（stamp を無効化して再マージさせる）
const MERGE_STAMP_MERGE_VERSION = "mergePhase10IntoCanonical@2026-05-31"
/** stamp 指紋が誤って空配列になると merge skip が連鎖するため、pitchRows>0 ではこの値と一致させない */
const EMPTY_PHASE10_ROWS_FINGERPRINT = createHash("sha256").update("[]", "utf8").digest("hex")

function nowIsoLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
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
  const yearIdx = argv.indexOf("--year")
  const limitIdx = argv.indexOf("--limit")
  const sleepIdx = argv.indexOf("--sleep")
  const toDateIdx = argv.indexOf("--to-date")
  const fromDateIdx = argv.indexOf("--from-date")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const force = argv.includes("--force")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const limitRaw = limitIdx >= 0 ? String(argv[limitIdx + 1] ?? "").trim() : ""
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : 0
  const sleepRaw = sleepIdx >= 0 ? String(argv[sleepIdx + 1] ?? "").trim() : ""
  const sleepSec = sleepRaw ? Math.max(0.0, parseFloat(sleepRaw) || 0) : 1.2
  const toDate = toDateIdx >= 0 ? String(argv[toDateIdx + 1] ?? "").trim() : ""
  const fromDate = fromDateIdx >= 0 ? String(argv[fromDateIdx + 1] ?? "").trim() : ""
  const gameIds =
    gameIdsIdx >= 0
      ? String(argv[gameIdsIdx + 1] ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : []
  return { year, limit, sleepSec, force, toDate, fromDate, gameIds }
}

/**
 * idx.byDate のうち、fromDate ≤ 日付 ≤ toDate（指定が無い側は制限なし）の gameId を集約し、gameIdsAll と順序維持で交差する。
 * byDate が無い／空なら gameIdsAll をそのまま返す。
 */
function filterGameIdsByDateRange(idx, gameIdsAll, fromDate, toDate) {
  const byDate = idx?.byDate
  if ((!fromDate && !toDate) || !byDate || typeof byDate !== "object") {
    return gameIdsAll
  }
  const allowed = new Set()
  for (const [day, ids] of Object.entries(byDate)) {
    if (!day) continue
    if (fromDate && day < fromDate) continue
    if (toDate && day > toDate) continue
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const s = String(id ?? "").trim()
      if (s) allowed.add(s)
    }
  }
  if (allowed.size === 0) {
    return gameIdsAll
  }
  return gameIdsAll.filter((id) => allowed.has(String(id).trim()))
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function fileExists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

/**
 * 試合中止/ノーゲーム（Phase4 一球復元の対象外）。
 * main raw は score-raw ゲートと同じ中止判定。無ければ canonical の missingOrPartial / タイトル。
 */
function isCancelledGame(root, year, gameId, canonPath) {
  const scheduleCancelled = isScheduleCancelledGame(root, year, gameId)
  if (scheduleCancelled === true) return true
  if (scheduleCancelled === false) return false

  const mainPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  if (fileExists(mainPath)) {
    try {
      if (isSportsnaviMainGameCancelled(fs.readFileSync(mainPath, "utf8"), gameId)) return true
    } catch {
      // ignore
    }
  }
  const textPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_text", `${gameId}.html`)
  if (fileExists(textPath)) {
    try {
      if (isSportsnaviMainGameCancelled(fs.readFileSync(textPath, "utf8"), gameId)) return true
    } catch {
      // ignore
    }
  }
  if (fileExists(canonPath)) {
    try {
      const c = readJson(canonPath)
      const miss = c?.game?.missingOrPartial ?? []
      if (miss.some((s) => String(s).includes("game cancelled"))) return true
      const title = String(c?.game?.meta?.documentTitle ?? c?.game?.meta?.ogTitle ?? "")
      if (/試合中止|ノーゲーム|コールド/.test(title)) return true
    } catch {
      // ignore
    }
  }
  return false
}

/** phase10 derived JSON から pitchRows 配列（schema 正: `pitchRows`。`rows` は読まない）。 */
function pitchRowsFromPhase10Json(restoredJson) {
  return Array.isArray(restoredJson?.pitchRows) ? restoredJson.pitchRows : []
}

/** `pitchRows` 件数。ファイル無し・壊れ JSON は 0。 */
function phase10PitchRowCount(phase10Path) {
  if (!fileExists(phase10Path)) return 0
  try {
    return pitchRowsFromPhase10Json(readJson(phase10Path)).length
  } catch {
    return 0
  }
}

function canonicalDomainPitchEventCount(canonPath) {
  if (!fileExists(canonPath)) return 0
  try {
    const doc = readJson(canonPath)
    return Array.isArray(doc?.domain?.pitchEvents) ? doc.domain.pitchEvents.length : 0
  } catch {
    return 0
  }
}

function writeMergeStamp(stampPath, gameId, phase10Path) {
  const restoredJson = readJson(phase10Path)
  const rows = pitchRowsFromPhase10Json(restoredJson)
  const phase10RowsFingerprint = computePhase10RowsFingerprint(rows)
  if (rows.length > 0 && phase10RowsFingerprint === EMPTY_PHASE10_ROWS_FINGERPRINT) {
    throw new Error(`[phase4] stamp fingerprint sanity failed for ${gameId}: pitchRows=${rows.length} but empty hash`)
  }
  writeTextFileWithRetrySync(
    stampPath,
    JSON.stringify(
      {
        schemaVersion: MERGE_STAMP_SCHEMA,
        gameId,
        mergeVersion: MERGE_STAMP_MERGE_VERSION,
        phase10RowsFingerprint,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  )
  return { phase10RowsFingerprint, pitchRowCount: rows.length }
}

function isCanonicalConsistentWithPhase10(canonPath, phase10Path) {
  const pitchRows = phase10PitchRowCount(phase10Path)
  const pitchEvents = canonicalDomainPitchEventCount(canonPath)
  return pitchRows > 0 && pitchEvents === pitchRows
}

function buildScoreIndex(inning, topBottom, batOrder) {
  const inn = String(parseInt(String(inning), 10)).padStart(2, "0")
  const tb = String(topBottom) === "裏" ? "2" : "1"
  const bo = String(parseInt(String(batOrder), 10)).padStart(2, "0")
  return `${inn}${tb}${bo}00`
}

function baseScoreIndex(scoreIndex) {
  const s = String(scoreIndex ?? "").trim()
  if (!/^\d{7}$/.test(s)) return ""
  return `${s.slice(0, 5)}00`
}

function scoreRawBaseIndexes(root, gameId) {
  const metaPath = path.join(root, "_data", "scraped_games", "raw_sportsnavi_score", "_meta", `${gameId}.json`)
  if (!fileExists(metaPath)) return new Set()
  try {
    const meta = readJson(metaPath)
    const indexes = Array.isArray(meta?.scoreIndexes) ? meta.scoreIndexes : []
    return new Set(indexes.map(baseScoreIndex).filter(Boolean))
  } catch {
    return new Set()
  }
}

function phase10CoveredBaseIndexes(phase10Path) {
  if (!fileExists(phase10Path)) return new Set()
  try {
    const rows = pitchRowsFromPhase10Json(readJson(phase10Path))
    return new Set(rows.map((r) => buildScoreIndex(r?.inning, r?.top_bottom, r?.bat_order)).filter(Boolean))
  } catch {
    return new Set()
  }
}

function missingPhase10BaseIndexes(root, gameId, phase10Path) {
  const rawBases = scoreRawBaseIndexes(root, gameId)
  if (rawBases.size === 0) return []
  const covered = phase10CoveredBaseIndexes(phase10Path)
  return [...rawBases].filter((ix) => !covered.has(ix)).sort()
}

function safeReadText(p) {
  try {
    return fs.readFileSync(p, "utf8")
  } catch {
    return ""
  }
}

/**
 * `lib/yahooGame/mergePhase10FromPitchRows.ts` の `computeEventsFingerprint` と同じ安定化。
 * ここでは stamp 用の「phase10 rows fingerprint」だけを作る（canonical の eventsFingerprint とは別）。
 */
function computePhase10RowsFingerprint(rows) {
  const stable = [...rows].sort((a, b) => {
    const innA = parseInt(String(a?.inning ?? "0"), 10) || 0
    const innB = parseInt(String(b?.inning ?? "0"), 10) || 0
    if (innA !== innB) return innA - innB
    const tbA = String(a?.top_bottom ?? "")
    const tbB = String(b?.top_bottom ?? "")
    if (tbA !== tbB) return tbA < tbB ? -1 : 1
    const boA = parseInt(String(a?.bat_order ?? "0"), 10) || 0
    const boB = parseInt(String(b?.bat_order ?? "0"), 10) || 0
    if (boA !== boB) return boA - boB
    const pnA = parseInt(String(a?.pitch_no ?? "0"), 10) || 0
    const pnB = parseInt(String(b?.pitch_no ?? "0"), 10) || 0
    return pnA - pnB
  })
  // Node の crypto で sha256
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex")
}

function readMergeStamp(stampPath) {
  const t = safeReadText(stampPath).trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

function shouldSkipMergeByStamp(stampPath, expected, { pitchRowCount = 0 } = {}) {
  const j = readMergeStamp(stampPath)
  if (!j || j?.schemaVersion !== MERGE_STAMP_SCHEMA) return false
  // 誤 stamp（空指紋）で pitchRows ありの merge を skip しない（2026-05-31 再発対策）
  if (
    pitchRowCount > 0 &&
    j?.phase10RowsFingerprint === EMPTY_PHASE10_ROWS_FINGERPRINT &&
    expected.phase10RowsFingerprint !== EMPTY_PHASE10_ROWS_FINGERPRINT
  ) {
    return false
  }
  return (
    j?.mergeVersion === expected.mergeVersion &&
    j?.phase10RowsFingerprint === expected.phase10RowsFingerprint &&
    j?.gameId === expected.gameId
  )
}

function run(cmd, args, label) {
  const isWindows = process.platform === "win32"
  const isCmdLike = isWindows && /\.(cmd|bat)$/i.test(cmd)
  // Windows は .cmd/.bat を直接 spawn できないため cmd.exe 経由で実行する
  const r = isCmdLike
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", cmd, ...args],
        { stdio: "inherit", shell: false, cwd: process.cwd() },
      )
    : spawnSync(cmd, args, { stdio: "inherit", shell: false, cwd: process.cwd() })
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit=${r.status})`)
  }
}

async function main() {
  const { year, limit, sleepSec, force, toDate, fromDate, gameIds: explicitGameIds } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!fileExists(indexPath)) {
    console.error("[phase4] missing index:", indexPath)
    process.exit(1)
  }
  const idx = readJson(indexPath)
  if (idx?.schemaVersion !== "sportsnavi-schedule-season-index-v1") {
    console.error("[phase4] invalid index schema:", indexPath)
    process.exit(1)
  }
  let gameIdsAll = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
  if (fromDate || toDate) {
    const before = gameIdsAll.length
    gameIdsAll = filterGameIdsByDateRange(idx, gameIdsAll, fromDate, toDate)
    if (gameIdsAll.length === 0) {
      console.error(
        "[phase4] 日付範囲により gameIds が空です。--from-date / --to-date と index の byDate を確認してください。",
      )
      process.exit(1)
    }
    const rangeLabel = [fromDate || "…", toDate || "…"].join(" … ")
    console.log(`[phase4] 日付範囲 ${rangeLabel}: ${before} gameIds → ${gameIdsAll.length} (byDate による絞り込み)`)
  }
  if (explicitGameIds.length > 0) {
    const before = gameIdsAll.length
    const allowed = new Set(explicitGameIds)
    gameIdsAll = gameIdsAll.filter((id) => allowed.has(id))
    if (gameIdsAll.length === 0) {
      console.error("[phase4] --game-ids に一致する gameId が season index にありません:", explicitGameIds.join(","))
      process.exit(1)
    }
    console.log(`[phase4] gameIds 指定: ${before} gameIds → ${gameIdsAll.length} (${gameIdsAll.join(",")})`)
  }
  const gameIds = limit > 0 ? gameIdsAll.slice(0, limit) : gameIdsAll
  if (gameIds.length === 0) {
    console.error("[phase4] empty gameIds:", indexPath)
    process.exit(1)
  }

  // 1) prepare text.html so python can reuse local text (best-effort)
  run(
    process.execPath,
    [path.join("scripts", "phase4_prepare_yahoo_phase10_text_from_sportsnavi_raw.mjs"), "--year", year, ...(force ? ["--force"] : [])],
    "prepare"
  )

  const startedAll = Date.now()
  let restored = 0
  let merged = 0
  let skippedRestore = 0
  let skippedMerge = 0
  let skippedCancelled = 0
  let failed = 0
  const failedGameIds = []
  const gameReports = []

  for (let i = 0; i < gameIds.length; i++) {
    const gameId = gameIds[i]
    const startedGame = Date.now()
    const doneCount = i // completed before this one
    const elapsedSoFar = Date.now() - startedAll
    const avgPer = doneCount > 0 ? elapsedSoFar / doneCount : 0
    const remaining = gameIds.length - i
    const eta = avgPer > 0 ? avgPer * remaining : 0
    console.log(
      `\n[phase4] ${i + 1}/${gameIds.length} gameId=${gameId} start ${nowIsoLocal()}` +
        (eta ? ` (eta≈${formatMs(eta)})` : "")
    )

    const phase10Path = path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
    const canonPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    const gameReport = {
      gameId,
      restoreStatus: "not_started",
      mergeStatus: "not_started",
      pitchRows: 0,
      pitchEvents: 0,
      attempts: [],
      recommendedNextCommand: "",
    }
    gameReports.push(gameReport)
    if (isCancelledGame(root, year, gameId, canonPath)) {
      skippedCancelled += 1
      gameReport.restoreStatus = "skipped_cancelled"
      gameReport.mergeStatus = "skipped_cancelled"
      console.log(`[phase4] skip ${gameId}: game cancelled (試合中止/ノーゲーム) — phase10 対象外`)
      if (fileExists(phase10Path) && phase10PitchRowCount(phase10Path) === 0) {
        try {
          fs.unlinkSync(phase10Path)
          console.log(`[phase4] removed empty ${path.basename(phase10Path)} (cancelled)`)
        } catch {
          // ignore
        }
      }
      const elapsedGame = Date.now() - startedGame
      console.log(
        `[phase4] ${i + 1}/${gameIds.length} gameId=${gameId} end   ${nowIsoLocal()} (elapsed ${formatMs(elapsedGame)})`,
      )
      continue
    }

    if (!fileExists(canonPath)) {
      console.warn(`[phase4] skip ${gameId}: missing canonical`)
      gameReport.restoreStatus = "skipped_missing_canonical"
      gameReport.mergeStatus = "skipped_missing_canonical"
      gameReport.recommendedNextCommand = `node scripts/run_daily_npb_pipeline_v2.mjs --year ${year} --game-ids ${gameId} --prefetch-only`
      failed += 1
      failedGameIds.push(gameId)
      continue
    }

    // restore（空 pitchRows の derived は未完了扱い → 削除して再実行）
    const existingRows = phase10PitchRowCount(phase10Path)
    const missingBaseIndexes = !force && existingRows > 0 ? missingPhase10BaseIndexes(root, gameId, phase10Path) : []
    if (!force && existingRows > 0 && missingBaseIndexes.length === 0) {
      skippedRestore += 1
      gameReport.restoreStatus = "skipped_existing"
      console.log(`[phase4] restore: skipped (pitchRows=${existingRows})`)
    } else {
      if (!force && existingRows > 0 && missingBaseIndexes.length > 0) {
        console.log(`[phase4] restore: raw 更新を検出（未反映 score index=${missingBaseIndexes.join(",")}）`)
      }
      if (!force && fileExists(phase10Path) && existingRows === 0) {
        try {
          fs.unlinkSync(phase10Path)
          console.log(`[phase4] restore: removed empty ${path.basename(phase10Path)}`)
        } catch {
          // ignore
        }
      }
      try {
        console.log(`[phase4] restore: running (sleep=${sleepSec}${force ? ", force" : ""})`)
        gameReport.attempts.push({ step: "restore", attempt: 1, status: "running" })
        run(
          "python",
          [
            path.join("scripts", "run_yahoo_phase10_restore.py"),
            "--game-id",
            gameId,
            "--year",
            year,
            "--text-from-raw",
            "--sleep",
            String(sleepSec),
            ...(force ? ["--force"] : []),
          ],
          `restore:${gameId}`
        )
        restored += 1
        gameReport.restoreStatus = "completed"
        gameReport.attempts[gameReport.attempts.length - 1].status = "completed"
        console.log(`[phase4] restore: ok`)
      } catch (e) {
        const message = String(e?.message ?? e)
        console.warn(`[phase4] restore failed for ${gameId}: ${message}`)
        gameReport.restoreStatus = "failed"
        gameReport.mergeStatus = "skipped_restore_failed"
        gameReport.errorMessage = message
        gameReport.recommendedNextCommand = `python scripts/run_yahoo_phase10_restore.py --game-id ${gameId} --year ${year} --text-from-raw --sleep ${sleepSec} --force`
        if (gameReport.attempts.length > 0) gameReport.attempts[gameReport.attempts.length - 1].status = "failed"
        failed += 1
        failedGameIds.push(gameId)
        continue
      }
    }

    // merge
    const stampPath = path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_merged.stamp`)
    if (!force && fileExists(stampPath) && fileExists(phase10Path)) {
      try {
        const restoredJson = readJson(phase10Path)
        const rows = pitchRowsFromPhase10Json(restoredJson)
        const fp = computePhase10RowsFingerprint(rows)
        if (
          shouldSkipMergeByStamp(
            stampPath,
            {
              gameId,
              mergeVersion: MERGE_STAMP_MERGE_VERSION,
              phase10RowsFingerprint: fp,
            },
            { pitchRowCount: rows.length },
          )
        ) {
          skippedMerge += 1
          gameReport.mergeStatus = "skipped_stamp_match"
          gameReport.pitchRows = rows.length
          gameReport.pitchEvents = canonicalDomainPitchEventCount(canonPath)
          console.log(`[phase4] merge: skipped (stamp match)`)
          continue
        }
      } catch {
        // stamp が壊れている・phase10 が読めない等は再マージへ倒す
      }
    }
    try {
      console.log(`[phase4] merge: running`)
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
      gameReport.attempts.push({ step: "merge", attempt: 1, status: "running" })
      run(npmCmd, ["run", "-s", "phase4:merge:phase10", "--", "--game-id", gameId], `merge:${gameId}`)
      const stamp = writeMergeStamp(stampPath, gameId, phase10Path)
      merged += 1
      gameReport.mergeStatus = "completed"
      gameReport.pitchRows = stamp.pitchRowCount
      gameReport.pitchEvents = canonicalDomainPitchEventCount(canonPath)
      gameReport.attempts[gameReport.attempts.length - 1].status = "completed"
      console.log(`[phase4] merge: ok`)
    } catch (e) {
      const firstMessage = String(e?.message ?? e)
      console.warn(`[phase4] merge failed for ${gameId}: ${firstMessage}`)
      if (gameReport.attempts.length > 0) gameReport.attempts[gameReport.attempts.length - 1].status = "failed"
      try {
        console.warn(`[phase4] merge retry for ${gameId}: running once`)
        const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
        gameReport.attempts.push({ step: "merge", attempt: 2, status: "running" })
        run(npmCmd, ["run", "-s", "phase4:merge:phase10", "--", "--game-id", gameId], `merge-retry:${gameId}`)
        const stamp = writeMergeStamp(stampPath, gameId, phase10Path)
        merged += 1
        gameReport.mergeStatus = "completed_after_retry"
        gameReport.pitchRows = stamp.pitchRowCount
        gameReport.pitchEvents = canonicalDomainPitchEventCount(canonPath)
        gameReport.attempts[gameReport.attempts.length - 1].status = "completed"
        console.log(`[phase4] merge retry: ok`)
      } catch (retryError) {
        const retryMessage = String(retryError?.message ?? retryError)
        if (gameReport.attempts.length > 0) gameReport.attempts[gameReport.attempts.length - 1].status = "failed"
        if (isCanonicalConsistentWithPhase10(canonPath, phase10Path)) {
          try {
            const stamp = writeMergeStamp(stampPath, gameId, phase10Path)
            skippedMerge += 1
            gameReport.mergeStatus = "stamp_repaired_after_consistency_check"
            gameReport.pitchRows = stamp.pitchRowCount
            gameReport.pitchEvents = canonicalDomainPitchEventCount(canonPath)
            gameReport.errorMessage = `merge failed but canonical was already consistent; first=${firstMessage}; retry=${retryMessage}`
            console.warn(`[phase4] merge stamp repaired for ${gameId}: canonical already has matching pitchEvents`)
            continue
          } catch (stampError) {
            gameReport.errorMessage = `first=${firstMessage}; retry=${retryMessage}; stamp=${String(stampError?.message ?? stampError)}`
          }
        } else {
          gameReport.errorMessage = `first=${firstMessage}; retry=${retryMessage}`
          gameReport.pitchRows = phase10PitchRowCount(phase10Path)
          gameReport.pitchEvents = canonicalDomainPitchEventCount(canonPath)
        }
        gameReport.mergeStatus = "failed"
        gameReport.recommendedNextCommand = `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --game-ids ${gameId} --sleep ${sleepSec} --force`
        failed += 1
        failedGameIds.push(gameId)
        continue
      }
    } finally {
      const elapsedGame = Date.now() - startedGame
      console.log(
        `[phase4] ${i + 1}/${gameIds.length} gameId=${gameId} end   ${nowIsoLocal()} (elapsed ${formatMs(elapsedGame)})`
      )
    }
  }

  console.log(
    `[phase4] year=${year} targets=${gameIds.length} restored=${restored} merged=${merged} ` +
      `skippedRestore=${skippedRestore} skippedMerge=${skippedMerge} skippedCancelled=${skippedCancelled} failed=${failed}`,
  )
  const reportPath = path.join(root, "_data", "scraped_games", "_meta", `phase4_last_run_${year}.json`)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  writeJsonFileWithRetrySync(reportPath, {
    schemaVersion: "phase4-last-run-v1",
    year,
    generatedAt: new Date().toISOString(),
    targetGameIds: gameIds,
    failedGameIds: [...new Set(failedGameIds)],
    restored,
    merged,
    skippedRestore,
    skippedMerge,
    skippedCancelled,
    games: gameReports,
    recommendedNextCommand:
      failedGameIds.length > 0
        ? `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --game-ids ${[...new Set(failedGameIds)].join(",")} --sleep ${sleepSec} --force`
        : "",
  })
  if (failed > 0) {
    console.error(`[phase4] ${failed} game(s) failed — canonical の pitchEvents が未更新の可能性があります`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(String(e?.stack ?? e))
  process.exit(1)
})
