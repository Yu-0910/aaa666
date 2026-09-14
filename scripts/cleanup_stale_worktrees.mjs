import path from "node:path"
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import os from "node:os"

const apply = process.argv.includes("--apply")
const discardDirtyWithBackup = process.argv.includes("--discard-dirty-with-backup")
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

function safeStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

function backupWorktree(worktree, status) {
  const backupRoot = path.join(os.tmpdir(), `TopPage_stale_worktree_backup_${worktree.name}_${safeStamp()}`)
  mkdirSync(backupRoot, { recursive: true })
  writeFileSync(path.join(backupRoot, "status_before.txt"), status)
  writeFileSync(path.join(backupRoot, "tracked_changes.patch"), git(["diff", "--binary"], worktree.path))
  writeFileSync(path.join(backupRoot, "staged_changes.patch"), git(["diff", "--cached", "--binary"], worktree.path))

  const untrackedRaw = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: worktree.path,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const untrackedFiles = untrackedRaw.toString("utf8").split("\0").filter(Boolean)
  writeFileSync(path.join(backupRoot, "untracked_files.txt"), untrackedFiles.join("\n") + (untrackedFiles.length ? "\n" : ""))

  const untrackedRoot = path.join(backupRoot, "untracked")
  let copied = 0
  for (const file of untrackedFiles) {
    const source = path.join(worktree.path, file)
    if (!existsSync(source)) continue
    const target = path.join(untrackedRoot, file)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(source, target)
    copied += 1
  }

  return { backupRoot, untrackedFiles: untrackedFiles.length, copied }
}

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
    if (!discardDirtyWithBackup) {
      throw new Error(`Refusing to remove dirty worktree ${worktree.name}:\n${status}`)
    }
    const backup = backupWorktree(worktree, status)
    console.log(
      `Backed up dirty worktree ${worktree.name}: ${backup.backupRoot} ` +
        `(untracked=${backup.untrackedFiles}, copied=${backup.copied})`,
    )
  }
}

for (const worktree of stale) {
  git(["worktree", "remove", "--force", worktree.path])
}

git(["worktree", "prune"])
console.log("Stale worktrees removed.")
