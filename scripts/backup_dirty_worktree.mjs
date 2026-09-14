import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

function git(args, { encoding = "utf8" } = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

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

function copyUntrackedFiles(files, backupRoot) {
  const targetRoot = path.join(backupRoot, "untracked")
  let copied = 0
  for (const file of files) {
    const source = path.join(repoRoot, file)
    const target = path.join(targetRoot, file)
    if (!existsSync(source)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(source, target)
    copied += 1
  }
  return copied
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim()

const backupRoot = path.join(os.tmpdir(), `TopPage_dirty_worktree_backup_${safeStamp()}`)
mkdirSync(backupRoot, { recursive: true })

const status = git(["status", "--short", "--untracked-files=all"])
const trackedPatch = git(["diff", "--binary"])
const stagedPatch = git(["diff", "--cached", "--binary"])
const untrackedRaw = git(["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "buffer" })
const untrackedFiles = untrackedRaw
  .toString("utf8")
  .split("\0")
  .filter(Boolean)

writeFileSync(path.join(backupRoot, "status_before.txt"), status)
writeFileSync(path.join(backupRoot, "tracked_changes.patch"), trackedPatch)
writeFileSync(path.join(backupRoot, "staged_changes.patch"), stagedPatch)
writeFileSync(path.join(backupRoot, "untracked_files.txt"), untrackedFiles.join("\n") + (untrackedFiles.length ? "\n" : ""))

const copied = copyUntrackedFiles(untrackedFiles, backupRoot)

console.log(`backup=${backupRoot}`)
console.log(`statusLines=${status ? status.trimEnd().split(/\r?\n/).length : 0}`)
console.log(`untrackedFiles=${untrackedFiles.length}`)
console.log(`copiedUntrackedFiles=${copied}`)
