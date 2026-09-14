import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

function gitText(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

const repoRoot = gitText(["rev-parse", "--show-toplevel"])
const entries = readdirSync(repoRoot, { withFileTypes: true })
const blocked = entries
  .filter((entry) => entry.name.startsWith(".codex-deploy-"))
  .map((entry) => {
    const fullPath = path.join(repoRoot, entry.name)
    const kind = entry.isDirectory()
      ? "directory"
      : entry.isFile()
        ? "file"
        : statSync(fullPath).isDirectory()
          ? "directory"
          : "entry"
    return { kind, name: entry.name }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

if (blocked.length === 0) {
  console.log("guard:no-deploy-artifacts passed.")
  process.exit(0)
}

console.error("[no-deploy-artifacts] repo-root deploy artifacts are present.")
console.error("[no-deploy-artifacts] Move deploy work to .codex-worktrees/ or an external temp directory, then delete these artifacts.")
for (const item of blocked.slice(0, 20)) {
  console.error(`  ${item.kind}: ${item.name}`)
}
if (blocked.length > 20) {
  console.error(`  ...and ${blocked.length - 20} more`)
}
process.exit(1)
