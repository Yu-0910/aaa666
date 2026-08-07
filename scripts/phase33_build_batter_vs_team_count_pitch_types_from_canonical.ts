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

import { mkdirSync, readdirSync, unlinkSync } from "fs"
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
      year = args[i + 1]!.trim()
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

function resolvePlayerNameJa(yahooBatterId: string): string | undefined {
  const roster = findRosterPlayerByPublicId(yahooBatterId)
  const name = roster?.name_ja?.trim()
  return name || undefined
}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function collectBatterIdsInGame(doc: { domain?: { plateAppearances?: Array<{ yahooBatterId?: string }> } }): Set<string> {
  const ids = new Set<string>()
  for (const pa of doc.domain?.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (bid) ids.add(bid)
  }
  return ids
}

function collectAffectedBatterIds(
  docs: Parameters<typeof accumulateAllBattersVsTeamCountPitchTypesFromDocs>[0],
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

function gameHasTargetBatter(
  doc: Parameters<typeof accumulateAllBattersVsTeamCountPitchTypesFromDocs>[0][number],
  targetYahooIdSet: Set<string> | null,
): boolean {
  if (!targetYahooIdSet) return true
  for (const bid of collectBatterIdsInGame(doc)) {
    if (targetYahooIdSet.has(bid)) return true
  }
  return false
}

function main(): void {
  const { year, from, to, onlyYahooIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase33] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error("[phase33] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

  let targetYahooIds = onlyYahooIds ? [...onlyYahooIds] : null
  if (!targetYahooIds && (from || to)) {
    targetYahooIds = collectAffectedBatterIds(docs, from, to)
    if (targetYahooIds.length === 0) {
      console.log(
        `[phase33] no affected batters for range ${from ?? "(start)"}..${to ?? "(end)"} in year=${year}; nothing to write`,
      )
      return
    }
  }
  const targetYahooIdSet = targetYahooIds ? new Set(targetYahooIds) : null

  const stadiumByGameId = loadScheduleStadiumByGameId(year, projectRoot)
  const inputDocs = targetYahooIdSet
    ? docs.filter((doc) => gameHasTargetBatter(doc, targetYahooIdSet))
    : docs
  const byBatter = accumulateAllBattersVsTeamCountPitchTypesFromDocs(inputDocs, stadiumByGameId)

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
      const yid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
      if (targetYahooIds && !targetYahooIds.includes(yid)) continue
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const gameIds = docs.map((d) => String(d.gameId ?? "").trim()).filter(Boolean).sort()
  const batterIds = (targetYahooIds ?? [...byBatter.keys()]).slice().sort()
  let written = 0

  for (const bid of batterIds) {
    const acc = byBatter.get(bid)
    if (!acc) continue
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
    writeJsonFileWithRetrySync(join(outDir, `yahoo_${bid}.json`), payload)
    written++
  }

  console.log(
    `[phase33] wrote ${written} files (${batterIds.length} batters with pitchEvents) → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
