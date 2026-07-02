import { buildTopPageRoot } from "@/app/components/top/TopPageRoutePage"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const metadata = topPageMetadataFor("probables")

export default async function ProbablePitchersPage() {
  return buildTopPageRoot("probables")
}
