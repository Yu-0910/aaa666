import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("standings")

export default function StandingsPage() {
  return (
    <TopPageRoot
      activeMainTab={4}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
