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

import { mkdirSync, readdirSync, unlinkSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  aggregateByPitchType,
  aggregateByPitchTypePitcherHand,
  aggregateByZone,
  aggregateSpeedBandsStraightOnly,
  canonicalPlateAppearanceToPilot,
  PHASE14_SPEED_BAND_STATS_FIELD_JA,
  type PlateAppearancePitches,
} from "../lib/pitchDetailsPilot"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { pickResultSummaryJaFromPitchEvents } from "../lib/yahooGame/mergePhase10FromPitchRows"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; from: string | null; to: string | null; onlyYahooIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyYahooIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, from, to, onlyYahooIds }
}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function collectBatterIdsInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const pa of doc.domain.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  return ids
}

function collectAffectedBatterIds(
  docs: CanonicalGameDocument[],
  from: string | null,
  to: string | null,
): string[] {
  const ids = new Set<string>()
  for (const doc of docs) {
    const ymd = extractCanonicalGameYmd(doc)
    if (!ymd) continue
    if (from && ymd < from) continue
    if (to && ymd > to) continue
    for (const bid of collectBatterIdsInGame(doc)) ids.add(bid)
  }
  return [...ids].sort()
}

function gameHasTargetBatter(doc: CanonicalGameDocument, targetYahooIdSet: Set<string> | null): boolean {
  if (!targetYahooIdSet) return true
  for (const bid of collectBatterIdsInGame(doc)) {
    if (targetYahooIdSet.has(bid)) return true
  }
  return false
}

function main(): void {
  const { year, from, to, onlyYahooIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase14] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error("[phase14] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  let targetYahooIds = onlyYahooIds ? [...onlyYahooIds] : null
  if (!targetYahooIds && (from || to)) {
    targetYahooIds = collectAffectedBatterIds(docs, from, to)
    if (targetYahooIds.length === 0) {
      console.log(
        `[phase14] no affected batters for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }
  const targetYahooIdSet = targetYahooIds ? new Set(targetYahooIds) : null

  const byBatter = new Map<string, PlateAppearancePitches[]>()

  for (const doc of docs) {
    if (!gameHasTargetBatter(doc, targetYahooIdSet)) continue
    const gameId = doc.gameId
    for (const pa of doc.domain.plateAppearances ?? []) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      if (targetYahooIdSet && !targetYahooIdSet.has(bid)) continue
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
      const yid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
      if (targetYahooIds && !targetYahooIds.includes(yid)) continue
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const batterIds = (targetYahooIds ?? [...byBatter.keys()]).slice().sort()
  for (const bid of batterIds) {
    const pas = byBatter.get(bid)
    if (!pas || pas.length === 0) continue
    const pitchTypeStats = aggregateByPitchType(pas)
    const pitchTypeHandSplit = aggregateByPitchTypePitcherHand(pas)
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
      pitchTypeHandSplit,
      zoneStats,
      speedBandStats,
    }
    writeJsonFileWithRetrySync(join(outDir, `yahoo_${bid}.json`), payload)
  }

  console.log(
    `[phase14] wrote ${batterIds.length} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
