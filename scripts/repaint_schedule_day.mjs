/**
 * 指定した開催日（JST の YYYY-MM-DD）の試合だけ、スポナビ raw → canonical まで塗り直す。
 * 用途: 特定日（例: 2026-05-10）の CSR 空テーブル・薄い canonical の復旧。
 *
 * 試合 ID の出所（既定）:
 *   `_data/sportsnavi_schedule_snapshots/by_date/{--date}.json` の `gameIds`
 * 上書き:
 *   `--game-ids id1,id2,...` でスナップショットを使わない
 *
 * 段階実行:
 *   `--stage phase0` | `phase1` | `phase2` | `phase2repair` | `phase2b` | `phase4` | `backfill` | `validate` | `all`
 *   `all` … phase0 → phase1 → phase2 →（任意）phase2repair → phase2b →（任意）phase4 →（任意）backfill →（任意）validate
 *
 * 例（5/10 を一括）:
 *   node scripts/repaint_schedule_day.mjs --year 2026 --date 2026-05-10
 *   node scripts/repaint_schedule_day.mjs --year 2026 --date 2026-05-10 --skip-phase0
 *   node scripts/repaint_schedule_day.mjs --year 2026 --date 2026-05-10 --stage phase2b
 *   node scripts/repaint_schedule_day.mjs --year 2026 --date 2026-05-10 --with-incomplete-scan
 *     … Phase2 のあとに `--only-incomplete`（シーズン全試合スキャン・重い）を追加
 *
 * 注意:
 * - 作業ディレクトリはリポジトリルート（`npm run` と同様）であること。
 * - Phase4（一球）はネット負荷が高い。`--skip-yahoo` で省略可。
 */

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const STAGES = [
  "phase0",
  "phase1",
  "phase2",
  "phase2repair",
  "phase2b",
  "phase4",
  "backfill",
  "validate",
  "all",
]

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const dateIdx = argv.indexOf("--date")
  const stageIdx = argv.indexOf("--stage")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const date = dateIdx >= 0 ? String(argv[dateIdx + 1] ?? "").trim() : ""
  let stage = "all"
  if (stageIdx >= 0) {
    const stageRaw = String(argv[stageIdx + 1] ?? "").trim().toLowerCase()
    if (!STAGES.includes(stageRaw)) {
      console.error("[repaint] 不明な --stage:", stageRaw, "（許可:", STAGES.join(", "), "）")
      process.exit(1)
    }
    stage = stageRaw
  }
  const gameIdsRaw = gameIdsIdx >= 0 ? String(argv[gameIdsIdx + 1] ?? "").trim() : ""
  const gameIdsOverride = gameIdsRaw
    ? gameIdsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  return {
    year,
    date,
    stage,
    gameIdsOverride,
    skipPhase0: argv.includes("--skip-phase0"),
    withIncompleteScan: argv.includes("--with-incomplete-scan"),
    skipYahoo: argv.includes("--skip-yahoo"),
    skipValidate: argv.includes("--skip-validate"),
    dryRun: argv.includes("--dry-run"),
  }
}

function readGameIdsFromSnapshot(date) {
  const snapPath = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date", `${date}.json`)
  if (!fs.existsSync(snapPath)) {
    console.error("[repaint] スナップショットがありません:", snapPath)
    return null
  }
  let snap
  try {
    snap = JSON.parse(fs.readFileSync(snapPath, "utf8"))
  } catch (e) {
    console.error("[repaint] JSON が読めません:", snapPath, e)
    return null
  }
  const okV1 = snap?.schemaVersion === "sportsnavi-schedule-day-v1"
  const okV2 = snap?.schemaVersion === "sportsnavi-schedule-day-v2"
  const okV3 = snap?.schemaVersion === "sportsnavi-schedule-day-v3"
  if ((!okV1 && !okV2 && !okV3) || !Array.isArray(snap.gameIds)) {
    console.error("[repaint] スナップショット形式が不正です:", snapPath)
    return null
  }
  return snap.gameIds.map((x) => String(x).trim()).filter(Boolean)
}

const args = parseArgs(process.argv.slice(2))

function run(label, cmd) {
  console.log(`\n[repaint] ─── ${label} ───\n${cmd}\n`)
  if (args.dryRun) return
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  })
}

function resolveGameIds() {
  if (args.gameIdsOverride && args.gameIdsOverride.length > 0) {
    return args.gameIdsOverride
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    console.error("[repaint] `--date YYYY-MM-DD` を指定するか、`--game-ids` を渡してください。")
    process.exit(1)
  }
  const ids = readGameIdsFromSnapshot(args.date)
  if (!ids) process.exit(1)
  if (ids.length === 0) {
    console.log("[repaint] gameIds が空です。この日は試合なしとして終了します。")
    process.exit(0)
  }
  if (ids.length > 24) {
    console.warn(`[repaint] 警告: ${ids.length} 試合（多すぎる可能性）。続行しますか… 10秒で中止なら Ctrl+C`)
  }
  return ids
}

const gameIds = resolveGameIds()
const csv = gameIds.join(",")
const { year, date, stage } = args

function runPhase0() {
  if (args.skipPhase0) {
    console.log("[repaint] --skip-phase0 のため Phase0 をスキップ")
    return
  }
  if (!args.date) {
    console.warn("[repaint] --date が無いため Phase0 をスキップ（--game-ids のみでは日程 URL を組めません）")
    return
  }
  run(
    "Phase0 日程（当該日のみ・merge）",
    `npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year ${year} --from ${date} --to ${date} --merge`,
  )
}

function runPhase1() {
  run(
    "Phase1 試合トップ raw（指定 gameId のみ・--force）",
    `node scripts/phase1_fetch_sportsnavi_games.mjs --year ${year} --game-ids ${csv} --force`,
  )
}

function runPhase2() {
  run(
    "Phase2 stats/text raw（指定 gameId のみ・--force）",
    `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --game-ids ${csv} --force`,
  )
}

function runPhase2Repair() {
  run(
    "Phase2 repair（--only-incomplete・シーズン全体スキャン）",
    `node scripts/phase2_fetch_sportsnavi_stats_text.mjs --year ${year} --only-incomplete`,
  )
}

function runPhase2b() {
  run(
    "Phase2b canonical（指定 gameId のみ・--force）",
    `node scripts/phase2_build_canonical_from_raw_sportsnavi.mjs --year ${year} --game-ids ${csv} --force`,
  )
}

function runPhase4() {
  if (args.skipYahoo) {
    console.log("[repaint] --skip-yahoo のため Phase4 をスキップ")
    return
  }
  if (!args.date) {
    console.warn("[repaint] --date が無いため Phase4 をスキップ（日付範囲が必要です）")
    return
  }
  run(
    "Phase4 一球マージ（当該日の from/to）",
    `node scripts/phase4_yahoo_pitch_by_pitch_pipeline.mjs --year ${year} --from-date ${date} --to-date ${date} --sleep 1.2`,
  )
}

function runBackfill() {
  if (args.skipYahoo) {
    console.log("[repaint] --skip-yahoo のため resultSummaryJa backfill をスキップ")
    return
  }
  run(
    "実況テキストから resultSummaryJa 再補完",
    "npx tsx scripts/backfill_plate_appearances_from_text_play_by_play.ts",
  )
}

function runValidate() {
  if (args.skipValidate) {
    console.log("[repaint] --skip-validate のため検証をスキップ")
    return
  }
  run(
    "検証: canonical 打撃が皆無の試合がないこと",
    `npx tsx scripts/validate_phase2_canonical_nonempty.ts --year ${year} --fail`,
  )
}

console.log(
  `[repaint] year=${year} date=${date || "(game-ids only)"} games=${gameIds.length} stage=${stage} dryRun=${args.dryRun}`,
)

if (stage === "all") {
  runPhase0()
  runPhase1()
  runPhase2()
  if (args.withIncompleteScan) runPhase2Repair()
  runPhase2b()
  runPhase4()
  runBackfill()
  runValidate()
} else if (stage === "phase0") {
  runPhase0()
} else if (stage === "phase1") {
  runPhase1()
} else if (stage === "phase2") {
  runPhase2()
} else if (stage === "phase2repair") {
  runPhase2Repair()
} else if (stage === "phase2b") {
  runPhase2b()
} else if (stage === "phase4") {
  runPhase4()
} else if (stage === "backfill") {
  runBackfill()
} else if (stage === "validate") {
  runValidate()
}

console.log("\n[repaint] 完了。\n")
