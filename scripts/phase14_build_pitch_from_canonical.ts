/**
 * Phase 14: canonical の pitchEvents から打者別に球種・ゾーン・ストレート球速帯を集計する。
 *
 * 出力:
 *   _data/derived/player_pitch_from_canonical/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase14_build_pitch_from_canonical.ts --year 2026
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  aggregateByPitchType,
  aggregateByZone,
  aggregateSpeedBandsStraightOnly,
  canonicalPlateAppearanceToPilot,
  type PlateAppearancePitches,
} from "../lib/pitchDetailsPilot"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function loadCanonicalFiles(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalFiles()
  if (docs.length === 0) {
    console.error("[phase14] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byBatter = new Map<string, PlateAppearancePitches[]>()

  for (const doc of docs) {
    const gameId = doc.gameId
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const block = canonicalPlateAppearanceToPilot(gameId, pa)
      if (!block) continue
      const arr = byBatter.get(bid) ?? []
      arr.push(block)
      byBatter.set(bid, arr)
    }
  }

  const outDir = join(projectRoot, "_data", "derived", "player_pitch_from_canonical", year)
  mkdirSync(outDir, { recursive: true })

  for (const f of readdirSync(outDir)) {
    if (f.startsWith("yahoo_") && f.endsWith(".json")) {
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const batterIds = [...byBatter.keys()].sort()
  for (const bid of batterIds) {
    const pas = byBatter.get(bid)!
    const pitchTypeStats = aggregateByPitchType(pas)
    const zoneStats = aggregateByZone(pas)
    const speedBandStats = aggregateSpeedBandsStraightOnly(pas)

    const payload = {
      schemaVersion: "phase14-player-pitch-from-canonical-v0",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      pitchTypeStats,
      zoneStats,
      speedBandStats,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase14] wrote ${batterIds.length} files → ${outDir}`)
}

main()
