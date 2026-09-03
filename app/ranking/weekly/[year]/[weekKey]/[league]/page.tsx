export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * 週間打撃ランキング: /ranking/weekly/[year]/[weekKey]/[league]
 */

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { FullPageLoading } from "@/components/ui/spinner"
import WeeklyRankingPageClient from "./WeeklyRankingPageClient"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import type { RankingViewModel } from "@/lib/ranking/types"
import {
  isValidWeeklyWeekKey,
  normalizeWeeklyLeague,
  weeklyRankingPageWeekMeta,
} from "@/lib/ranking/weeklyRankingPageParams"

interface WeeklyRankingPageProps {
  params: Promise<{
    year: string
    weekKey: string
    league: string
  }>
}

export default async function WeeklyRankingPage({ params }: WeeklyRankingPageProps) {
  const { year, weekKey, league: leagueRaw } = await params

  if (process.env.NODE_ENV === "development") {
    console.log("[ROUTE_HIT] /ranking/weekly/[year]/[weekKey]/[league]", {
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
    const metrics = loadMetricsFromRecord()
    if (metrics.length === 0) {
      return (
        <div className="min-h-screen site-bg text-white flex items-center justify-center">
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
      title: `${seasonDisplayName}　週間打撃成績ランキング (${year}年)`,
      season: year,
      league,
      metrics,
      activeMetric: "ops",
      rows: [],
    }

    return (
      <Suspense fallback={<FullPageLoading />}>
        <WeeklyRankingPageClient
          initialViewModel={viewModel}
          weekKey={weekKey}
          weekLabel={weekLabel}
          availableWeekKeys={availableWeekKeys}
        />
      </Suspense>
    )
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[WeeklyRankingPage] error:", error)
      throw error
    }

    return (
      <div className="min-h-screen site-bg text-white flex items-center justify-center">
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
