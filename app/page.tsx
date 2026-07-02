import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("top")

export default function HomePage() {
  return (
    <TopPageRoot
      activeMainTab={0}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
