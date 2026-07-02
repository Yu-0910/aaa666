import { buildTopPageRoot } from "@/app/components/top/TopPageRoutePage"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("standings")

export default async function StandingsPage() {
  return buildTopPageRoot("standings")
}
