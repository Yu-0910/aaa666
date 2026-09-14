import { rmSync, readdirSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const apply = process.argv.includes("--apply")

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim()
const repoRootFull = path.resolve(repoRoot)

const targets = readdirSync(repoRoot, { withFileTypes: true })
  .filter((entry) => entry.name.startsWith(".codex-deploy-"))
  .map((entry) => ({
    name: entry.name,
    fullPath: path.resolve(repoRoot, entry.name),
    type: entry.isDirectory() ? "directory" : "file",
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

for (const target of targets) {
  const rel = path.relative(repoRootFull, target.fullPath)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to remove outside repo: ${target.fullPath}`)
  }
}

if (targets.length === 0) {
  console.log("No .codex-deploy-* artifacts found.")
  process.exit(0)
}

console.log(`${apply ? "Removing" : "Would remove"} ${targets.length} .codex-deploy-* artifact(s):`)
for (const target of targets) {
  console.log(`  ${target.type}: ${target.name}`)
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply to delete these artifacts.")
  process.exit(0)
}

for (const target of targets) {
  rmSync(target.fullPath, { recursive: true, force: true })
}
console.log("Deploy artifacts removed.")
