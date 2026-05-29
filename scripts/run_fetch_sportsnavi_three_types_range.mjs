/**
 * スポナビ由来「3種」raw を日付範囲で一括取得する（不足分を埋める運用向け）。
 *
 * 1) Phase0: 日程インデックス + 日別スナップショット（--merge）
 * 2) Phase1: 試合トップ raw（raw_sportsnavi/{gameId}.html）
 * 3) Phase2: 出場成績 + テキスト速報（--only-incomplete でパース不能なものだけ再取得）
 *
 * 使い方:
 *   node scripts/run_fetch_sportsnavi_three_types_range.mjs
 *   node scripts/run_fetch_sportsnavi_three_types_range.mjs --from 2026-03-27 --to 2026-04-19 --year 2026
 *
 * その後 canonical が必要なら: npm run phase2:sportsnavi:canonical
 */

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(argv) {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : `${year}-03-27`
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : `${year}-04-19`
  return { year, from, to }
}

function run(label, command, args) {
  console.log(`\n========== ${label} ==========\n${command} ${args.join(" ")}\n`)
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
  if (r.status !== 0 && r.status != null) {
    console.error(`\n[run_fetch_three_types] failed: ${label} (exit ${r.status})`)
    process.exit(r.status)
  }
}

function main() {
  const { year, from, to } = parseArgs(process.argv.slice(2))

  run("Phase0 日程（merge）", "npx", [
    "tsx",
    "scripts/phase0_fetch_sportsnavi_schedule.ts",
    "--year",
    year,
    "--from",
    from,
    "--to",
    to,
    "--merge",
  ])

  run("Phase1 試合トップ raw", "node", ["scripts/phase1_fetch_sportsnavi_games.mjs", "--year", year])

  run("Phase2a 出場成績・テキスト（不足のみ再取得）", "node", [
    "scripts/phase2_fetch_sportsnavi_stats_text.mjs",
    "--year",
    year,
    "--only-incomplete",
  ])

  console.log(
    "\n[run_fetch_three_types] 完了。canonical 生成: npm run phase2:sportsnavi:canonical\n",
  )
}

main()
