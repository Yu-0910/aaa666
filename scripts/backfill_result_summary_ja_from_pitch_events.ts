/**
 * canonical の各打席で、`pitchEvents[].resultJa` から §6a・§6b に従い `resultSummaryJa` を再計算して上書きする。
 * `mergePhase10IntoCanonical` と同じロジック（`pickResultSummaryJaFromPitchEvents`）。
 *
 *   npx tsx scripts/backfill_result_summary_ja_from_pitch_events.ts
 *   npx tsx scripts/backfill_result_summary_ja_from_pitch_events.ts --game-id 2021038624
 */

import { createHash } from "crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { applyCarryForwardPitcherForIntentionalWalks } from "../lib/yahooGame/carryForwardPitcherForIntentionalWalk"
import { pickResultSummaryJaFromPitchEvents } from "../lib/yahooGame/mergePhase10FromPitchRows"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"

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

function patchSummaries(pas: PlateAppearance[]): PlateAppearance[] {
  return pas.map((pa) => {
    const pe = pa.pitchEvents
    if (!pe?.length) return pa
    const next = pickResultSummaryJaFromPitchEvents(pe)
    const prev = (pa.resultSummaryJa ?? "").trim()
    const n = (next ?? "").trim()
    if (prev === n) return pa
    return { ...pa, resultSummaryJa: next }
  })
}

function processDoc(raw: string): { doc: CanonicalGameDocument; changed: boolean } {
  const prev = JSON.parse(raw) as CanonicalGameDocument
  if (prev.schemaVersion !== "yahoo-game-canonical-v1" || !prev.gameId) {
    return { doc: prev, changed: false }
  }
  const pas0 = prev.domain?.plateAppearances ?? []
  const patched = patchSummaries(pas0)
  const filled = applyCarryForwardPitcherForIntentionalWalks(patched)
  const before = JSON.stringify(pas0)
  const after = JSON.stringify(filled)
  if (before === after) {
    return { doc: prev, changed: false }
  }
  const paHash = createHash("sha256").update(after, "utf8").digest("hex")
  const evPrev = prev.eventsFingerprint ?? ""
  const eventsFingerprint = createHash("sha256")
    .update(`${evPrev}|result-summary-ja-backfill-v1|${paHash}`, "utf8")
    .digest("hex")
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
  const files = gameId ? [`${gameId}.json`] : readdirSync(dir).filter((f) => f.endsWith(".json"))
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
