import { execFileSync } from "node:child_process"

const args = new Set(process.argv.slice(2))
const enforce = args.has("--enforce")

const blockedTrackedPathspecs = [
  "_data/derived",
  "public/data/rankings",
  "public/data/top-leaders",
  "_data/scraped_games/raw",
  "_data/scraped_games/raw_sportsnavi",
  "_data/scraped_games/raw_sportsnavi_text",
  "_data/scraped_games/raw_sportsnavi_stats",
  "_data/scraped_games/raw_sportsnavi_score",
  "_data/scraped_games/raw_yahoo_text",
  "_data/scraped_games/_meta",
  "_data/unknown_players",
  "public/data/top-probables",
  "public/data/standings",
  "_data/scraped_games/canonical",
]

const reviewTrackedPathspecs = []

function gitLines(args) {
  const output = execFileSync("git", args, {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return output.toString("utf8")
    .split("\0")
    .map((line) => line.trim())
    .filter(Boolean)
}

function listTracked(pathspecs) {
  if (pathspecs.length === 0) return []
  return gitLines(["ls-files", "-z", "--", ...pathspecs])
}

function summarizeByTopPath(files) {
  const counts = new Map()
  for (const file of files) {
    const parts = file.split("/")
    const key = parts[0] === "public" && parts[1] === "data"
      ? parts.slice(0, 3).join("/")
      : parts[0] === "_data" && parts[1] === "scraped_games"
        ? parts.slice(0, 3).join("/")
        : parts.slice(0, 2).join("/")
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function printSummary(title, files) {
  console.log(`${title}: ${files.length}`)
  for (const [key, count] of summarizeByTopPath(files)) {
    console.log(`  ${key}: ${count}`)
  }
  if (files.length > 0) {
    console.log("  sample:")
    for (const file of files.slice(0, 20)) {
      console.log(`    ${file}`)
    }
  }
}

const blockedTracked = listTracked(blockedTrackedPathspecs)
const reviewTracked = listTracked(reviewTrackedPathspecs)

printSummary("Blocked generated tracked files", blockedTracked)
printSummary("Review-only generated tracked files", reviewTracked)

if (blockedTracked.length > 0) {
  const message = enforce
    ? "guard:no-generated-tracked failed. Remove blocked generated files from Git with git rm --cached before enforcing this guard."
    : "guard:no-generated-tracked audit found blocked generated files. Phase 3 should remove them from Git tracking."
  console.error(message)
  process.exit(enforce ? 1 : 0)
}

console.log("guard:no-generated-tracked passed.")
