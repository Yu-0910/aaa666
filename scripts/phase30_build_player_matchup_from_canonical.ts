/**
 * Phase 30: canonical から選手×相手選手の対戦成績派生 JSON を生成する。
 *
 * 野手ページ: 対戦投手別（player_matchup_batting）
 * 投手ページ: 対戦打者別（player_matchup_pitching）
 *
 * 出力:
 *   _data/derived/player_matchup_batting/{year}/npb_{npbBatterId}.json
 *   _data/derived/player_matchup_pitching/{year}/npb_{npbPitcherId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase30_build_player_matchup_from_canonical.ts --year 2026
 *   npm run phase30:build:player-matchup
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import { resolveNpbPlayerIdFromPublicId } from "../lib/yahooNpbBatterIdMap"
import { battingSlashRatesFromCounts } from "../lib/battingRateFormat"
import { teamDisplayNameFromCode } from "../lib/standings/teamCodes"
import { PLAYER_MATCHUP_TEAM_ORDER } from "../lib/playerMatchupTeamOrder"
import {
  compareMatchupOpponentsByOpsDesc,
  sortMatchupTeamsByOpponentCountDesc,
} from "../lib/playerMatchupSeasonTab"
import {
  PLAYER_MATCHUP_SCHEMA_VERSION,
  type PlayerMatchupDerived,
  type PlayerMatchupOpponentRow,
  type PlayerMatchupTeamBlock,
} from "../lib/playerMatchupTypes"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type OpponentBucket = {
  opponentYahooId: string
  opponentNpbId: string
  opponentName: string
  teamCode: string
  agg: BattingSeasonAggYahoo
}

type MatchupStore = Map<string, Map<string, OpponentBucket>>

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

function cleanOutDir(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) {
    if (f.startsWith("npb_") && f.endsWith(".json")) {
      unlinkSync(join(dir, f))
    }
  }
}

function resolveDisplayName(yahooId: string, doc?: CanonicalGameDocument): string {
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.name_ja?.trim()) return roster.name_ja.trim()
  const mentioned = doc?.game?.yahooPlayersMentioned?.[yahooId]
  if (typeof mentioned === "string" && mentioned.trim()) return mentioned.trim()
  for (const line of doc?.domain?.battingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() === yahooId && line.playerNameJa?.trim()) {
      return line.playerNameJa.trim()
    }
  }
  for (const line of doc?.domain?.pitchingLines ?? []) {
    if (String(line.yahooPlayerId ?? "").trim() === yahooId && line.playerNameJa?.trim()) {
      return line.playerNameJa.trim()
    }
  }
  return yahooId
}

function resolveTeamCode(yahooId: string): string {
  const roster = findRosterPlayerByPublicId(yahooId)
  const code = String(roster?.team_code ?? "").trim()
  return code || "unknown"
}

function publicIdForOpponent(yahooId: string, npbId: string): string {
  const n = (npbId || "").trim()
  if (n) return n
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.npb_player_id?.trim()) return roster.npb_player_id.trim()
  return yahooId
}

function getOrCreateBucket(
  store: MatchupStore,
  subjectNpbId: string,
  opponentYahooId: string,
  opponentNpbId: string,
  opponentName: string,
  teamCode: string,
): OpponentBucket {
  let byOpponent = store.get(subjectNpbId)
  if (!byOpponent) {
    byOpponent = new Map()
    store.set(subjectNpbId, byOpponent)
  }
  let bucket = byOpponent.get(opponentNpbId)
  if (!bucket) {
    bucket = {
      opponentYahooId,
      opponentNpbId,
      opponentName,
      teamCode,
      agg: emptyBattingSeasonAggYahoo(),
    }
    byOpponent.set(opponentNpbId, bucket)
  } else if (bucket.opponentName === opponentYahooId && opponentName !== opponentYahooId) {
    bucket.opponentName = opponentName
  }
  return bucket
}

function aggToOpponentRow(bucket: OpponentBucket): PlayerMatchupOpponentRow {
  const { agg } = bucket
  const slash =
    agg.ab > 0 || agg.pa > 0
      ? battingSlashRatesFromCounts({
          h: agg.h,
          ab: agg.ab,
          tb: agg.tb,
          bb: agg.bb,
          hbp: agg.hbp,
          sf: agg.sf,
        })
      : null
  return {
    opponentNpbId: bucket.opponentNpbId,
    opponentPublicId: publicIdForOpponent(bucket.opponentYahooId, bucket.opponentNpbId),
    opponentName: bucket.opponentName,
    ab: agg.ab,
    h: agg.h,
    hr: agg.hr,
    so: agg.so,
    bb: agg.bb,
    hbp: agg.hbp,
    tb: agg.tb,
    pa: agg.pa,
    avg: agg.ab > 0 && slash ? slash.avg : null,
    ops: agg.ab > 0 && slash ? slash.ops : null,
  }
}

function buildTeamBlocks(byOpponent: Map<string, OpponentBucket>): PlayerMatchupTeamBlock[] {
  const rows = [...byOpponent.values()]
    .filter((b) => b.agg.pa > 0)
    .map((b) => ({ teamCode: b.teamCode, row: aggToOpponentRow(b) }))

  const blocks: PlayerMatchupTeamBlock[] = []
  for (const { teamCode, label } of PLAYER_MATCHUP_TEAM_ORDER) {
    const teamRows = rows
      .filter((r) => r.teamCode === teamCode)
      .map((r) => r.row)
      .sort(compareMatchupOpponentsByOpsDesc)
    if (teamRows.length === 0) continue
    blocks.push({
      teamCode,
      teamDisplay: teamDisplayNameFromCode(teamCode) || label,
      opponents: teamRows,
    })
  }

  const knownCodes = new Set(PLAYER_MATCHUP_TEAM_ORDER.map((t) => t.teamCode))
  const unknownRows = rows
    .filter((r) => !knownCodes.has(r.teamCode as (typeof PLAYER_MATCHUP_TEAM_ORDER)[number]["teamCode"]))
    .map((r) => r.row)
    .sort(compareMatchupOpponentsByOpsDesc)
  if (unknownRows.length > 0) {
    blocks.push({
      teamCode: "unknown",
      teamDisplay: "その他",
      opponents: unknownRows,
    })
  }

  return sortMatchupTeamsByOpponentCountDesc(blocks)
}

function writeStore(
  store: MatchupStore,
  outDir: string,
  role: "batter" | "pitcher",
  year: string,
  canonicalGames: number,
  plateAppearancesProcessed: number,
  skippedPa: number,
) {
  mkdirSync(outDir, { recursive: true })
  let wrote = 0
  const generatedAt = new Date().toISOString()

  for (const [subjectNpbId, byOpponent] of store) {
    const teams = buildTeamBlocks(byOpponent)
    if (teams.length === 0) continue

    const payload: PlayerMatchupDerived = {
      schemaVersion: PLAYER_MATCHUP_SCHEMA_VERSION,
      seasonYear: year,
      npbPlayerId: subjectNpbId,
      role,
      generatedAt,
      source: {
        canonicalGames,
        plateAppearancesProcessed,
        skippedPa,
      },
      teams,
    }

    writeFileSync(
      join(outDir, `npb_${subjectNpbId}.json`),
      JSON.stringify(payload, null, 2),
      "utf8",
    )
    wrote += 1
  }

  return wrote
}

function processPlateAppearance(
  doc: CanonicalGameDocument,
  gameId: string,
  pa: PlateAppearance,
  batterMatchups: MatchupStore,
  pitcherMatchups: MatchupStore,
): boolean {
  const batterYahooId = String(pa.yahooBatterId ?? "").trim()
  const pitcherYahooId = yahooPitcherIdForVsHandFromPa(pa)
  if (!batterYahooId || !pitcherYahooId) return false

  const batterNpbId = resolveNpbPlayerIdFromPublicId(batterYahooId) || batterYahooId
  const pitcherNpbId = resolveNpbPlayerIdFromPublicId(pitcherYahooId) || pitcherYahooId

  const batterName = resolveDisplayName(batterYahooId, doc)
  const pitcherName = resolveDisplayName(pitcherYahooId, doc)
  const pitcherTeamCode = resolveTeamCode(pitcherYahooId)
  const batterTeamCode = resolveTeamCode(batterYahooId)

  const batterBucket = getOrCreateBucket(
    batterMatchups,
    batterNpbId,
    pitcherYahooId,
    pitcherNpbId,
    pitcherName,
    pitcherTeamCode,
  )
  const pitcherBucket = getOrCreateBucket(
    pitcherMatchups,
    pitcherNpbId,
    batterYahooId,
    batterNpbId,
    batterName,
    batterTeamCode,
  )

  updateBattingAggFromPa(batterBucket.agg, gameId, pa, doc)
  updateBattingAggFromPa(pitcherBucket.agg, gameId, pa, doc)
  return true
}

function main() {
  const { year } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase30-matchup] no canonical games")
    process.exit(1)
  }

  const batterMatchups: MatchupStore = new Map()
  const pitcherMatchups: MatchupStore = new Map()
  let plateAppearancesProcessed = 0
  let skippedPa = 0

  for (const doc of docs) {
    const gameId = String(doc.gameId ?? doc.game?.gameId ?? doc.game?.yahooGameId ?? "").trim()
    if (!gameId) continue
    const pas = doc.domain?.plateAppearances ?? []
    for (const pa of pas) {
      if (processPlateAppearance(doc, gameId, pa, batterMatchups, pitcherMatchups)) {
        plateAppearancesProcessed += 1
      } else {
        skippedPa += 1
      }
    }
  }

  const battingDir = join(projectRoot, "_data", "derived", "player_matchup_batting", year)
  const pitchingDir = join(projectRoot, "_data", "derived", "player_matchup_pitching", year)
  cleanOutDir(battingDir)
  cleanOutDir(pitchingDir)

  const sourceMeta = {
    canonicalGames: docs.length,
    plateAppearancesProcessed,
    skippedPa,
  }

  const battingWrote = writeStore(
    batterMatchups,
    battingDir,
    "batter",
    year,
    sourceMeta.canonicalGames,
    sourceMeta.plateAppearancesProcessed,
    sourceMeta.skippedPa,
  )
  const pitchingWrote = writeStore(
    pitcherMatchups,
    pitchingDir,
    "pitcher",
    year,
    sourceMeta.canonicalGames,
    sourceMeta.plateAppearancesProcessed,
    sourceMeta.skippedPa,
  )

  console.log(
    `[phase30-matchup] PA=${plateAppearancesProcessed} skipped=${skippedPa} games=${docs.length} ` +
      `batting=${battingWrote} pitching=${pitchingWrote} → ${battingDir} / ${pitchingDir}`,
  )
}

main()
