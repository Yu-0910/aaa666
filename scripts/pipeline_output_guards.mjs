import fs from "node:fs"
import path from "node:path"

export function assertPipelineRequiredFiles(root) {
  const required = [
    "scripts/validate_standings_window_freshness.ts",
    "scripts/phase36_build_top_probables.ts",
    "scripts/display_r2_upload.mjs",
    "scripts/verify_display_publish_after_upload.mjs",
  ]
  const missing = required.filter(file => !fs.existsSync(path.join(root, file)))
  if (missing.length) throw new Error(`Pipeline required files missing: ${missing.join(", ")}`)
}

export function assertTopProbablesFresh(root, year, asOfDate) {
  const file = path.join(root, "public", "data", "top-probables", year, "current.json")
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"))
  const generatedAt = Date.parse(snapshot.generatedAt)
  if (snapshot.schemaVersion !== "top-probables-v1" || snapshot.seasonYear !== year ||
      snapshot.asOfDateJst !== asOfDate || !Number.isFinite(generatedAt) ||
      !Array.isArray(snapshot.cards)) {
    throw new Error(`Top probables output is stale or invalid: expected ${year}/${asOfDate}, got ${snapshot.seasonYear}/${snapshot.asOfDateJst}`)
  }
  return snapshot
}
