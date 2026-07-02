import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("probables")

export default function ProbablePitchersPage() {
  return (
    <TopPageRoot
      activeMainTab={2}
      initialYear={2026}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
