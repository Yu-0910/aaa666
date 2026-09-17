import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadRecentTabPayloadServer } from "@/lib/topPage/loadTopPageTabDataServer"
import { sanitizeRscPayload } from "@/lib/topPage/sanitizeRscPayload"
import { readWeeklyCurrentWeekJsonAsync } from "@/lib/topPage/weeklyCurrentWeekMeta"
import type { WeeklyTabWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import type { RecentTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export const metadata = topPageMetadataFor("weekly")

export const dynamic = "force-dynamic"

export default async function WeeklyStatsPage() {
  let recentInitial: RecentTabPayload | null = await loadRecentTabPayloadServer(2026)
  if (recentInitial) {
    recentInitial = sanitizeRscPayload(recentInitial)
  }
  let recentWeekMeta: WeeklyTabWeekMeta | null = null
  const rawWeekMeta = await readWeeklyCurrentWeekJsonAsync(getProjectRoot(), "2026")
  if (rawWeekMeta?.weekKey && rawWeekMeta.weekLabel && rawWeekMeta.calendarWeekKey && rawWeekMeta.calendarWeekLabel) {
    recentWeekMeta = sanitizeRscPayload({
      weekKey: rawWeekMeta.weekKey,
      weekLabel: rawWeekMeta.weekLabel,
      calendarWeekKey: rawWeekMeta.calendarWeekKey,
      calendarWeekLabel: rawWeekMeta.calendarWeekLabel,
      isFallbackWeek: rawWeekMeta.isFallbackWeek,
      availableWeekKeys: rawWeekMeta.availableWeekKeys,
    })
  }

  return (
    <TopPageRoot
      activeMainTab={1}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
      recentInitial={recentInitial}
      recentWeekMeta={recentWeekMeta}
    />
  )
}
