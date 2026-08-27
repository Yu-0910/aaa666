#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import path from "node:path"

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function parseStatusLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2),
      path: line.slice(3),
    }))
}

function summarize(entries) {
  const counts = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0,
    other: 0,
  }
  for (const entry of entries) {
    const code = entry.code
    if (code === "??") counts.untracked += 1
    else if (code.includes("M")) counts.modified += 1
    else if (code.includes("A")) counts.added += 1
    else if (code.includes("D")) counts.deleted += 1
    else if (code.includes("R")) counts.renamed += 1
    else if (code.includes("C")) counts.copied += 1
    else counts.other += 1
  }
  return counts
}

function formatCounts(counts) {
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ")
}

try {
  const repoRoot = runGit(["rev-parse", "--show-toplevel"])
  const raw = runGit(["status", "--porcelain=v1", "--untracked-files=all"])
  if (!raw) process.exit(0)

  const entries = parseStatusLines(raw)
  const counts = summarize(entries)
  const preview = entries
    .slice(0, 12)
    .map((entry) => `  ${entry.code} ${entry.path}`)
    .join("\n")
  const relRoot = path.relative(repoRoot, process.cwd()) || "."

  console.error(`[clean-worktree] deploy blocked: worktree is dirty at ${relRoot}`)
  console.error(`[clean-worktree] ${formatCounts(counts)}`)
  console.error(preview)
  if (entries.length > 12) {
    console.error(`  ...and ${entries.length - 12} more`)
  }
  console.error("[clean-worktree] Use `npm run deploy:vercel:prod:clean` to deploy from the dedicated clean worktree.")
  process.exit(1)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[clean-worktree] failed: ${message}`)
  process.exit(1)
}
