import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { topPageMetadataFor } from "@/app/components/top/topPageRouteConfig"

export const dynamic = "force-dynamic"
export const metadata = topPageMetadataFor("standings")

type PageProps = {
  params: Promise<{ year: string }>
}

export default async function StandingsYearPage({ params }: PageProps) {
  const { year: yearStr } = await params
  const year = Number(yearStr) || 2026

  return (
    <TopPageRoot
      activeMainTab={4}
      initialYear={year}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
