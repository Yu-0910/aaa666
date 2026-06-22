/**
 * 投手派生の最小セット（ランキングまで含む場合は daily 派生ブロックを参照）。
 * 順序: poc1 → phase6（byCatcher）→ phase19
 * 詳細: docs/data_operation_rules.md §投手個人ページ派生
 *   node scripts/run_phase3_pitching_pipeline.mjs
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function run(script) {
  const r = spawnSync("npm.cmd", ["run", script], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run("phase:pitcher-poc1")
run("phase6:build:pitcher-catcher-splits")
run("phase19:build:pitching-rankings")
