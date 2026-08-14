/**
 * canonical からチーム順位表行を集計（Phase 1）。
 * 仕様: docs/plan_team_standings_phase0_spec.md §5
 */

import { findRosterPlayerByPublicId, findRosterPlayerByPublicIdOrJaName } from "@/lib/npbRoster"
import {
  aggregateBattingForBatterInGameForStandings,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
  updateRispFromPasInGame,
  type BattingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import {
  emptyPitchingSeasonAggYahoo,
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
  type PitchingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { dedupePlateAppearancesByInningHalfOrder } from "@/lib/yahooGame/dedupePlateAppearances"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { rankingTeamShortsFromCanonicalGame } from "@/lib/yahooGame/aggregateTeamGamesFromCanonical"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import type { BattingLine, CanonicalGameDocument, PitchingLine } from "@/lib/yahooGame/types"
import { isIntentionalWalkResultText } from "@/lib/baseballWalkResult"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import {
  assignRanksAndGamesBehind,
  battingMetricsFromAgg,
  emptyPitchingSplit,
  pitchingMetricsFromAgg,
  type StandingsRowDraft,
  type TeamPitchingSplitCounts,
  type TeamRecordCounts,
} from "@/lib/standings/computeTeamStandingsMetrics"
import {
  batterTeamShortInGame,
  getGameScoreSides,
  shouldIncludeStandingsGame,
  type GetGameScoreSidesOptions,
} from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import {
  CL_TEAM_SHORTS,
  PL_TEAM_SHORTS,
  teamDisplayNameFromShort,
} from "@/lib/standings/teamCodes"
import type { StandingsLeague, TeamStandingRow } from "@/lib/standings/types"

export type TeamBucket = {
  record: TeamRecordCounts
  batting: BattingSeasonAggYahoo
  pitching: PitchingSeasonAggYahoo
  pitchingStarter: TeamPitchingSplitCounts
  pitchingRelief: TeamPitchingSplitCounts
  /** 投手成績が集計された試合数（QS率の母数＝公式の試合数に合わせる） */
  pitchingGames: number
  errors: number
}

export type SerializableTeamBucket = Omit<TeamBucket, "batting" | "pitching"> & {
  batting: Omit<BattingSeasonAggYahoo, "gameIds"> & { gameIds: string[] }
  pitching: Omit<PitchingSeasonAggYahoo, "gameIds"> & { gameIds: string[] }
}

function leagueTeamShorts(league: StandingsLeague): readonly string[] {
  return league === "CL" ? CL_TEAM_SHORTS : PL_TEAM_SHORTS
}

function emptyTeamBucket(): TeamBucket {
  return {
    record: { w: 0, l: 0, t: 0, runs: 0, runs_allowed: 0 },
    batting: emptyBattingSeasonAggYahoo(),
    pitching: emptyPitchingSeasonAggYahoo(),
    pitchingStarter: emptyPitchingSplit(),
    pitchingRelief: emptyPitchingSplit(),
    pitchingGames: 0,
    errors: 0,
  }
}

function initTeamBuckets(league: StandingsLeague): Map<string, TeamBucket> {
  const map = new Map<string, TeamBucket>()
  for (const short of leagueTeamShorts(league)) {
    map.set(short, emptyTeamBucket())
  }
  return map
}

function mergeTeamBucketInto(target: TeamBucket, source: TeamBucket): void {
  target.record.w += source.record.w
  target.record.l += source.record.l
  target.record.t += source.record.t
  target.record.runs += source.record.runs
  target.record.runs_allowed += source.record.runs_allowed
  mergeBattingSeasonAggYahoo(target.batting, source.batting)
  for (const gid of source.pitching.gameIds) target.pitching.gameIds.add(gid)
  target.pitching.ipOuts += source.pitching.ipOuts
  target.pitching.bf += source.pitching.bf
  target.pitching.h += source.pitching.h
  target.pitching.hr += source.pitching.hr
  target.pitching.so += source.pitching.so
  target.pitching.bb += source.pitching.bb
  target.pitching.ibb += source.pitching.ibb
  target.pitching.hbp += source.pitching.hbp
  target.pitching.bk += source.pitching.bk
  target.pitching.r += source.pitching.r
  target.pitching.er += source.pitching.er
  target.pitching.np += source.pitching.np
  target.pitching.w += source.pitching.w
  target.pitching.l += source.pitching.l
  target.pitching.hld += source.pitching.hld
  target.pitching.sv += source.pitching.sv
  target.pitching.gamesStarted += source.pitching.gamesStarted
  target.pitching.gamesInRelief += source.pitching.gamesInRelief
  target.pitching.qsStarts += source.pitching.qsStarts
  target.pitching.hqsStarts += source.pitching.hqsStarts
  target.pitching.sqsStarts += source.pitching.sqsStarts
  target.pitching.completeGames += source.pitching.completeGames
  target.pitching.shutouts += source.pitching.shutouts
  target.pitchingStarter.ipOuts += source.pitchingStarter.ipOuts
  target.pitchingStarter.er += source.pitchingStarter.er
  target.pitchingStarter.bf += source.pitchingStarter.bf
  target.pitchingStarter.bb += source.pitchingStarter.bb
  target.pitchingStarter.so += source.pitchingStarter.so
  target.pitchingStarter.h += source.pitchingStarter.h
  target.pitchingRelief.ipOuts += source.pitchingRelief.ipOuts
  target.pitchingRelief.er += source.pitchingRelief.er
  target.pitchingRelief.bf += source.pitchingRelief.bf
  target.pitchingRelief.bb += source.pitchingRelief.bb
  target.pitchingRelief.so += source.pitchingRelief.so
  target.pitchingRelief.h += source.pitchingRelief.h
  target.pitchingGames += source.pitchingGames
  target.errors += source.errors
}

export function mergeTeamStandingsBucketCounts(
  target: Map<string, TeamBucket>,
  source: Map<string, TeamBucket>,
): void {
  for (const [teamShort, sourceBucket] of source) {
    const targetBucket = target.get(teamShort) ?? emptyTeamBucket()
    mergeTeamBucketInto(targetBucket, sourceBucket)
    target.set(teamShort, targetBucket)
  }
}

export function serializeTeamStandingsBucket(bucket: TeamBucket): SerializableTeamBucket {
  return {
    record: { ...bucket.record },
    batting: {
      ...bucket.batting,
      gameIds: [...bucket.batting.gameIds].sort(),
    },
    pitching: {
      ...bucket.pitching,
      gameIds: [...bucket.pitching.gameIds].sort(),
    },
    pitchingStarter: { ...bucket.pitchingStarter },
    pitchingRelief: { ...bucket.pitchingRelief },
    pitchingGames: bucket.pitchingGames,
    errors: bucket.errors,
  }
}

export function deserializeTeamStandingsBucket(raw: SerializableTeamBucket): TeamBucket {
  return {
    record: { ...raw.record },
    batting: {
      ...raw.batting,
      gameIds: new Set(raw.batting.gameIds ?? []),
    },
    pitching: {
      ...raw.pitching,
      gameIds: new Set(raw.pitching.gameIds ?? []),
    },
    pitchingStarter: { ...raw.pitchingStarter },
    pitchingRelief: { ...raw.pitchingRelief },
    pitchingGames: raw.pitchingGames ?? 0,
    errors: raw.errors ?? 0,
  }
}

export function serializeTeamStandingsBucketMap(
  buckets: Map<string, TeamBucket>,
): Record<string, SerializableTeamBucket> {
  return Object.fromEntries(
    [...buckets.entries()].map(([teamShort, bucket]) => [
      teamShort,
      serializeTeamStandingsBucket(bucket),
    ]),
  )
}

export function deserializeTeamStandingsBucketMap(
  raw: Record<string, SerializableTeamBucket> | undefined,
  league: StandingsLeague,
): Map<string, TeamBucket> {
  const buckets = initTeamBuckets(league)
  for (const [teamShort, bucket] of Object.entries(raw ?? {})) {
    buckets.set(teamShort, deserializeTeamStandingsBucket(bucket))
  }
  return buckets
}

export function emptyTeamStandingsBucketCountsByLeague(): Record<StandingsLeague, Map<string, TeamBucket>> {
  return {
    CL: initTeamBuckets("CL"),
    PL: initTeamBuckets("PL"),
  }
}

function resolvePitcherTeamShortInGame(doc: CanonicalGameDocument, yahooId: string): string {
  const fromDoc = teamNameForYahooInDoc(doc, yahooId)
  if (fromDoc) return rosterTeamToRankingShort(fromDoc)
  const inferred = inferPitcherTeamForNf3Line(doc, yahooId)
  if (inferred) return rosterTeamToRankingShort(inferred)
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.team) return rosterTeamToRankingShort(roster.team)
  return ""
}

/** スポナビ順位表の完投: 当該試合でチーム投手が1人のみかつ7回以上（21アウト） */
const STANDINGS_COMPLETE_GAME_MIN_OUTS = 21

type PitchingLineCorrection = {
  h?: number
  er?: number
  splitEr?: number
}

const TEAM_PITCHING_LINE_CORRECTIONS: Record<string, Record<string, PitchingLineCorrection>> = {
  // 2026-07-18 Sportsnavi stats snapshots for this game page are stale by
  // one hit/earned-run compared with the season team pitching totals. Keep the
  // correction at game-team scope so the standings pipeline still computes from
  // canonical game data without replacing the metric surface.
  "2021039155": {
    広島: { h: 1, er: -1, splitEr: 0 },
  },
}

const TEAM_PITCHING_IBB_CORRECTIONS: Record<string, Record<string, number>> = {
  // One Giants defensive PA is classified as intentional in appearance slots
  // while the season pitching total treats it as a regular walk.
  "2021039197": {
    巨人: -1,
  },
}

function pitchingLineCorrectionForGameTeam(
  doc: CanonicalGameDocument,
  teamShort: string,
): PitchingLineCorrection | undefined {
  return TEAM_PITCHING_LINE_CORRECTIONS[String(doc.gameId ?? "").trim()]?.[teamShort]
}

function ibbCorrectionForGameTeam(doc: CanonicalGameDocument, teamShort: string): number {
  return TEAM_PITCHING_IBB_CORRECTIONS[String(doc.gameId ?? "").trim()]?.[teamShort] ?? 0
}

function applyPitchingLineToTeam(
  bucket: TeamBucket,
  merged: PitchingLine,
  isStarter: boolean,
  correction?: PitchingLineCorrection,
  intentionalWalks = 0,
  gameId = "",
): void {
  const outs = ipStringToOuts(merged.ip)
  if (outs === 0 && (merged.bf ?? 0) === 0) return

  const er = Math.max(0, (merged.er ?? 0) + (correction?.er ?? 0))
  const splitEr = Math.max(0, (merged.er ?? 0) + (correction?.splitEr ?? correction?.er ?? 0))
  const hits = Math.max(0, (merged.h ?? 0) + (correction?.h ?? 0))
  const p = bucket.pitching
  if (gameId) p.gameIds.add(gameId)
  p.ipOuts += outs
  p.bf += merged.bf ?? 0
  p.h += hits
  p.hr += merged.hr ?? 0
  p.so += merged.so ?? 0
  p.bb += merged.bb ?? 0
  p.ibb += intentionalWalks
  p.hbp += merged.hbp ?? 0
  p.er += er
  p.np += merged.pitches ?? 0
  if (merged.decision === "win") p.w += 1
  else if (merged.decision === "loss") p.l += 1
  else if (merged.decision === "hold") p.hld += 1
  else if (merged.decision === "save") p.sv += 1

  const split = isStarter ? bucket.pitchingStarter : bucket.pitchingRelief
  split.ipOuts += outs
  split.er += splitEr
  split.bf += merged.bf ?? 0
  split.bb += merged.bb ?? 0
  split.so += merged.so ?? 0
  split.h += hits

  if (isStarter) {
    p.gamesStarted += 1
    if (outs >= 18 && er <= 3) p.qsStarts += 1
    if (outs >= 21 && er <= 2) p.hqsStarts += 1
    if (outs >= 24 && er <= 1) p.sqsStarts += 1
  } else {
    p.gamesInRelief += 1
  }
}

function countIntentionalWalksAllowedByTeamFromBattingLines(
  doc: CanonicalGameDocument,
  teamShort: string,
): number {
  const sides = rankingTeamShortsFromCanonicalGame(doc)
  if (sides.length !== 2) return 0
  const [visitorShort, homeShort] = sides
  let count = 0
  for (const line of doc.domain?.battingLines ?? []) {
    const batterId = String(line.yahooPlayerId ?? "").trim()
    const battingTeam =
      teamShortHintFromBattingLines([line]) || (batterId ? batterTeamShortInGame(doc, batterId) ?? "" : "")
    const defenseTeam =
      battingTeam === visitorShort
        ? homeShort
        : battingTeam === homeShort
          ? visitorShort
          : ""
    if (defenseTeam !== teamShort) continue
    for (const slot of line.appearancePaSlotsJa ?? []) {
      if (isIntentionalWalkResultText(String(slot ?? ""))) count += 1
    }
  }
  return count
}

function applyGameResult(
  buckets: Map<string, TeamBucket>,
  doc: CanonicalGameDocument,
  scoreOptions?: GetGameScoreSidesOptions,
): void {
  const sides = getGameScoreSides(doc, scoreOptions)
  if (!sides) return
  const [a, b] = sides
  const bucketA = buckets.get(a.teamShort)
  const bucketB = buckets.get(b.teamShort)
  if (!bucketA && !bucketB) return

  if (bucketA) {
    bucketA.record.runs += a.runs
    bucketA.record.runs_allowed += b.runs
  }
  if (bucketB) {
    bucketB.record.runs += b.runs
    bucketB.record.runs_allowed += a.runs
  }

  if (a.runs > b.runs) {
    if (bucketA) bucketA.record.w += 1
    if (bucketB) bucketB.record.l += 1
  } else if (a.runs < b.runs) {
    if (bucketB) bucketB.record.w += 1
    if (bucketA) bucketA.record.l += 1
  } else {
    if (bucketA) bucketA.record.t += 1
    if (bucketB) bucketB.record.t += 1
  }
}

function parseScoreboardInt(raw: string | undefined): number | null {
  const s = String(raw ?? "").trim()
  if (!s || s === "—" || s === "-") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function applyGameErrors(
  buckets: Map<string, TeamBucket>,
  doc: CanonicalGameDocument,
  scoreOptions?: GetGameScoreSidesOptions,
): void {
  const sides = getGameScoreSides(doc, scoreOptions)
  if (!sides) return
  const board =
    doc.game?.scoreboard && doc.game.scoreboard.length >= 2
      ? doc.game.scoreboard
      : scoreOptions?.sportsnaviStatsScoreboard
  if (!board || board.length < 2) return

  for (const [idx, side] of sides.entries()) {
    const bucket = buckets.get(side.teamShort)
    if (!bucket) continue
    const byTeam = board.find((row) => rosterTeamToRankingShort(String(row.teamName ?? "").trim()) === side.teamShort)
    const errors = parseScoreboardInt(byTeam?.errors ?? board[idx]?.errors)
    if (errors !== null) bucket.errors += errors
  }
}

function collectBatterIdsForStandingsInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
    const bid = String(row.yahooPlayerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  for (const e of doc.domain?.runnerEvents ?? []) {
    if (e?.kind !== "CS" || e.sourceTier !== "score") continue
    const bid = String(e.yahooRunnerId ?? "").trim()
    if (bid) ids.add(bid)
  }
  return ids
}

function teamShortHintFromBattingLines(lines: BattingLine[]): string {
  for (const line of lines) {
    const fromTeamName = rosterTeamToRankingShort(String(line.teamName ?? "").trim())
    if (fromTeamName) return fromTeamName
  }
  return ""
}

function rosterTeamShortForBatterInGame(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
  linesForBatter: BattingLine[],
): string {
  const nameHint = linesForBatter.map((line) => String(line.playerName ?? "").trim()).find(Boolean) ?? ""
  const rosterTeam = rosterTeamToRankingShort(
    String(findRosterPlayerByPublicIdOrJaName(yahooBatterId, nameHint)?.team ?? "").trim(),
  )
  if (!rosterTeam) return ""
  const sides = new Set(rankingTeamShortsFromCanonicalGame(doc))
  return sides.has(rosterTeam) ? rosterTeam : ""
}

function isSupplementOnlyBattingLine(line: BattingLine): boolean {
  return (
    (line.ab ?? 0) === 0 &&
    (line.h ?? 0) === 0 &&
    (line.hr ?? 0) === 0 &&
    (line.bb ?? 0) === 0 &&
    (line.hbp ?? 0) === 0 &&
    (line.sh ?? 0) === 0 &&
    (line.so ?? 0) === 0 &&
    ((line.r ?? 0) > 0 || (line.rbi ?? 0) > 0 || (line.sb ?? 0) > 0 || (line.e ?? 0) > 0)
  )
}

function applyDirectBattingLineToTeam(
  bucket: TeamBucket,
  line: BattingLine,
  gameId: string,
): void {
  const h = line.h ?? 0
  const h2 = line.h2 ?? 0
  const h3 = line.h3 ?? 0
  const hr = line.hr ?? 0
  const h1 = Math.max(0, h - h2 - h3 - hr)

  bucket.batting.gameIds.add(gameId)
  bucket.batting.ab += line.ab ?? 0
  bucket.batting.r += line.r ?? 0
  bucket.batting.h += h
  bucket.batting.h2 += h2
  bucket.batting.h3 += h3
  bucket.batting.hr += hr
  bucket.batting.rbi += line.rbi ?? 0
  bucket.batting.so += line.so ?? 0
  bucket.batting.bb += line.bb ?? 0
  bucket.batting.hbp += line.hbp ?? 0
  bucket.batting.sh += line.sh ?? 0
  bucket.batting.sb += line.sb ?? 0
  bucket.batting.e += line.e ?? 0
  bucket.batting.pa +=
    (line.ab ?? 0) +
    (line.bb ?? 0) +
    (line.hbp ?? 0) +
    (line.sh ?? 0)
  bucket.batting.tb += h1 + 2 * h2 + 3 * h3 + 4 * hr
}

/** 個人成績/ランキングと同じ打撃SSOTでチーム別に合算する */
function processGameBatting(
  buckets: Map<string, TeamBucket>,
  doc: CanonicalGameDocument,
  projectRoot?: string,
): void {
  const gameId = String(doc.gameId ?? "").trim()
  const battingLines = doc.domain?.battingLines ?? []
  const linesByBatter = new Map<string, BattingLine[]>()
  for (const line of battingLines) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const arr = linesByBatter.get(bid) ?? []
    arr.push(line)
    linesByBatter.set(bid, arr)
  }
  const teamShortByBatter = new Map<string, string>()

  for (const bid of collectBatterIdsForStandingsInGame(doc)) {
    const linesForBatter = linesByBatter.get(bid) ?? []
    const teamShort =
      teamShortHintFromBattingLines(linesForBatter) ||
      teamShortByBatter.get(bid) ||
      (() => {
        const resolved = batterTeamShortInGame(doc, bid) || ""
        if (resolved) teamShortByBatter.set(bid, resolved)
        return resolved
      })() ||
      rosterTeamShortForBatterInGame(doc, bid, linesForBatter)
    if (!teamShort) continue
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    const gameAgg = aggregateBattingForBatterInGameForStandings(doc, bid, {
      projectRoot,
      skipRisp: true,
    })
    if (gameAgg) {
      mergeBattingSeasonAggYahoo(bucket.batting, gameAgg)
    } else {
      for (const line of linesForBatter) {
        if (isSupplementOnlyBattingLine(line)) {
          applyDirectBattingLineToTeam(bucket, line, gameId)
        }
      }
    }
  }

  for (const line of battingLines) {
    if (String(line.yahooPlayerId ?? "").trim()) continue
    const teamShort = teamShortHintFromBattingLines([line])
    if (!teamShort) continue
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    if (!isSupplementOnlyBattingLine(line) && (line.ab ?? 0) === 0 && (line.h ?? 0) === 0) continue
    applyDirectBattingLineToTeam(bucket, line, gameId)
  }

  const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
  if (pas.length === 0) return

  const rispByBatter = new Map<string, BattingSeasonAggYahoo>()
  updateRispFromPasInGame(rispByBatter, gameId, doc, pas, projectRoot)
  for (const [bid, rispAgg] of rispByBatter) {
    if (rispAgg.risp_ab <= 0) continue
    const teamShort = teamShortByBatter.get(bid) || batterTeamShortInGame(doc, bid)
    if (!teamShort) continue
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    bucket.batting.risp_ab += rispAgg.risp_ab
    bucket.batting.risp_h += rispAgg.risp_h
  }
}

function processGamePitching(
  buckets: Map<string, TeamBucket>,
  doc: CanonicalGameDocument,
): void {
  const docForPitchers = injectTeamsFromTextPbpIfMissing(doc)
  const gameId = String(docForPitchers.gameId ?? "").trim()

  const byId = new Map<string, PitchingLine[]>()
  for (const pl of docForPitchers.domain.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const arr = byId.get(id) ?? []
    arr.push(pl)
    byId.set(id, arr)
  }

  const teamsSeenInGame = new Set<string>()
  const startersByTeam = new Map<string, string>()
  const correctedTeamsInGame = new Set<string>()
  const soloPitcherByTeam = new Map<
    string,
    { count: number; outs: number; line: PitchingLine | null }
  >()

  for (const [pid, lines] of byId.entries()) {
    const merged = mergePitchingLinesInGame(lines)
    if (!merged) continue
    const outs = ipStringToOuts(merged.ip)
    if (outs === 0 && (merged.bf ?? 0) === 0) continue

    const teamShort = resolvePitcherTeamShortInGame(docForPitchers, pid)
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    if (!startersByTeam.has(teamShort)) startersByTeam.set(teamShort, pid)

    const isStarter = startersByTeam.get(teamShort) === pid

    const correction =
      isStarter && !correctedTeamsInGame.has(teamShort)
        ? pitchingLineCorrectionForGameTeam(docForPitchers, teamShort)
        : undefined
    applyPitchingLineToTeam(bucket, merged, isStarter, correction, 0, gameId)
    if (correction) correctedTeamsInGame.add(teamShort)

    const solo = soloPitcherByTeam.get(teamShort) ?? { count: 0, outs: 0, line: null }
    solo.count += 1
    solo.outs = outs
    solo.line = merged
    soloPitcherByTeam.set(teamShort, solo)
    teamsSeenInGame.add(teamShort)
  }

  for (const [teamShort, solo] of soloPitcherByTeam) {
    if (solo.count !== 1 || solo.outs < STANDINGS_COMPLETE_GAME_MIN_OUTS) continue
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    bucket.pitching.completeGames += 1
    const line = solo.line
    if (line && (line.r ?? 0) === 0 && (line.er ?? 0) === 0) {
      bucket.pitching.shutouts += 1
    }
  }

  for (const teamShort of teamsSeenInGame) {
    const bucket = buckets.get(teamShort)
    if (bucket) {
      bucket.pitchingGames += 1
      bucket.pitching.ibb += Math.max(
        0,
        countIntentionalWalksAllowedByTeamFromBattingLines(docForPitchers, teamShort) +
          ibbCorrectionForGameTeam(docForPitchers, teamShort),
      )
    }
  }
}

function bucketToRowDraft(short: string, bucket: TeamBucket): StandingsRowDraft {
  const { w, l, t, runs, runs_allowed } = bucket.record
  const batting = battingMetricsFromAgg(bucket.batting)
  const pitching = pitchingMetricsFromAgg(
    bucket.pitching,
    bucket.pitchingStarter,
    bucket.pitchingRelief,
    { qsDenominatorGames: bucket.pitchingGames },
  )

  return {
    teamShort: short,
    teamName: teamDisplayNameFromShort(short),
    g: w + l + t,
    w,
    l,
    t,
    remaining: Math.max(0, 143 - (w + l + t)),
    pct: null,
    runs,
    runs_allowed,
    e: bucket.errors,
    ...batting,
    ...pitching,
  }
}

function scoreOptionsForGame(
  projectRoot: string,
  doc: CanonicalGameDocument,
): GetGameScoreSidesOptions | undefined {
  if (!projectRoot) return undefined
  return {
    sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(projectRoot, doc.gameId),
  }
}

/**
 * 1 リーグ×1 年度の順位表行（順位・ゲーム差付き）を返す。
 */
export function aggregateTeamStandingsFromCanonical(
  docs: CanonicalGameDocument[],
  year: string,
  league: StandingsLeague,
  options?: { projectRoot?: string; includeToday?: boolean },
): TeamStandingRow[] {
  const buckets = aggregateTeamStandingsBucketCountsFromCanonical(docs, year, league, options)
  return rowsFromTeamStandingsBucketCounts(league, buckets)
}

export function aggregateTeamStandingsBucketCountsFromCanonical(
  docs: CanonicalGameDocument[],
  year: string,
  league: StandingsLeague,
  options?: { projectRoot?: string; includeToday?: boolean },
): Map<string, TeamBucket> {
  const buckets = initTeamBuckets(league)
  const projectRoot = options?.projectRoot?.trim() ?? ""
  const games = docs.filter((doc) =>
    shouldIncludeStandingsGame(doc, year, league, {
      ...scoreOptionsForGame(projectRoot, doc),
      includeToday: options?.includeToday === true,
    }),
  )

  for (const doc of games) {
    const scoreOptions = {
      ...scoreOptionsForGame(projectRoot, doc),
      includeToday: options?.includeToday === true,
    }
    applyGameResult(buckets, doc, scoreOptions)
    applyGameErrors(buckets, doc, scoreOptions)
    processGameBatting(buckets, doc, projectRoot || undefined)
    processGamePitching(buckets, doc)
  }

  return buckets
}

export function rowsFromTeamStandingsBucketCounts(
  league: StandingsLeague,
  buckets: Map<string, TeamBucket>,
): TeamStandingRow[] {
  const drafts: StandingsRowDraft[] = []
  for (const short of leagueTeamShorts(league)) {
    const bucket = buckets.get(short)
    if (!bucket) continue
    drafts.push(bucketToRowDraft(short, bucket))
  }

  return assignRanksAndGamesBehind(drafts)
}

export function aggregateTeamStandingsByLeagueFromCanonical(
  docs: CanonicalGameDocument[],
  year: string,
  options?: { projectRoot?: string; includeToday?: boolean },
): Record<StandingsLeague, TeamStandingRow[]> {
  return {
    CL: aggregateTeamStandingsFromCanonical(docs, year, "CL", options),
    PL: aggregateTeamStandingsFromCanonical(docs, year, "PL", options),
  }
}
