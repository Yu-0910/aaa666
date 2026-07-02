import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { TOP_PAGE_ROUTE_CONFIGS, type TopPageRouteKey } from "@/app/components/top/topPageRouteConfig"
import {
  loadSeasonTabPayloadServer,
  loadWeeklyTabPayloadServer,
} from "@/lib/topPage/loadTopPageTabDataServer"
import { sanitizeRscPayload } from "@/lib/topPage/sanitizeRscPayload"
import type { SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export const dynamic = "force-dynamic"

export async function buildTopPageRoot(routeKey: TopPageRouteKey) {
  const route = TOP_PAGE_ROUTE_CONFIGS[routeKey]
  const initialYear = 2026

  let seasonInitial: SeasonTabPayload | null = null
  let weeklyInitial: WeeklyTabPayload | null = null

  if (route.tabId === 0) {
    seasonInitial = await loadSeasonTabPayloadServer(initialYear)
    if (seasonInitial) {
      seasonInitial = sanitizeRscPayload(seasonInitial)
    }
  }

  if (route.tabId === 1) {
    weeklyInitial = await loadWeeklyTabPayloadServer(initialYear)
    if (weeklyInitial) {
      weeklyInitial = sanitizeRscPayload(weeklyInitial)
    }
  }

  return (
    <TopPageRoot
      activeMainTab={route.tabId}
      initialYear={initialYear}
      articlesMode="rss"
      seasonInitial={seasonInitial}
      weeklyInitial={weeklyInitial}
    />
  )
}
