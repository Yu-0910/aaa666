import type { CanonicalGameDocument } from "../yahooGame/types"
import { parseGameDateYmdFromCanonical } from "../yahooGame/gameDateFromCanonical"
import { isRegularSeasonCanonicalGame } from "../npbRegularSeason"
import {
  aggregateBattingForBatterInGameForProfiles,
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromAppearanceSlotsInGame,
} from "../yahooGame/canonicalBattingSeasonAgg"
import { battingSeasonAggSource } from "../yahooGame/battingSeasonAggSourceFeatureFlag"
import { CSV_TEAM_TO_RANKING_SHORT, leagueBucketForTeamShort, teamNameForYahooInDoc } from "../yahooGame/canonicalPitchingSeasonAgg"
import { rankingTeamShortsFromCanonicalGame } from "../yahooGame/aggregateTeamGamesFromCanonical"

import { RECENT_METRICS, COUNT_KEYS, validRecentDate, newestRecentGame, sumRecentGames, type Counts, type RecentGame, type ExcludedGame, type RecentSnapshot } from "./recentGamesShared"
export * from "./recentGamesShared"
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Completion must have positive evidence; file existence and scoreboard totals are insufficient. */
export function recentGameCompleted(doc: CanonicalGameDocument, scheduleStatus = ""): boolean {
  const text = [doc.game.meta.documentTitle, ...doc.game.textPlayByPlay.flatMap(s => [s.sectionTitle, ...s.lines])].join("\n")
  if (/中止|ノーゲーム/.test(scheduleStatus) || /試合中止|ノーゲーム/.test(text)) return false
  return scheduleStatus === "completed" || /試合終了|コールド.*終了/.test(scheduleStatus) || /試合終了/.test(text)
}

export function buildRecentGamesBattingRankings(docs: CanonicalGameDocument[], options: {
  asOf: string; generatedAt: string
  scheduleStatus?: (date: string, gameId: string) => string
  npbId?: (yahooId: string) => string | null
  currentTeam?: (yahooId: string) => string | null
  completedTeamGames?: Array<{ gameId: string; gameDate: string; team: string }>
}) {
  if (!validRecentDate(options.asOf)) throw new Error("asOf must be a valid 2026 YYYY-MM-DD")
  const byPlayer = new Map<string, RecentGame[]>()
  const excluded: ExcludedGame[] = []
  const knownTeams = new Set(Object.values(CSV_TEAM_TO_RANKING_SHORT))
  const latest: Record<"CL" | "PL", string | null> = { CL: null, PL: null }
  const seen = new Set<string>()
  const teamGames = new Map<string, Map<string, { gameId: string; gameDate: string }>>()
  const addTeamGame = (team: string, gameId: string, gameDate: string) => {
    if (!knownTeams.has(team) || !validRecentDate(gameDate) || gameDate > options.asOf || !/^\d+$/.test(gameId)) return
    const games = teamGames.get(team) ?? new Map()
    games.set(gameId, { gameId, gameDate })
    teamGames.set(team, games)
    const league = leagueBucketForTeamShort(team)
    if (!latest[league] || gameDate > latest[league]!) latest[league] = gameDate
  }
  for (const game of options.completedTeamGames ?? []) addTeamGame(game.team, game.gameId, game.gameDate)
  for (const doc of [...docs].sort((a, b) => lexical(a.gameId, b.gameId))) {
    if (seen.has(doc.gameId)) throw new Error(`Duplicate canonical game: ${doc.gameId}`)
    seen.add(doc.gameId)
    const date = parseGameDateYmdFromCanonical(doc)
    const ids = new Set([...doc.domain.battingLines.map(l => l.yahooPlayerId), ...doc.domain.plateAppearances.map(p => p.yahooBatterId)].filter((id): id is string => Boolean(id)))
    const exclude = (reason: string, id: string | null = null) => excluded.push({ gameId: doc.gameId, gameDate: date, yahooPlayerId: id, reason })
    if (!date || !/^\d+$/.test(doc.gameId)) { exclude("invalid_game_identity"); continue }
    if (!date.startsWith("2026-") || date > options.asOf) continue
    if (!isRegularSeasonCanonicalGame("2026", date, doc.game.meta.documentTitle)
      || /オールスター|日本シリーズ|クライマックス|ファーム|二軍|オープン戦/.test(doc.game.meta.documentTitle)) continue
    if (!recentGameCompleted(doc, options.scheduleStatus?.(date, doc.gameId))) {
      for (const id of ids) exclude("completion_unconfirmed", id)
      exclude("completion_unconfirmed")
      continue
    }
    for (const team of rankingTeamShortsFromCanonicalGame(doc)) addTeamGame(team, doc.gameId, date)
    if (!doc.domain.battingLines.length) exclude("missing_game_batting_data")
    for (const id of [...ids].sort()) {
      const lines = doc.domain.battingLines.filter(l => l.yahooPlayerId === id)
      const line = lines[0]
      if (!/^\d+$/.test(id) || lines.length !== 1 || !line) { exclude("missing_or_duplicate_batting_line", id); continue }
      let rawTeam = line.teamName || doc.game.statsPlayerLinkedRows.find(r => r.yahooPlayerId === id)?.teamName || teamNameForYahooInDoc(doc, id)
      if (!rawTeam) {
        // A substitute bats for the same team as identified batters in the same half.
        const half = doc.domain.plateAppearances.find(p => p.yahooBatterId === id)?.inningHalf
        const teams = new Set(doc.domain.plateAppearances.filter(p => half && p.inningHalf === half)
          .map(p => teamNameForYahooInDoc(doc, p.yahooBatterId ?? "")).filter(Boolean))
        if (teams.size === 1) rawTeam = [...teams][0]
      }
      const team = CSV_TEAM_TO_RANKING_SHORT[rawTeam] ?? rawTeam
      if (!knownTeams.has(team) || !line.playerName?.trim() || /^\d+$/.test(line.playerName)) { exclude("unresolved_player_or_team", id); continue }
      const league = leagueBucketForTeamShort(team)
      if (!latest[league] || date > latest[league]!) latest[league] = date
      // Numeric columns are completeness checks, never replacements for appearance results.
      if (![line.ab, line.h, line.bb, line.hbp, line.sh, line.rbi, line.sb].every(v => typeof v === "number" && Number.isInteger(v) && v >= 0)) {
        exclude("missing_count_columns", id); continue
      }
      const slots = line.appearancePaSlotsJa ?? doc.game.statsPlayerLinkedRows.find(r => r.yahooPlayerId === id)?.cells.slice(14)
      if (!slots) { exclude("missing_appearance_slots", id); continue }
      let agg = aggregateBattingForBatterInGameForProfiles(doc, id)
      if (!agg && !slots.some(s => s.trim()) && line.ab === 0 && line.bb === 0 && line.hbp === 0 && line.sh === 0 && line.h === 0 && line.positionCell?.trim()) {
        agg = emptyBattingSeasonAggYahoo()
        updateBattingAggFromAppearanceSlotsInGame(agg, doc.gameId, doc, id, line)
      }
      if (!agg) { exclude("missing_game_counts", id); continue }
      if (agg.ab !== line.ab || agg.h !== line.h || agg.bb !== line.bb || agg.hbp !== line.hbp || agg.sh !== line.sh) {
        exclude("appearance_counts_disagree_with_columns", id); continue
      }
      const counts: Counts = { pa: agg.pa, ab: agg.ab, h: agg.h, doubles: agg.h2, triples: agg.h3, hr: agg.hr,
        bb: agg.bb, hbp: agg.hbp, sh: agg.sh, sf: agg.sf, rbi: agg.rbi, sb: agg.sb }
      if (!COUNT_KEYS.every(k => Number.isInteger(counts[k]) && counts[k] >= 0) || counts.h > counts.ab || counts.ab > counts.pa
        || counts.doubles + counts.triples + counts.hr > counts.h) { exclude("invalid_counts", id); continue }
      const games = byPlayer.get(id) ?? []
      games.push({ ...counts, gameId: doc.gameId, gameDate: date, yahooPlayerId: id, name: line.playerName.trim(), team, league,
        source: `canonical/${doc.gameId}:aggregateBattingForBatterInGameForProfiles` })
      byPlayer.set(id, games)
    }
  }
  const selected: Record<string, RecentGame[]> = {}
  const makeSnapshot = (league: "CL" | "PL"): RecentSnapshot => ({
    schemaVersion: "recent-10-games-batting-v1", year: "2026", league, windowBasis: "team", generatedAt: options.generatedAt, asOf: options.asOf,
    latestGameDate: latest[league], windowSize: 10, minRatePA: 10, metrics: RECENT_METRICS, rows: [],
  })
  const snapshots = { CL: makeSnapshot("CL"), PL: makeSnapshot("PL") }
  for (const [id, allGames] of [...byPlayer].sort(([a], [b]) => lexical(a, b))) {
    const identity = allGames.sort(newestRecentGame)[0]
    const rosterTeam = options.currentTeam?.(id)
    const team = rosterTeam ? CSV_TEAM_TO_RANKING_SHORT[rosterTeam] ?? rosterTeam : identity.team
    if (!knownTeams.has(team)) continue
    const window = [...(teamGames.get(team)?.values() ?? [])].sort(newestRecentGame).slice(0, 10)
    if (!window.length) continue
    const gameIds = new Set(window.map(g => g.gameId))
    const games = allGames.filter(g => g.team === team && gameIds.has(g.gameId))
    const league = leagueBucketForTeamShort(team)
    const playerId = `yahoo_${id}`
    selected[playerId] = games
    snapshots[league].rows.push({ ...sumRecentGames(games), playerId, yahooPlayerId: id, npbPlayerId: options.npbId?.(id) ?? null,
      name: identity.name, team, league, gamesIncluded: games.length, gameIds: games.map(g => g.gameId),
      teamGamesIncluded: window.length, teamGameIds: window.map(g => g.gameId),
      firstGameDate: window[window.length - 1].gameDate, lastGameDate: window[0].gameDate,
      hasExcludedGames: window.some(g => !seen.has(g.gameId)) || excluded.some(e => gameIds.has(e.gameId) && (e.yahooPlayerId === id || e.yahooPlayerId === null)) })
  }
  return { snapshots, audit: { asOf: options.asOf, source: battingSeasonAggSource(), windowBasis: "team" as const,
    teamWindows: Object.fromEntries([...teamGames].map(([team, games]) => [team, [...games.values()].sort(newestRecentGame).slice(0, 10)])), selected, excluded } }
}
