/**
 * Phase 3: normalized v0 JSON → canonical v1 を生成し冪等 ingest
 *
 * npx tsx scripts/ingest_yahoo_canonical.ts
 * npx tsx scripts/ingest_yahoo_canonical.ts --game-id 2021038624
 */

import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { normalizedGameV0Schema } from "../lib/yahooGame/normalizedV0"
import { buildCanonicalFromNormalizedV0 } from "../lib/yahooGame/buildCanonical"
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

function main(): void {
  const { gameId } = parseArgs()
  const normalizedPath = join(projectRoot, "_data", "scraped_games", `${gameId}.normalized.json`)
  const raw = readFileSync(normalizedPath, "utf8")
  const parsed = JSON.parse(raw)
  const norm = normalizedGameV0Schema.parse(parsed)
  const canonical = buildCanonicalFromNormalizedV0(norm)
  const { action, path } = ingestCanonicalGame(projectRoot, canonical)
  console.log(`ingest: ${action} → ${path}`)
  console.log(
    `  fingerprint=${canonical.sourceCompositeFingerprint.slice(0, 16)}… battingLines=${canonical.domain.battingLines.length} pitchingLines=${canonical.domain.pitchingLines.length}`
  )
}

main()
