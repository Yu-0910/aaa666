import { buildTopPageRoot } from "@/app/components/top/TopPageRoutePage"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("news")

export default async function NewsPage() {
  return buildTopPageRoot("news")
}
