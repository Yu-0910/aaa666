import { Suspense } from "react"
import { notFound } from "next/navigation"
import { FullPageLoading } from "@/components/ui/spinner"
import TeamBattingRankingPageClient from "./TeamBattingRankingPageClient"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import type { RankingViewModel } from "@/lib/ranking/types"
import { teamPageBattingTitle } from "@/lib/teamPage/teamPageHref"
import { parseTeamPageParams } from "@/lib/teamPage/teamPageParams"

export const dynamic = "force-dynamic"
export const revalidate = 0

type Props = {
  params: Promise<{ teamCode: string; year: string }>
}

export default async function TeamBattingPage({ params }: Props) {
  const { teamCode, year } = await params
  const parsed = parseTeamPageParams(teamCode, year)
  if (!parsed) notFound()

  const metrics = loadMetricsFromRecord()
  if (metrics.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center text-sm text-gray-400">
        利用可能な指標が見つかりませんでした。
      </div>
    )
  }

  const viewModel: RankingViewModel = {
    title: teamPageBattingTitle(parsed.teamDisplay, parsed.year),
    season: parsed.year,
    league: parsed.league,
    metrics,
    activeMetric: "ops",
    rows: [],
  }

  return (
    <Suspense fallback={<FullPageLoading />}>
      <TeamBattingRankingPageClient
        initialViewModel={viewModel}
        teamCode={parsed.teamCode}
        teamDisplay={parsed.teamDisplay}
      />
    </Suspense>
  )
}
