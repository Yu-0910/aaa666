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
 *     … byDate 上でその期間（両端含む）の gameId のみ処理
 *
 * 注意:
 * - ネットワーク負荷が大きい（打席ごとにアクセス）。途中停止しても再実行で続きから再開できる。
 * - **空の `pitchRows` だけの derived は「未完了」**（docs/data_operation_rules.md §一括取得 2026-05）。
 *   存在しても restore を再実行する（`--force` なし・キャッシュ HTML 利用可）。
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"

const MERGE_STAMP_SCHEMA = "phase4-yahoo-phase10-merge-stamp-v1"
// merge ロジックを変えたら bump（stamp を無効化して再マージさせる）
const MERGE_STAMP_MERGE_VERSION = "mergePhase10IntoCanonical@2026-05-08"

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
  const force = argv.includes("--force")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const limitRaw = limitIdx >= 0 ? String(argv[limitIdx + 1] ?? "").trim() : ""
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : 0
  const sleepRaw = sleepIdx >= 0 ? String(argv[sleepIdx + 1] ?? "").trim() : ""
  const sleepSec = sleepRaw ? Math.max(0.0, parseFloat(sleepRaw) || 0) : 1.2
  const toDate = toDateIdx >= 0 ? String(argv[toDateIdx + 1] ?? "").trim() : ""
  const fromDate = fromDateIdx >= 0 ? String(argv[fromDateIdx + 1] ?? "").trim() : ""
  return { year, limit, sleepSec, force, toDate, fromDate }
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

/** `pitchRows` 件数。ファイル無し・壊れ JSON は 0。 */
function phase10PitchRowCount(phase10Path) {
  if (!fileExists(phase10Path)) return 0
  try {
    const j = readJson(phase10Path)
    return Array.isArray(j?.pitchRows) ? j.pitchRows.length : 0
  } catch {
    return 0
  }
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

function shouldSkipMergeByStamp(stampPath, expected) {
  const t = safeReadText(stampPath).trim()
  if (!t) return false
  try {
    const j = JSON.parse(t)
    if (j?.schemaVersion !== MERGE_STAMP_SCHEMA) return false
    return (
      j?.mergeVersion === expected.mergeVersion &&
      j?.phase10RowsFingerprint === expected.phase10RowsFingerprint &&
      j?.gameId === expected.gameId
    )
  } catch {
    // 旧 stamp（単なる timestamp）等は再マージ対象にする
    return false
  }
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
  const { year, limit, sleepSec, force, toDate, fromDate } = parseArgs(process.argv.slice(2))
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
  let failed = 0

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
    if (!fileExists(canonPath)) {
      console.warn(`[phase4] skip ${gameId}: missing canonical`)
      failed += 1
      continue
    }

    // restore（空 pitchRows の derived は未完了扱い → 削除して再実行）
    const existingRows = phase10PitchRowCount(phase10Path)
    if (!force && existingRows > 0) {
      skippedRestore += 1
      console.log(`[phase4] restore: skipped (pitchRows=${existingRows})`)
    } else {
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
        run(
          "python",
          [
            path.join("scripts", "run_yahoo_phase10_restore.py"),
            "--game-id",
            gameId,
            "--text-from-raw",
            "--sleep",
            String(sleepSec),
            ...(force ? ["--force"] : []),
          ],
          `restore:${gameId}`
        )
        restored += 1
        console.log(`[phase4] restore: ok`)
      } catch (e) {
        console.warn(`[phase4] restore failed for ${gameId}: ${String(e?.message ?? e)}`)
        failed += 1
        continue
      }
    }

    // merge
    const stampPath = path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_merged.stamp`)
    if (!force && fileExists(stampPath) && fileExists(phase10Path)) {
      try {
        const restoredJson = readJson(phase10Path)
        const rows = Array.isArray(restoredJson?.rows) ? restoredJson.rows : []
        const fp = computePhase10RowsFingerprint(rows)
        if (
          shouldSkipMergeByStamp(stampPath, {
            gameId,
            mergeVersion: MERGE_STAMP_MERGE_VERSION,
            phase10RowsFingerprint: fp,
          })
        ) {
          skippedMerge += 1
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
      run(npmCmd, ["run", "-s", "phase4:merge:phase10", "--", "--game-id", gameId], `merge:${gameId}`)
      let phase10RowsFingerprint = ""
      try {
        const restoredJson = readJson(phase10Path)
        const rows = Array.isArray(restoredJson?.rows) ? restoredJson.rows : []
        phase10RowsFingerprint = computePhase10RowsFingerprint(rows)
      } catch {}
      fs.writeFileSync(
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
        "utf8",
      )
      merged += 1
      console.log(`[phase4] merge: ok`)
    } catch (e) {
      console.warn(`[phase4] merge failed for ${gameId}: ${String(e?.message ?? e)}`)
      failed += 1
      continue
    } finally {
      const elapsedGame = Date.now() - startedGame
      console.log(
        `[phase4] ${i + 1}/${gameIds.length} gameId=${gameId} end   ${nowIsoLocal()} (elapsed ${formatMs(elapsedGame)})`
      )
    }
  }

  console.log(
    `[phase4] year=${year} targets=${gameIds.length} restored=${restored} merged=${merged} ` +
      `skippedRestore=${skippedRestore} skippedMerge=${skippedMerge} failed=${failed}`
  )
}

main().catch((e) => {
  console.error(String(e?.stack ?? e))
  process.exit(1)
})

