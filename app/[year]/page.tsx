import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import {
  loadSeasonTabPayloadServer,
  loadWeeklyTabPayloadServer,
} from "@/lib/topPage/loadTopPageTabDataServer"

type PageProps = {
  params: Promise<{ year: string }>
}

export default async function YearTopPage({ params }: PageProps) {
  const { year: yearStr } = await params
  const y = Number(yearStr) || 2024

  let seasonInitial = null
  let weeklyInitial = null
  if (y === 2026) {
    try {
      ;[seasonInitial, weeklyInitial] = await Promise.all([
        loadSeasonTabPayloadServer(2026),
        loadWeeklyTabPayloadServer(2026),
      ])
    } catch (err) {
      console.error('[YearTopPage] failed to load 2026 tab payloads', err)
    }
  }

  return (
    <TopPageRoot
      initialYear={y}
      articlesMode="dummy"
      seasonInitial={seasonInitial}
      weeklyInitial={weeklyInitial}
    />
  )
}
