import { battingSeasonGridMetrics, battingTop2025SeasonTopN } from "../topPageBatting2025Grid"
import { rankRecentV2, type V2Snapshot } from "../ranking/recentGamesV2"
import { formatRankingStatDisplay } from "../formatStat"

/** Same metric order and limits as the season TOP grid. */
export function buildRecentV2Cards(snapshot: V2Snapshot) {
  return battingSeasonGridMetrics(2026).map(label => {
    const metric = snapshot.metrics.find(item => item.label === label)
    if (!metric) throw new Error(`Missing TOP metric: ${label}`)
    const limit = battingTop2025SeasonTopN(label, "2026")!
    return { ...metric, limit, rows: rankRecentV2(snapshot.rows, metric.key).slice(0, limit).map(row => ({
      playerId: row.playerId, npbPlayerId: row.npbPlayerId, name: row.name, romanName: row.romanName,
      team: row.team, rank: row.rank, value: row.values[metric.key],
      displayValue: formatRankingStatDisplay(label, row.values[metric.key]),
    })) }
  })
}

export type RecentV2CardsPayload = {
  schemaVersion: "recent-10-cards-v2"
  league: "CL" | "PL"; asOf: string; latestGameDate: string | null; generatedAt: string
  cards: (Omit<ReturnType<typeof buildRecentV2Cards>[number], "rows"> & {
    rows: (ReturnType<typeof buildRecentV2Cards>[number]["rows"][number] & { href: string | null })[]
  })[]
}
