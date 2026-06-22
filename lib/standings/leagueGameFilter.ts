/**
 * 順位表用: canonical 試合フィルタ（交流戦 CL vs PL を各リーグの勝敗に含める）
 */

import { teamForYahooPlayerId } from "@/lib/yahooGame/pitcherPocHelpers"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import {
  isCancelledCanonicalGame,
  isFutureOrTodayGameYmd,
  rankingTeamShortsFromCanonicalGame,
} from "@/lib/yahooGame/aggregateTeamGamesFromCanonical"
import {
  leagueBucketForTeamShort,
  rosterTeamToRankingShort,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import {
  injectTeamsFromTextPbpIfMissing,
  inningHalfTokenFromPlateAppearance,
} from "@/lib/yahooGame/inferTeamsFromTextPbp"
import type { CanonicalGameDocument, PlateAppearance, ScoreboardTeamLine } from "@/lib/yahooGame/types"
import type { StandingsLeague } from "@/lib/standings/types"

export type GetGameScoreSidesOptions = {
  /** 出場成績 HTML のスコア表「計」列（2 行） */
  sportsnaviStatsScoreboard?: ScoreboardTeamLine[] | null
}

export type ScoreboardSide = {
  teamShort: string
  runs: number
}

function parseRuns(raw: string | undefined): number | null {
  const s = String(raw ?? "").trim()
  if (!s || s === "—" || s === "-") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function visitorHomeShorts(doc: CanonicalGameDocument): [string, string] | null {
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const shorts = rankingTeamShortsFromCanonicalGame(enriched)
  if (shorts.length !== 2) return null
  return [shorts[0]!, shorts[1]!]
}

export function batterTeamShortInGame(
  doc: CanonicalGameDocument,
  yahooId: string,
): string | null {
  const fromLineup = teamForYahooPlayerId(doc, yahooId)
  if (fromLineup) return rosterTeamToRankingShort(fromLineup)

  for (const pa of doc.domain.plateAppearances ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== yahooId) continue
    const t = attackingTeamShortFromPa(doc, pa)
    if (t) return t
  }
  return null
}

export function attackingTeamShortFromPa(
  doc: CanonicalGameDocument,
  pa: PlateAppearance,
): string | null {
  const pair = visitorHomeShorts(doc)
  if (!pair) return null
  const [visitor, home] = pair
  const half = inningHalfTokenFromPlateAppearance(pa)
  if (half === "表") return visitor
  if (half === "裏") return home
  return null
}

function teamShortFromScoreboardName(teamName: string): string {
  return rosterTeamToRankingShort(String(teamName ?? "").trim())
}

function scoreSidesFromScoreboardLines(
  visitorShort: string,
  homeShort: string,
  board: ScoreboardTeamLine[],
): ScoreboardSide[] | null {
  if (board.length < 2) return null

  const findRuns = (targetShort: string): number | null => {
    for (const row of board) {
      if (teamShortFromScoreboardName(row.teamName) !== targetShort) continue
      const runs = parseRuns(row.runs)
      if (runs !== null) return runs
    }
    return null
  }

  let vRuns = findRuns(visitorShort)
  let hRuns = findRuns(homeShort)
  // Yahoo スコア表は先攻→後攻の行順（visitor / home）
  if (vRuns === null) vRuns = parseRuns(board[0]?.runs)
  if (hRuns === null) hRuns = parseRuns(board[1]?.runs)
  if (vRuns === null || hRuns === null) return null

  return [
    { teamShort: visitorShort, runs: vRuns },
    { teamShort: homeShort, runs: hRuns },
  ]
}

/** canonical scoreboard → 出場成績 HTML の「計」列。R 合算フォールバックは使わない。 */
export function getGameScoreSides(
  doc: CanonicalGameDocument,
  options?: GetGameScoreSidesOptions,
): ScoreboardSide[] | null {
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const pair = visitorHomeShorts(enriched)
  if (!pair) return null
  const [visitorShort, homeShort] = pair

  const board = enriched.game?.scoreboard ?? []
  if (board.length >= 2) {
    const fromCanon = scoreSidesFromScoreboardLines(visitorShort, homeShort, board)
    if (fromCanon) return fromCanon
  }

  const statsBoard = options?.sportsnaviStatsScoreboard
  if (statsBoard && statsBoard.length >= 2) {
    return scoreSidesFromScoreboardLines(visitorShort, homeShort, statsBoard)
  }

  return null
}

/** @deprecated 互換 alias */
export function parseScoreboardSides(doc: CanonicalGameDocument): ScoreboardSide[] | null {
  return getGameScoreSides(doc)
}

export function isIntraLeagueGame(doc: CanonicalGameDocument, league: StandingsLeague): boolean {
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const shorts = rankingTeamShortsFromCanonicalGame(enriched)
  if (shorts.length !== 2) return false
  const lg0 = leagueBucketForTeamShort(shorts[0]!)
  const lg1 = leagueBucketForTeamShort(shorts[1]!)
  return lg0 === lg1 && lg0 === league
}

/** 順位表: 当該リーグの球団が1つでも出場する試合（交流戦 CL vs PL を含む） */
export function isLeagueStandingsGame(doc: CanonicalGameDocument, league: StandingsLeague): boolean {
  const enriched = injectTeamsFromTextPbpIfMissing(doc)
  const shorts = rankingTeamShortsFromCanonicalGame(enriched)
  if (shorts.length !== 2) return false
  return shorts.some((short) => leagueBucketForTeamShort(short) === league)
}

export function shouldIncludeStandingsGame(
  doc: CanonicalGameDocument,
  year: string,
  league: StandingsLeague,
  options?: GetGameScoreSidesOptions,
): boolean {
  if (isCancelledCanonicalGame(doc)) return false
  const ymd = parseGameDateYmdFromCanonical(doc)
  if (!ymd || !ymd.startsWith(`${year}-`)) return false
  if (isFutureOrTodayGameYmd(ymd)) return false
  if (!isLeagueStandingsGame(doc, league)) return false
  if (!getGameScoreSides(doc, options)) return false
  return true
}

export function filterStandingsGames(
  docs: CanonicalGameDocument[],
  year: string,
  league: StandingsLeague,
  options?: GetGameScoreSidesOptions,
): CanonicalGameDocument[] {
  return docs.filter((doc) => shouldIncludeStandingsGame(doc, year, league, options))
}
