import { loadRecentGamesV2 } from "@/lib/ranking/loadRecentGamesV2"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import { buildRecentV2Cards, type RecentV2CardsPayload } from "@/lib/topPage/recentGamesV2Cards"
import { playerPageHrefKnown } from "@/lib/playerPageHref"

export const dynamic = "force-dynamic"
export async function GET(_request: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params
  if (league !== "CL" && league !== "PL") return Response.json({ error: "Not found" }, { status: 404 })
  try {
    const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
    const snapshot = await loadRecentGamesV2(league, metrics)
    const cards = buildRecentV2Cards(snapshot).map(card => ({ ...card, rows: card.rows.map(row => ({
      ...row, href: playerPageHrefKnown({ playerId: row.playerId, npbPlayerId: row.npbPlayerId ?? undefined, name: row.name, season: "2026" }) ?? null,
    })) }))
    const payload: RecentV2CardsPayload = { schemaVersion: "recent-10-cards-v2", league,
      asOf: snapshot.asOf, latestGameDate: snapshot.latestGameDate, generatedAt: snapshot.generatedAt, cards }
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Data unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
