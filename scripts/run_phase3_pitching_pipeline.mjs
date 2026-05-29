/**
 * PowerShell が日本語パスで化ける環境用: リポジトリ直下から npm を実行する。
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
run("phase19:build:pitching-rankings")
