import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("weekly")

export default function WeeklyStatsPage() {
  return (
    <TopPageRoot
      activeMainTab={1}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
