/**
 * 計画 Phase 5: canonical 再ビルド → `appearance:phase3` →（手動）旧新スモーク → チェックリスト
 *
 *   npm run appearance:phase5
 *   npm run appearance:phase5 -- --skip-canonical
 *   npm run appearance:phase5 -- --game-ids 2021038624,2021038735
 *
 * `--game-ids` 省略時はゴールデン 2 試合。`--year` は phase2 のメタ用（省略時は先頭 gameId から推定）。
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const DEFAULT_GOLDEN = "2021038624,2021038735"

function parseArgs(argv) {
  const skipCanonical = argv.includes("--skip-canonical")
  const gi = argv.indexOf("--game-ids")
  const gameIds = gi >= 0 ? String(argv[gi + 1] ?? "").trim() : DEFAULT_GOLDEN
  const yi = argv.indexOf("--year")
  let year = yi >= 0 ? String(argv[yi + 1] ?? "").trim() : ""
  if (!year) {
    const first = gameIds.split(/[,\s]+/)[0]?.trim() ?? ""
    year = /^\d{4}/.test(first) ? first.slice(0, 4) : "2026"
  }
  return { skipCanonical, gameIds, year }
}

function run(label, cmd, args, extra = {}) {
  console.log(`\n[appearance:phase5] ${label}\n> ${cmd} ${args.join(" ")}\n`)
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    // Windows: npm.cmd / npx.cmd は shell 無し spawn で EINVAL (-4071) になり得る
    shell: process.platform === "win32",
    ...extra,
  })
  if (r.status !== 0 && r.status != null) {
    console.error(`\n[appearance:phase5] 失敗: ${label} (exit ${r.status})`)
    process.exit(r.status)
  }
  if (r.error) {
    console.error(`\n[appearance:phase5] 失敗: ${label}`, r.error)
    process.exit(1)
  }
}

function main() {
  const argv = process.argv.slice(2)
  const { skipCanonical, gameIds, year } = parseArgs(argv)

  console.log("[appearance:phase5] 計画書 Phase 5（標準順序）を実行します。")
  console.log(`[appearance:phase5] game-ids=${gameIds} year(meta)=${year}`)

  const rawDir = path.join(root, "_data", "scraped_games", "raw_sportsnavi")
  if (!skipCanonical && !fs.existsSync(rawDir)) {
    console.error(`[appearance:phase5] raw が無いため canonical をスキップします: ${rawDir}`)
    console.error("[appearance:phase5] 先に phase0/phase1 で raw を取得するか、意図的に --skip-canonical を付けてください。")
    process.exit(1)
  }

  if (!skipCanonical) {
    run(
      "① canonical 再ビルド（phase2）",
      "node",
      ["scripts/phase2_build_canonical_from_raw_sportsnavi.mjs", "--year", year, "--game-ids", gameIds, "--force"],
    )
  } else {
    console.log("\n[appearance:phase5] ① canonical … --skip-canonical のため省略\n")
  }

  run("② appearance:phase3（診断レポート）", "npx", ["tsx", "scripts/run_appearance_phase3_verification.ts"])

  console.log("\n[appearance:phase5] ─────────────────────────────────────────────")
  console.log("[appearance:phase5] ③ 旧新スモーク（手動・派生の退避または別出力先を推奨）")
  console.log("  PowerShell の例:")
  console.log('    npm run smoke:phase11:zip-off')
  console.log("    （既定: 2026 年・打者 ID 3 人のみ。変える場合は README 参照か `npm run smoke:phase11:zip-off -- --year 2026 --only-yahoo-ids A,B`）")
  console.log("    Remove-Item Env:\\TOPPAGE_APPEARANCE_PRIMARY -ErrorAction SilentlyContinue")
  console.log("    npm run phase11:build:batting -- --only-yahoo-ids 1000150,1100082,1900041")
  console.log("")
  console.log("[appearance:phase5] ④ チェックリスト: docs/batting_appearance_phase4_gate_checklist.md の A〜F")
  console.log("[appearance:phase5] ─────────────────────────────────────────────\n")
}

main()
