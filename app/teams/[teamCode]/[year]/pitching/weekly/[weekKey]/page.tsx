import { Suspense } from "react"
import { notFound } from "next/navigation"
import { FullPageLoading } from "@/components/ui/spinner"
import TeamPitchingRankingPageClient from "../../TeamPitchingRankingPageClient"
import { loadMetricsFromRecordPitchingForYear } from "@/lib/ranking/recordPitching"
import type { RankingViewModel } from "@/lib/ranking/types"
import {
  isValidWeeklyWeekKey,
  weeklyRankingPageWeekMeta,
} from "@/lib/ranking/weeklyRankingPageParams"
import { teamPagePitchingTitle } from "@/lib/teamPage/teamPageHref"
import { parseTeamPageParams } from "@/lib/teamPage/teamPageParams"

export const dynamic = "force-dynamic"
export const revalidate = 0

type Props = {
  params: Promise<{ teamCode: string; year: string; weekKey: string }>
}

export default async function TeamWeeklyPitchingPage({ params }: Props) {
  const { teamCode, year, weekKey } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed || !isValidWeeklyWeekKey(weekKey)) notFound()

  const metrics = loadMetricsFromRecordPitchingForYear(Number(parsed.year))
  if (metrics.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center text-sm text-gray-400">
        利用可能な指標が見つかりませんでした。
      </div>
    )
  }

  const { weekLabel, availableWeekKeys } = weeklyRankingPageWeekMeta(
    process.cwd(),
    parsed.year,
    weekKey,
  )

  const viewModel: RankingViewModel = {
    title: teamPagePitchingTitle(parsed.teamDisplay, parsed.year, weekLabel),
    season: parsed.year,
    league: parsed.league,
    metrics,
    activeMetric: "era",
    rows: [],
  }

  return (
    <Suspense fallback={<FullPageLoading />}>
      <TeamPitchingRankingPageClient
        initialViewModel={viewModel}
        teamCode={parsed.teamCode}
        teamDisplay={parsed.teamDisplay}
        weekKey={weekKey}
        weekLabel={weekLabel}
        availableWeekKeys={availableWeekKeys}
      />
    </Suspense>
  )
}
