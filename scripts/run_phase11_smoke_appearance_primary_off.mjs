/**
 * 旧 zip オフ: `TOPPAGE_APPEARANCE_PRIMARY=0` を付与した子プロセスで Phase 11 を実行する。
 * 既定はスモーク用 3 打者のみ（計画メモどおり）。
 *
 *   npm run smoke:phase11:zip-off
 *   npm run smoke:phase11:zip-off -- --only-yahoo-ids 1000150,1100082
 *   npm run smoke:phase11:zip-off -- --year 2026 --only-yahoo-ids ...
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs")
const scriptPath = path.join(root, "scripts", "phase11_build_season_stats_from_canonical.ts")

const passthrough = process.argv.slice(2)
const extraArgs =
  passthrough.length > 0 ? passthrough : ["--year", "2026", "--only-yahoo-ids", "1000150,1100082,1900041"]

if (!fs.existsSync(tsxCli)) {
  console.error("[smoke:zip-off] tsx が見つかりません:", tsxCli)
  process.exit(1)
}

const env = {
  ...process.env,
  TOPPAGE_APPEARANCE_PRIMARY: "0",
}

const nodeArgs = [tsxCli, scriptPath, ...extraArgs]

console.log("[smoke:zip-off] TOPPAGE_APPEARANCE_PRIMARY=0 で Phase 11 を実行します")
console.log("[smoke:zip-off] >", process.execPath, nodeArgs.map((a) => (a.startsWith(root) ? path.relative(root, a) : a)).join(" "))

const r = spawnSync(process.execPath, nodeArgs, {
  cwd: root,
  stdio: "inherit",
  env,
  shell: false,
})

if (r.status !== 0 && r.status != null) {
  process.exit(r.status)
}
if (r.error) {
  console.error(r.error)
  process.exit(1)
}
