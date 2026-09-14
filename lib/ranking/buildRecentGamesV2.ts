import type { CanonicalGameDocument } from "../yahooGame/types"
import { aggregateBattingForBatterInGameForProfiles, emptyBattingSeasonAggYahoo, updateBattingAggFromAppearanceSlotsInGame } from "../yahooGame/canonicalBattingSeasonAgg"
import type { buildRecentGamesBattingRankings } from "./buildRecentGamesBattingRankings"
import { EXTRA_COUNTS, recentV2Values, type ExtraCounts, type V2Game, type V2Snapshot } from "./recentGamesV2"
import { loadMetricsFromRecord } from "./record"
import { fullRomanForPlayerUrl } from "../topPageLeaderName"
import { findRosterPlayerByPublicId, rosterEnglishShortForRanking } from "../npbRoster"

export function buildRecentGamesV2(docs: CanonicalGameDocument[], base: ReturnType<typeof buildRecentGamesBattingRankings>) {
  const byId = new Map(docs.map(doc => [doc.gameId, doc]))
  const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
  const audit: V2Game[] = []
  const snapshots = {} as Record<"CL" | "PL", V2Snapshot>
  for (const league of ["CL", "PL"] as const) {
    const snapshot = base.snapshots[league]
    snapshots[league] = { ...snapshot, schemaVersion: "recent-10-games-batting-v2", metrics, rows: snapshot.rows.map(row => {
      const selected = base.audit.selected[row.playerId] ?? []
      const games = selected.map(game => {
        const doc = byId.get(game.gameId)!
        const line = doc.domain.battingLines.find(item => item.yahooPlayerId === row.yahooPlayerId)
        const loaded = aggregateBattingForBatterInGameForProfiles(doc, row.yahooPlayerId)
        const agg = loaded ?? emptyBattingSeasonAggYahoo()
        if (!loaded) updateBattingAggFromAppearanceSlotsInGame(agg, doc.gameId, doc, row.yahooPlayerId, line)
        const valid = (n: unknown): number | null => typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null
        const extra: V2Game = { gameId: game.gameId, playerId: row.playerId,
          runs: valid(line?.r), so: valid(agg.so), ibb: valid(agg.ibb), gidp: valid(agg.gidp),
          cs: Array.isArray(doc.domain.runnerEvents) ? valid(agg.cs) : null }
        audit.push(extra)
        return extra
      })
      const extra = Object.fromEntries(EXTRA_COUNTS.map(key => [key, games.some(game => game[key] === null)
        ? null : games.reduce((sum, game) => sum + Number(game[key]), 0)])) as ExtraCounts
      const values = recentV2Values(row, extra)
      for (const metric of metrics) if (!(metric.key in values)) throw new Error(`Unsupported metric: ${metric.key}`)
      const roster = findRosterPlayerByPublicId(row.npbPlayerId ?? row.yahooPlayerId)
      return { ...row, ...extra, romanName: (roster ? rosterEnglishShortForRanking(roster) : "") || fullRomanForPlayerUrl({ name: row.name.replace(/[\s\u3000]+/g, "") }) || null,
        values: Object.fromEntries(metrics.map(metric => [metric.key, values[metric.key]])) }
    }) }
  }
  return { snapshots, audit: { ...base.audit, extraGames: audit } }
}
