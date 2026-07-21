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
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import type { BattingLine, CanonicalGameDocument, PitchingLine } from "@/lib/yahooGame/types"
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

function applyPitchingLineToTeam(
  bucket: TeamBucket,
  merged: PitchingLine,
  isStarter: boolean,
): void {
  const outs = ipStringToOuts(merged.ip)
  if (outs === 0 && (merged.bf ?? 0) === 0) return

  const er = merged.er ?? 0
  const p = bucket.pitching
  p.ipOuts += outs
  p.bf += merged.bf ?? 0
  p.h += merged.h ?? 0
  p.hr += merged.hr ?? 0
  p.so += merged.so ?? 0
  p.bb += merged.bb ?? 0
  p.hbp += merged.hbp ?? 0
  p.er += er
  p.np += merged.pitches ?? 0

  const split = isStarter ? bucket.pitchingStarter : bucket.pitchingRelief
  split.ipOuts += outs
  split.er += er
  split.bf += merged.bf ?? 0
  split.bb += merged.bb ?? 0
  split.so += merged.so ?? 0
  split.h += merged.h ?? 0

  if (isStarter) {
    p.gamesStarted += 1
    if (outs >= 18 && er <= 3) p.qsStarts += 1
    if (outs >= 21 && er <= 2) p.hqsStarts += 1
    if (outs >= 24 && er <= 1) p.sqsStarts += 1
  } else {
    p.gamesInRelief += 1
  }
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

    applyPitchingLineToTeam(bucket, merged, isStarter)

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
    if (bucket) bucket.pitchingGames += 1
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
    pct: null,
    runs,
    runs_allowed,
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
    applyGameResult(buckets, doc, scoreOptionsForGame(projectRoot, doc))
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
