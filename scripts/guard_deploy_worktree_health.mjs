import { existsSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

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
const mainHead = git(["rev-parse", "HEAD"])

const worktreeRoot = path.join(repoRoot, ".codex-worktrees")
const prodPath = path.join(worktreeRoot, "prod")
const list = git(["worktree", "list", "--porcelain"])
const worktrees = list
  .split(/\n(?=worktree )/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const lines = block.split(/\r?\n/)
    return {
      path: lines[0]?.replace(/^worktree /, "") ?? "",
      head: lines.find((line) => line.startsWith("HEAD "))?.replace(/^HEAD /, "") ?? "",
      branch: lines.find((line) => line.startsWith("branch "))?.replace(/^branch /, "") ?? "detached",
    }
  })

const managed = worktrees.filter((worktree) => {
  const relative = path.relative(worktreeRoot, worktree.path)
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
})

console.log(`managedWorktrees=${managed.length}`)
for (const worktree of managed) {
  console.log(`  ${path.relative(worktreeRoot, worktree.path)} ${worktree.head.slice(0, 9)} ${worktree.branch}`)
}

if (!existsSync(prodPath)) {
  console.log("deploy worktree prod does not exist yet.")
  process.exit(0)
}

const status = git(["status", "--porcelain=v1", "--untracked-files=all"], prodPath)
if (status) {
  console.error("[deploy-worktree-health] .codex-worktrees/prod is dirty:")
  console.error(status)
  process.exit(1)
}

const prodHead = git(["rev-parse", "HEAD"], prodPath)
if (prodHead !== mainHead) {
  console.error("[deploy-worktree-health] .codex-worktrees/prod is not synced to main worktree HEAD.")
  console.error(`  main=${mainHead.slice(0, 9)}`)
  console.error(`  prod=${prodHead.slice(0, 9)}`)
  console.error("  Run `npm run worktree:deploy:init` to sync it.")
  process.exit(1)
}

console.log("deploy worktree prod is clean.")
console.log("deploy worktree prod is synced to main HEAD.")
