import { rankRecentRows, type RecentSnapshot } from "@/lib/ranking/recentGamesShared"
export const recentCardSpecs = [
  { metric: "avg", label: "打率", limit: 5 }, { metric: "ops", label: "OPS", limit: 5 },
  { metric: "hr", label: "本塁打", limit: 5 }, { metric: "h", label: "安打", limit: 3 },
  { metric: "rbi", label: "打点", limit: 3 }, { metric: "sb", label: "盗塁", limit: 3 },
] as const
export function buildRecentCards(snapshot: RecentSnapshot) {
  return recentCardSpecs.map(spec => ({ ...spec,
    rows: rankRecentRows(snapshot.rows, spec.metric).slice(0, spec.limit).map(row => ({
      playerId: row.playerId, npbPlayerId: row.npbPlayerId, name: row.name, team: row.team, rank: row.rank,
      value: spec.metric === "avg" || spec.metric === "ops"
        ? Number(row[spec.metric]).toFixed(3).replace(/^0\./, ".") : String(row[spec.metric]),
    })),
  }))
}
export type RecentCardsPayload = {
  league: "CL" | "PL"; asOf: string; latestGameDate: string | null; generatedAt: string
  cards: (Omit<ReturnType<typeof buildRecentCards>[number], "rows"> & {
    rows: (ReturnType<typeof buildRecentCards>[number]["rows"][number] & { href: string | null })[]
  })[]
}
