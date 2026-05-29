/**
 * Phase 14: canonical の pitchEvents から打者別に球種・ゾーン・ストレート球速帯を集計する。
 *
 * ストレート球速帯（整数 km/h）は `lib/straightSpeedBands.ts` と同一（161〜 / 〜160 / 〜155 / …）。
 *
 * 出力:
 *   _data/derived/player_pitch_from_canonical/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase14_build_pitch_from_canonical.ts --year 2026
 *   または npm run phase14:build:pitch
 *
 * 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み canonical）。
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  aggregateByPitchType,
  aggregateByZone,
  aggregateSpeedBandsStraightOnly,
  canonicalPlateAppearanceToPilot,
  PHASE14_SPEED_BAND_STATS_FIELD_JA,
  type PlateAppearancePitches,
} from "../lib/pitchDetailsPilot"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { pickResultSummaryJaFromPitchEvents } from "../lib/yahooGame/mergePhase10FromPitchRows"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

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

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
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
      const resolved = plateAppearanceResolvedResultText(doc, pa).trim()
      const settlement =
        resolved ||
        pickResultSummaryJaFromPitchEvents(pa.pitchEvents) ||
        (pa.resultSummaryJa ?? "").trim() ||
        ""
      const block = canonicalPlateAppearanceToPilot(gameId, pa, {
        settlementResult: settlement || undefined,
      })
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
      schemaVersion: "phase14-player-pitch-from-canonical-v1",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      speedBandStatsFieldJa: PHASE14_SPEED_BAND_STATS_FIELD_JA,
      pitchTypeStats,
      zoneStats,
      speedBandStats,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase14] wrote ${batterIds.length} files → ${outDir}`)
}

main()
