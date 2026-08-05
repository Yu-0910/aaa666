import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { notFound, permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ year: string }>
}

export default async function YearTopPage({ params }: PageProps) {
  const { year: yearStr } = await params

  const legacyCanonicalRedirects: Record<string, string> = {
    "npb-weekly-stats": "/weekly-stats",
    "npb-probable-pitchers": "/probable-pitchers",
    "npb-news": "/news",
    "npb-standings": "/standings",
  }
  const legacyRedirect = legacyCanonicalRedirects[yearStr]
  if (legacyRedirect) {
    permanentRedirect(legacyRedirect)
  }

  if (!/^\d{4}$/.test(yearStr)) {
    notFound()
  }

  const y = Number(yearStr)

  if (y === 2026) {
    permanentRedirect("/")
  }

  return (
    <TopPageRoot
      activeMainTab={0}
      initialYear={y}
      articlesMode="rss"
      seasonInitial={null}
      weeklyInitial={null}
    />
  )
}
