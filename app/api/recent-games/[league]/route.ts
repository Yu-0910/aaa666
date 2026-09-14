import { loadRecentGamesSnapshot } from "@/lib/ranking/loadRecentGamesSnapshot"
import { buildRecentCards } from "@/lib/topPage/recentGamesCards"
import { playerPageHrefKnown } from "@/lib/playerPageHref"
export const dynamic = "force-dynamic"
export async function GET(_request: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params
  if (league !== "CL" && league !== "PL") return Response.json({ error: "Not found" }, { status: 404 })
  try {
    const snapshot = await loadRecentGamesSnapshot(league)
    const cards = buildRecentCards(snapshot).map(card => ({ ...card, rows: card.rows.map(row => ({
      ...row, href: playerPageHrefKnown({ playerId: row.playerId, npbPlayerId: row.npbPlayerId ?? undefined, name: row.name, season: "2026" }) ?? null,
    })) }))
    return Response.json({ league, asOf: snapshot.asOf, latestGameDate: snapshot.latestGameDate, generatedAt: snapshot.generatedAt, cards }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Data unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
