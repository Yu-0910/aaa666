import { RECENT_METRICS, type RecentMetric, type RecentSnapshot } from "./recentGamesShared"

export function recentGamesQuery(query: Record<string, string | string[] | undefined>) {
  const sort = typeof query.sort === "string" && RECENT_METRICS.includes(query.sort as RecentMetric)
    ? query.sort as RecentMetric : "ops"
  return { sort, order: query.order === "asc" ? "asc" as const : "desc" as const }
}

export function recentGamesRankingHref(league: "CL" | "PL", sort: RecentMetric = "ops", order: "asc" | "desc" = "desc") {
  return `/ranking/recent-games/2026/${league}/batting?sort=${sort}&order=${order}`
}

/** Reject older player-appearance windows and mismatched league files at the read boundary. */
export function parseRecentGamesSnapshot(raw: unknown, league: "CL" | "PL"): RecentSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("Invalid recent-games snapshot")
  const data = raw as RecentSnapshot
  if (data.schemaVersion !== "recent-10-games-batting-v1" || data.windowBasis !== "team"
    || data.year !== "2026" || data.league !== league || data.windowSize !== 10 || data.minRatePA !== 10
    || !/^2026-\d{2}-\d{2}$/.test(data.asOf) || !Number.isFinite(Date.parse(data.generatedAt))
    || !Array.isArray(data.rows)) throw new Error("Incompatible recent-games snapshot")
  const seen = new Set<string>()
  for (const row of data.rows) {
    if (!row || typeof row !== "object" || typeof row.playerId !== "string" || !row.playerId
      || seen.has(row.playerId) || row.league !== league || typeof row.name !== "string" || !row.name.trim()
      || typeof row.team !== "string" || !row.team || typeof row.hasExcludedGames !== "boolean"
      || !Number.isInteger(row.gamesIncluded) || row.gamesIncluded < 0
      || !Number.isInteger(row.teamGamesIncluded) || row.teamGamesIncluded < 1 || row.teamGamesIncluded > 10
      || row.gamesIncluded > row.teamGamesIncluded || !Array.isArray(row.gameIds) || !Array.isArray(row.teamGameIds)
      || row.gameIds.length !== row.gamesIncluded || row.teamGameIds.length !== row.teamGamesIncluded
      || !row.gameIds.every(id => row.teamGameIds.includes(id))
      || !/^2026-\d{2}-\d{2}$/.test(row.firstGameDate) || !/^2026-\d{2}-\d{2}$/.test(row.lastGameDate)
      || row.firstGameDate > row.lastGameDate || row.lastGameDate > data.asOf
      || ![row.pa, row.ab, row.h, row.hr, row.rbi, row.sb].every(n => Number.isInteger(n) && n >= 0)
      || ![row.avg, row.ops].every(n => n === null || typeof n === "number" && Number.isFinite(n) && n >= 0)) {
      throw new Error("Invalid recent-games player row")
    }
    seen.add(row.playerId)
  }
  return data
}
