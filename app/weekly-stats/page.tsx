import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"
import { loadRecentTabPayloadServer } from "@/lib/topPage/loadTopPageTabDataServer"
import { sanitizeRscPayload } from "@/lib/topPage/sanitizeRscPayload"
import type { RecentTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export const metadata = topPageMetadataFor("weekly")

export const dynamic = "force-dynamic"

export default async function WeeklyStatsPage() {
  let recentInitial: RecentTabPayload | null = await loadRecentTabPayloadServer(2026)
  if (recentInitial) {
    recentInitial = sanitizeRscPayload(recentInitial)
  }

  return (
    <TopPageRoot
      activeMainTab={1}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
      recentInitial={recentInitial}
    />
  )
}
