import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { TOP_PAGE_ROUTE_CONFIGS, type TopPageRouteKey } from "@/app/components/top/topPageRouteConfig"
import {
  loadSeasonTabPayloadServer,
} from "@/lib/topPage/loadTopPageTabDataServer"
import { sanitizeRscPayload } from "@/lib/topPage/sanitizeRscPayload"
import type { SeasonTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export const dynamic = "force-dynamic"

export async function buildTopPageRoot(routeKey: TopPageRouteKey) {
  const route = TOP_PAGE_ROUTE_CONFIGS[routeKey]
  const initialYear = 2026

  let seasonInitial: SeasonTabPayload | null = null

  if (route.tabId === 0) {
    seasonInitial = await loadSeasonTabPayloadServer(initialYear)
    if (seasonInitial) {
      seasonInitial = sanitizeRscPayload(seasonInitial)
    }
  }

  return (
    <TopPageRoot
      activeMainTab={route.tabId}
      initialYear={initialYear}
      articlesMode="rss"
      seasonInitial={seasonInitial}
    />
  )
}
