#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import path from "node:path"

const args = new Set(process.argv.slice(2))
const allowData = args.has("--allow-data")
const allowUi = args.has("--allow-ui") || (!args.has("--strict") && !allowData)

const DATA_PATH_RE = /^(?:_data\/|public\/data\/|output\/|\.next\/|\.vercel\/)/
const UI_PATH_RE = /^(?:app\/|components\/|lib\/|config\/|public\/(?!data\/)|scripts\/|tests\/|docs\/|package(?:-lock)?\.json$|next\.config\.mjs$|tsconfig\.json$|postcss\.config\.mjs$|vercel\.json$)/

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd()
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

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/")
}

function classifyEntry(entry) {
  const filePath = normalizePath(entry.path.replace(/^.* -> /, ""))
  if (DATA_PATH_RE.test(filePath)) return "data"
  if (UI_PATH_RE.test(filePath)) return "ui"
  return "other"
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
  const blocked = entries.filter((entry) => {
    const kind = classifyEntry(entry)
    if (kind === "data") return !allowData
    if (kind === "ui") return !allowUi
    return true
  })

  if (blocked.length === 0) {
    const relRoot = path.relative(repoRoot, process.cwd()) || "."
    console.error(`[clean-worktree] allowed dirty worktree at ${relRoot}`)
    console.error(`[clean-worktree] policy allowUi=${allowUi} allowData=${allowData}`)
    console.error(
      entries
        .slice(0, 12)
        .map((entry) => `  ${entry.code} ${entry.path}`)
        .join("\n"),
    )
    if (entries.length > 12) {
      console.error(`  ...and ${entries.length - 12} more`)
    }
    process.exit(0)
  }

  const counts = summarize(entries)
  const preview = blocked
    .slice(0, 12)
    .map((entry) => `  ${entry.code} ${entry.path}`)
    .join("\n")
  const relRoot = path.relative(repoRoot, process.cwd()) || "."

  console.error(`[clean-worktree] deploy blocked: disallowed dirty paths at ${relRoot}`)
  console.error(`[clean-worktree] policy allowUi=${allowUi} allowData=${allowData}`)
  console.error(`[clean-worktree] ${formatCounts(counts)}`)
  console.error(preview)
  if (blocked.length > 12) {
    console.error(`  ...and ${blocked.length - 12} more blocked paths`)
  }
  console.error("[clean-worktree] Commit/stash blocked changes, or rerun with an explicit policy such as `--allow-data`.")
  process.exit(1)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[clean-worktree] failed: ${message}`)
  process.exit(1)
}
