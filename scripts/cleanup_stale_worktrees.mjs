import path from "node:path"
import { execFileSync } from "node:child_process"

const apply = process.argv.includes("--apply")
const keepNames = new Set(["prod"])

function git(args, cwd = repoRoot) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim()
const worktreeRoot = path.join(repoRoot, ".codex-worktrees")
const worktreeRootFull = path.resolve(worktreeRoot)

const list = git(["worktree", "list", "--porcelain"])
const worktrees = list
  .split(/\n(?=worktree )/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const lines = block.split(/\r?\n/)
    const worktreePath = lines[0]?.replace(/^worktree /, "") ?? ""
    return {
      path: worktreePath,
      name: path.basename(worktreePath),
      head: lines.find((line) => line.startsWith("HEAD "))?.replace(/^HEAD /, "") ?? "",
      branch: lines.find((line) => line.startsWith("branch "))?.replace(/^branch /, "") ?? "detached",
    }
  })

const stale = worktrees
  .filter((worktree) => {
    const relative = path.relative(worktreeRootFull, path.resolve(worktree.path))
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
  })
  .filter((worktree) => !keepNames.has(worktree.name))
  .sort((a, b) => a.name.localeCompare(b.name))

for (const worktree of stale) {
  const relative = path.relative(worktreeRootFull, path.resolve(worktree.path))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove outside .codex-worktrees: ${worktree.path}`)
  }
}

if (stale.length === 0) {
  console.log("No stale .codex-worktrees entries found.")
  process.exit(0)
}

console.log(`${apply ? "Removing" : "Would remove"} ${stale.length} stale worktree(s):`)
for (const worktree of stale) {
  console.log(`  ${worktree.name} ${worktree.head.slice(0, 9)} ${worktree.branch}`)
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply to remove these worktrees.")
  process.exit(0)
}

for (const worktree of stale) {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], worktree.path)
  if (status) {
    throw new Error(`Refusing to remove dirty worktree ${worktree.name}:\n${status}`)
  }
}

for (const worktree of stale) {
  git(["worktree", "remove", "--force", worktree.path])
}

git(["worktree", "prune"])
console.log("Stale worktrees removed.")
