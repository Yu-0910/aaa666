import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("news")

export default function NewsPage() {
  return (
    <TopPageRoot
      activeMainTab={3}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
