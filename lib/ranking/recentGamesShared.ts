export const RECENT_METRICS = ["avg", "ops", "hr", "h", "rbi", "sb"] as const
export type RecentMetric = typeof RECENT_METRICS[number]
export const COUNT_KEYS = ["pa", "ab", "h", "doubles", "triples", "hr", "bb", "hbp", "sh", "sf", "rbi", "sb"] as const
export type Counts = Record<typeof COUNT_KEYS[number], number>
export type RecentGame = Counts & {
  gameId: string; gameDate: string; yahooPlayerId: string; name: string
  team: string; league: "CL" | "PL"; source: string
}
export type RecentRow = Counts & {
  playerId: string; yahooPlayerId: string; npbPlayerId: string | null; name: string
  team: string; league: "CL" | "PL"; gamesIncluded: number; gameIds: string[]
  teamGamesIncluded: number; teamGameIds: string[]
  firstGameDate: string; lastGameDate: string; hasExcludedGames: boolean
  tb: number; avg: number | null; obp: number | null; slg: number | null; ops: number | null
}
export type ExcludedGame = { gameId: string; gameDate: string | null; yahooPlayerId: string | null; reason: string }
export type RecentSnapshot = {
  schemaVersion: "recent-10-games-batting-v1"; year: "2026"; league: "CL" | "PL"
  windowBasis: "team"
  generatedAt: string; asOf: string; latestGameDate: string | null
  windowSize: 10; minRatePA: 10; metrics: readonly RecentMetric[]; rows: RecentRow[]
}
export function validRecentDate(date: string): boolean {
  return /^2026-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
}
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export function newestRecentGame(a: Pick<RecentGame, "gameDate" | "gameId">, b: Pick<RecentGame, "gameDate" | "gameId">): number {
  const dateOrder = lexical(b.gameDate, a.gameDate)
  if (dateOrder) return dateOrder
  const aa = BigInt(a.gameId), bb = BigInt(b.gameId)
  return aa > bb ? -1 : aa < bb ? 1 : lexical(a.gameId, b.gameId)
}
export function sumRecentGames(games: Counts[]) {
  const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, 0])) as Counts
  for (const game of games) for (const key of COUNT_KEYS) counts[key] += game[key]
  const tb = counts.h + counts.doubles + 2 * counts.triples + 3 * counts.hr
  const denominator = counts.ab + counts.bb + counts.hbp + counts.sf
  const avg = counts.ab ? counts.h / counts.ab : null
  const obp = denominator ? (counts.h + counts.bb + counts.hbp) / denominator : null
  const slg = counts.ab ? tb / counts.ab : null
  return { ...counts, tb, avg, obp, slg, ops: obp !== null && slg !== null ? obp + slg : null }
}
export function rankRecentRows(rows: RecentRow[], metric: RecentMetric, order: "asc" | "desc" = "desc") {
  return rows.filter(row => !row.hasExcludedGames && row.gamesIncluded > 0 && row[metric] !== null && (metric !== "avg" && metric !== "ops" || row.pa >= 10))
    .sort((a, b) => (Number(a[metric]) - Number(b[metric])) * (order === "asc" ? 1 : -1)
      || b.pa - a.pa || b.h - a.h || lexical(a.playerId, b.playerId))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}
