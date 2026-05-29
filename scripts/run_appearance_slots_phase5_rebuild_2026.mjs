/**
 * Phase 5: appearance_slots 集計で 2026 打撃派生＋ランキングを一括再生成。
 *
 *   npm run appearance-slots:phase5:rebuild-2026
 *   npm run appearance-slots:phase5:rebuild-2026 -- --skip-backup
 *
 * Phase11 直後に validate:appearance-slots-vs-line-ab:fail（成績表打数列 vs 末尾スロット）。
 * 詳細: docs/data_operation_rules.md §出場成績 HTML のパースと打数整合
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const skipBackup = process.argv.includes("--skip-backup")

const ENV = { TOPPAGE_BATTING_SEASON_AGG: "appearance_slots" }

function run(label, cmd, args) {
  console.log(`\n[appearance-slots:phase5] ${label}\n> ${cmd} ${args.join(" ")}\n`)
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...ENV },
  })
  if (r.status !== 0) {
    console.error(`[appearance-slots:phase5] failed: ${label}`)
    process.exit(r.status ?? 1)
  }
}

function main() {
  console.log("[appearance-slots:phase5] TOPPAGE_BATTING_SEASON_AGG=appearance_slots")
  if (!skipBackup) {
    run("Phase2 backup", "npm", ["run", "appearance-slots:phase2:backup"])
  }
  run("Phase11", "npm", ["run", "phase11:build:batting"])
  run("validate:appearance-slots-vs-line-ab", "npm", ["run", "validate:appearance-slots-vs-line-ab:fail"])
  run("verify:cs-runner-events-appearance-slots", "npm", ["run", "verify:cs-runner-events-appearance-slots"])
  run("Phase13 context (vs_team / stadium / home_away)", "npm", ["run", "phase13:build:context"])
  run("validate:phase13-context-vs-phase11", "npm", ["run", "validate:phase13-context-vs-phase11:fail"])
  run("Phase15 splits", "npm", ["run", "phase15:build:batting-splits"])
  run("Phase12 rankings", "npm", ["run", "phase12:build:rankings"])
  run("validate phase11 vs phase12", "npm", ["run", "validate:batting-phase11-vs-phase12"])
  console.log("\n[appearance-slots:phase5] done")
}

main()
