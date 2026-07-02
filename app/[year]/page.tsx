import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import { permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ year: string }>
}

export default async function YearTopPage({ params }: PageProps) {
  const { year: yearStr } = await params
  const y = Number(yearStr) || 2024

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
