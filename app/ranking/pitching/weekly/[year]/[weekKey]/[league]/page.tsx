export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * 週間投手ランキング: /ranking/pitching/weekly/[year]/[weekKey]/[league]
 */

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { FullPageLoading } from "@/components/ui/spinner"
import WeeklyPitchingRankingPageClient from "./WeeklyPitchingRankingPageClient"
import { loadMetricsFromRecordPitching } from "@/lib/ranking/recordPitching"
import type { RankingViewModel } from "@/lib/ranking/types"
import {
  isValidWeeklyWeekKey,
  normalizeWeeklyLeague,
  weeklyRankingPageWeekMeta,
} from "@/lib/ranking/weeklyRankingPageParams"

interface WeeklyPitchingRankingPageProps {
  params: Promise<{
    year: string
    weekKey: string
    league: string
  }>
}

export default async function WeeklyPitchingRankingPage({ params }: WeeklyPitchingRankingPageProps) {
  const { year, weekKey, league: leagueRaw } = await params

  if (process.env.NODE_ENV === "development") {
    console.log("[ROUTE_HIT] /ranking/pitching/weekly/[year]/[weekKey]/[league]", {
      year,
      weekKey,
      league: leagueRaw,
    })
  }

  if (year !== "2026") {
    notFound()
  }

  if (!isValidWeeklyWeekKey(weekKey)) {
    notFound()
  }

  const league = normalizeWeeklyLeague(leagueRaw)
  if (!league) {
    notFound()
  }

  try {
    const metrics = loadMetricsFromRecordPitching()
    if (metrics.length === 0) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">エラー</h1>
            <p className="text-gray-400">利用可能な指標が見つかりませんでした。</p>
          </div>
        </div>
      )
    }

    const seasonDisplayName = league === "CL" ? "セ・リーグ" : "パ・リーグ"
    const { weekLabel, availableWeekKeys } = weeklyRankingPageWeekMeta(
      process.cwd(),
      year,
      weekKey
    )

    const viewModel: RankingViewModel = {
      title: `${seasonDisplayName}　週間投球成績ランキング (${year}年)`,
      season: year,
      league,
      metrics,
      activeMetric: "era",
      rows: [],
    }

    return (
      <Suspense fallback={<FullPageLoading />}>
        <WeeklyPitchingRankingPageClient
          initialViewModel={viewModel}
          weekKey={weekKey}
          weekLabel={weekLabel}
          availableWeekKeys={availableWeekKeys}
        />
      </Suspense>
    )
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[WeeklyPitchingRankingPage] error:", error)
      throw error
    }

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">エラー</h1>
          <p className="text-gray-400 mb-2">
            {error instanceof Error ? error.message : "データの読み込みに失敗しました"}
          </p>
        </div>
      </div>
    )
  }
}
