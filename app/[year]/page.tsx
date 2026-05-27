import { TopPageRoot } from "@/app/components/top/TopPageRoot"
import {
  loadSeasonTabPayloadServer,
  loadWeeklyTabPayloadServer,
} from "@/lib/topPage/loadTopPageTabDataServer"
import { sanitizeRscPayload } from "@/lib/topPage/sanitizeRscPayload"
import type { SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ year: string }>
}

export default async function YearTopPage({ params }: PageProps) {
  const { year: yearStr } = await params
  const y = Number(yearStr) || 2024

  let seasonInitial: SeasonTabPayload | null = null
  let weeklyInitial: WeeklyTabPayload | null = null
  if (y === 2026) {
    ;[seasonInitial, weeklyInitial] = await Promise.all([
      loadSeasonTabPayloadServer(2026),
      loadWeeklyTabPayloadServer(2026),
    ])
    if (seasonInitial) {
      seasonInitial = sanitizeRscPayload(seasonInitial)
    }
    if (weeklyInitial) {
      weeklyInitial = sanitizeRscPayload(weeklyInitial)
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
