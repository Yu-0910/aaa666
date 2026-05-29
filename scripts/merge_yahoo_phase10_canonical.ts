/**
 * Phase 10: derived/{gameId}_phase10_restored.json を canonical にマージして冪等 ingest
 *
 * npx tsx scripts/merge_yahoo_phase10_canonical.ts --game-id 2021038624
 *
 * マージ後、`raw_sportsnavi_text` がある場合は `npm run enrich:text-play-headlines` で
 * 全プレーの一球上段見出し（playHeadlineJa）を canonical に載せる（日次パイプライン／phase3 先頭で実行）。
 */

import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { normalizedGameV0Schema } from "../lib/yahooGame/normalizedV0"
import { buildCanonicalFromNormalizedV0 } from "../lib/yahooGame/buildCanonical"
import { mergePhase10IntoCanonical, type Phase10PitchRow } from "../lib/yahooGame/mergePhase10FromPitchRows"
import { ingestCanonicalGame } from "../lib/yahooGame/persistCanonical"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { gameId: string } {
  const args = process.argv.slice(2)
  let gameId = "2021038624"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--game-id" && args[i + 1]) {
      gameId = args[i + 1]
      i++
    }
  }
  return { gameId }
}

type Phase10File = {
  schemaVersion?: string
  gameId?: string
  pitchRows?: Phase10PitchRow[]
  missingOrPartial?: string[]
}

function main(): void {
  const { gameId } = parseArgs()
  const normalizedPath = join(projectRoot, "_data", "scraped_games", `${gameId}.normalized.json`)
  const phase10Path = join(projectRoot, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)

  if (!existsSync(phase10Path)) {
    console.error(`[merge_yahoo_phase10] missing: ${phase10Path}`)
    console.error("  先に: python scripts/run_yahoo_phase10_restore.py --game-id", gameId)
    process.exit(1)
  }
  if (!existsSync(normalizedPath)) {
    console.error(`[merge_yahoo_phase10] missing: ${normalizedPath}`)
    process.exit(1)
  }

  const raw = readFileSync(normalizedPath, "utf8")
  const norm = normalizedGameV0Schema.parse(JSON.parse(raw))
  const base = buildCanonicalFromNormalizedV0(norm)

  const phase10Raw = JSON.parse(readFileSync(phase10Path, "utf8")) as Phase10File
  const rows = Array.isArray(phase10Raw.pitchRows) ? phase10Raw.pitchRows : []
  const missing = Array.isArray(phase10Raw.missingOrPartial) ? phase10Raw.missingOrPartial : []

  const merged = mergePhase10IntoCanonical(base, rows, missing)
  const { action, path } = ingestCanonicalGame(projectRoot, merged)
  console.log(`ingest: ${action} → ${path}`)
  console.log(
    `  eventsFp=${(merged.eventsFingerprint ?? "").slice(0, 16)}… plateAppearances=${merged.domain.plateAppearances.length} pitchEvents=${merged.domain.pitchEvents.length}`,
  )
}

main()
