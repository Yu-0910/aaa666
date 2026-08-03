/**
 * canonical からチーム順位表行を集計（Phase 1）。
 * 仕様: docs/plan_team_standings_phase0_spec.md §5
 */

import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
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
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
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

type TeamBucket = {
  record: TeamRecordCounts
  batting: BattingSeasonAggYahoo
  pitching: PitchingSeasonAggYahoo
  pitchingStarter: TeamPitchingSplitCounts
  pitchingRelief: TeamPitchingSplitCounts
  /** 投手成績が集計された試合数（QS率の母数＝公式の試合数に合わせる） */
  pitchingGames: number
  errors: number
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
  // 2026-07-18 Sportsnavi stats snapshots for these game pages are stale by
  // one hit/earned-run compared with the season team pitching totals. Keep the
  // correction at game-team scope so the standings pipeline still computes from
  // canonical game data without replacing the metric surface.
  "2021039153": {
    中日: { h: 1, er: 1 },
  },
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
): void {
  const outs = ipStringToOuts(merged.ip)
  if (outs === 0 && (merged.bf ?? 0) === 0) return

  const er = Math.max(0, (merged.er ?? 0) + (correction?.er ?? 0))
  const splitEr = Math.max(0, (merged.er ?? 0) + (correction?.splitEr ?? correction?.er ?? 0))
  const hits = Math.max(0, (merged.h ?? 0) + (correction?.h ?? 0))
  const p = bucket.pitching
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

function collectBatterIdsWithLinesInGame(doc: CanonicalGameDocument): Set<string> {
  const ids = new Set<string>()
  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
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

/** 出場成績行優先ハイブリッド（公式チーム打撃合算に合わせる） */
function processGameBatting(
  buckets: Map<string, TeamBucket>,
  doc: CanonicalGameDocument,
  projectRoot?: string,
): void {
  for (const bid of collectBatterIdsWithLinesInGame(doc)) {
    const linesForBatter = (doc.domain?.battingLines ?? []).filter(
      (line) => String(line.yahooPlayerId ?? "").trim() === bid,
    )
    const teamShort = teamShortHintFromBattingLines(linesForBatter) || batterTeamShortInGame(doc, bid)
    if (!teamShort) continue
    const bucket = buckets.get(teamShort)
    if (!bucket) continue
    const gameAgg = aggregateBattingForBatterInGameForStandings(doc, bid, {
      projectRoot,
      skipRisp: true,
    })
    if (!gameAgg) continue
    mergeBattingSeasonAggYahoo(bucket.batting, gameAgg)
  }

  const gameId = String(doc.gameId ?? "").trim()
  const pas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gameId)
  if (pas.length === 0) return

  const rispByBatter = new Map<string, BattingSeasonAggYahoo>()
  updateRispFromPasInGame(rispByBatter, gameId, doc, pas, projectRoot)
  for (const [bid, rispAgg] of rispByBatter) {
    if (rispAgg.risp_ab <= 0) continue
    const teamShort = batterTeamShortInGame(doc, bid)
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
  const startersByTeam = collectStarterYahooIdByRankingShort(docForPitchers)

  const byId = new Map<string, PitchingLine[]>()
  for (const pl of docForPitchers.domain.pitchingLines ?? []) {
    const id = String(pl.yahooPlayerId ?? "").trim()
    if (!id) continue
    const arr = byId.get(id) ?? []
    arr.push(pl)
    byId.set(id, arr)
  }

  const teamsSeenInGame = new Set<string>()
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

    const isStarter = startersByTeam.get(teamShort) === pid

    const correction =
      isStarter && !correctedTeamsInGame.has(teamShort)
        ? pitchingLineCorrectionForGameTeam(docForPitchers, teamShort)
        : undefined
    applyPitchingLineToTeam(bucket, merged, isStarter, correction)
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
  options?: { projectRoot?: string },
): TeamStandingRow[] {
  const buckets = initTeamBuckets(league)
  const projectRoot = options?.projectRoot?.trim() ?? ""
  const games = docs.filter((doc) =>
    shouldIncludeStandingsGame(doc, year, league, scoreOptionsForGame(projectRoot, doc)),
  )

  for (const doc of games) {
    const scoreOptions = scoreOptionsForGame(projectRoot, doc)
    applyGameResult(buckets, doc, scoreOptions)
    applyGameErrors(buckets, doc, scoreOptions)
    processGameBatting(buckets, doc, projectRoot || undefined)
    processGamePitching(buckets, doc)
  }

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
  options?: { projectRoot?: string },
): Record<StandingsLeague, TeamStandingRow[]> {
  return {
    CL: aggregateTeamStandingsFromCanonical(docs, year, "CL", options),
    PL: aggregateTeamStandingsFromCanonical(docs, year, "PL", options),
  }
}
