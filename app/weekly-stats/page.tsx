import { buildTopPageRoot } from "@/app/components/top/TopPageRoutePage"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("weekly")

export default async function WeeklyStatsPage() {
  return buildTopPageRoot("weekly")
}
