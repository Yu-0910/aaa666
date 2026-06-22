/**
 * Phase 33: canonical から打者×対戦球団×カウント別球種派生 JSON を生成する。
 *
 * 出力:
 *   _data/derived/player_batter_vs_team_count_pitch_types/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase33_build_batter_vs_team_count_pitch_types_from_canonical.ts --year 2026
 *   npm run phase33:build:batter-vs-team-count-pitch-types
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION,
} from "../lib/batterVsTeamCountPitchTypesTypes"
import { loadScheduleStadiumByGameId } from "../lib/loadScheduleStadiumByGameId"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import {
  accumulateAllBattersVsTeamCountPitchTypesFromDocs,
  buildBatterVsTeamCountPitchTypesTeamBlocks,
} from "../lib/yahooGame/batterVsTeamCountPitchTypesAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!.trim()
      i++
    }
  }
  return { year }
}

function resolvePlayerNameJa(yahooBatterId: string): string | undefined {
  const roster = findRosterPlayerByPublicId(yahooBatterId)
  const name = roster?.name_ja?.trim()
  return name || undefined
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase33] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const stadiumByGameId = loadScheduleStadiumByGameId(year, projectRoot)
  const byBatter = accumulateAllBattersVsTeamCountPitchTypesFromDocs(docs, stadiumByGameId)

  const outDir = join(
    projectRoot,
    "_data",
    "derived",
    "player_batter_vs_team_count_pitch_types",
    year,
  )
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

  const gameIds = docs.map((d) => String(d.gameId ?? "").trim()).filter(Boolean).sort()
  const batterIds = [...byBatter.keys()].sort()
  let written = 0

  for (const bid of batterIds) {
    const acc = byBatter.get(bid)!
    const teams = buildBatterVsTeamCountPitchTypesTeamBlocks(acc, 0)
    if (teams.length === 0) continue

    const payload = {
      schemaVersion: BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION,
      seasonYear: year,
      yahooBatterId: bid,
      playerName: resolvePlayerNameJa(bid),
      generatedAt: new Date().toISOString(),
      source: {
        canonicalGames: gameIds,
        note:
          "打者×対戦球団×カウント別球種。一球帰属は countBeforePitchAtIndex（Phase 32 同一）。四球寄せなし。",
      },
      teams,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
    written++
  }

  console.log(
    `[phase33] wrote ${written} files (${batterIds.length} batters with pitchEvents) → ${outDir}`,
  )
}

main()
