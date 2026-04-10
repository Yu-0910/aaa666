/**
 * 既存 canonical に対し、敬遠で投手 ID が空の打席を「同一表・裏の直前打席の投手」で補完する。
 * domain.pitchEvents は plateAppearances から再構築する。
 *
 * npx tsx scripts/backfill_carry_forward_pitcher_ibb.ts
 * npx tsx scripts/backfill_carry_forward_pitcher_ibb.ts --game-id 2021038624
 */

import { createHash } from "crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { applyCarryForwardPitcherForIntentionalWalks } from "../lib/yahooGame/carryForwardPitcherForIntentionalWalk"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { gameId: string | null } {
  const args = process.argv.slice(2)
  let gameId: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--game-id" && args[i + 1]) {
      gameId = args[i + 1]
      i++
    }
  }
  return { gameId }
}

function processDoc(raw: string): { doc: CanonicalGameDocument; changed: boolean } {
  const prev = JSON.parse(raw) as CanonicalGameDocument
  if (prev.schemaVersion !== "yahoo-game-canonical-v1" || !prev.gameId) {
    return { doc: prev, changed: false }
  }
  const before = JSON.stringify(prev.domain?.plateAppearances ?? [])
  const filled = applyCarryForwardPitcherForIntentionalWalks(prev.domain?.plateAppearances ?? [])
  const after = JSON.stringify(filled)
  if (before === after) {
    return { doc: prev, changed: false }
  }
  const paHash = createHash("sha256").update(after, "utf8").digest("hex")
  const evPrev = prev.eventsFingerprint ?? ""
  const eventsFingerprint = createHash("sha256").update(`${evPrev}|ibb-carry-backfill-v1|${paHash}`, "utf8").digest("hex")
  const doc: CanonicalGameDocument = {
    ...prev,
    builtAt: new Date().toISOString(),
    eventsFingerprint,
    domain: {
      ...prev.domain,
      plateAppearances: filled,
      pitchEvents: filled.flatMap((p) => p.pitchEvents ?? []),
    },
  }
  return { doc, changed: true }
}

function main(): void {
  const { gameId } = parseArgs()
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) {
    console.error("missing:", dir)
    process.exit(1)
  }
  const files = gameId
    ? [`${gameId}.json`]
    : readdirSync(dir).filter((f) => f.endsWith(".json"))
  let n = 0
  for (const f of files) {
    const p = join(dir, f)
    if (!existsSync(p)) continue
    const raw = readFileSync(p, "utf8")
    const { doc, changed } = processDoc(raw)
    if (!changed) continue
    writeFileSync(p, JSON.stringify(doc, null, 2), "utf8")
    console.log("updated", f)
    n++
  }
  console.log(`done: ${n} file(s) changed`)
}

main()
