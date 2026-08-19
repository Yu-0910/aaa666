/**
 * 投手ランキング用クライアント
 */

"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import RankingUI from "@/components/RankingUI"
import type { RankingViewModel } from "@/lib/ranking/types"
import { shouldRequireQualifyingPitching } from "@/lib/ranking/qualifyingPitching"
import { season2026PitchingQualifyingNote } from "@/lib/ranking/qualifyingUiNotes"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"
import { buildRankingTopNavGroups } from "@/lib/ranking/rankingNavLinks"
import { usePitchingRankingTable } from "@/hooks/usePitchingRankingTable"
import { FullPageLoading } from "@/components/ui/spinner"

interface PitchingRankingPageClientProps {
  initialViewModel: RankingViewModel
}

export default function PitchingRankingPageClient({ initialViewModel }: PitchingRankingPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sortKey, order, rowsFromJson, sortedRows, loadError, fetchSettled, metricDef } =
    usePitchingRankingTable({ initialViewModel })
  const pinActiveMetric = useMemo(() => searchParams.get("pinActiveMetric") === "1", [searchParams])

  const handleSortChange = (metricKey: string) => {
    let newOrder: "asc" | "desc"
    if (sortKey === metricKey) {
      newOrder = order === "asc" ? "desc" : "asc"
    } else {
      newOrder = getPitchingSortOrderForKey(metricKey)
    }
    router.replace(
      `/ranking/pitching/${initialViewModel.season}/${initialViewModel.league}?sort=${encodeURIComponent(metricKey)}&order=${newOrder}${pinActiveMetric ? "&pinActiveMetric=1" : ""}`,
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <h1 className="text-2xl font-bold mb-4">エラー</h1>
          <p className="text-gray-400 text-sm leading-relaxed">{loadError}</p>
          <p className="text-gray-600 text-xs mt-4">
            投手ランキングデータが未整備の年度では表示できません。別の年度を選ぶか、データ生成を確認してください。
          </p>
        </div>
      </div>
    )
  }

  if (metricDef && !fetchSettled) {
    return <FullPageLoading />
  }

  const emptyAfterFilter =
    fetchSettled &&
    rowsFromJson.length > 0 &&
    sortedRows.length === 0 &&
    shouldRequireQualifyingPitching(sortKey)

  const emptyNoData = fetchSettled && rowsFromJson.length === 0 && !!metricDef
  const titleSubNote = season2026PitchingQualifyingNote(sortKey, initialViewModel.season)
  const is2026Season = initialViewModel.season === "2026"
  const missingJsonHint = is2026Season
    ? "npm run phase19:build:pitching-rankings を実行してください。"
    : "npm run pitching-rankings:build:historical を実行してください。"
  const headerNavGroups =
    initialViewModel.league === "CL" || initialViewModel.league === "PL"
      ? buildRankingTopNavGroups(initialViewModel.season, initialViewModel.league, "pitching")
      : undefined

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {!loadError && emptyNoData && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-center text-xs sm:text-sm text-amber-100/90">
          この指標のランキングデータがまだありません。public/data/rankings/pitching/{initialViewModel.season}/
          {initialViewModel.league}/ に JSON を配置するか、{missingJsonHint}
        </div>
      )}
      {!loadError && emptyAfterFilter && (
        <div className="border-b border-[#444] bg-[#141414] px-3 py-2 text-center text-xs sm:text-sm text-gray-400">
          規定投球回を満たす選手がいません。別の指標を選ぶか、データ範囲を広げてください。
        </div>
      )}
      <RankingUI
        viewModel={{ ...initialViewModel, rows: rowsFromJson }}
        sortedRows={sortedRows}
        sortKey={sortKey}
        order={order}
        onSortChange={handleSortChange}
        rankingPathBase="/ranking/pitching"
        metricLabelFallback="投球成績"
        titleSubNote={titleSubNote}
        headerNavGroups={headerNavGroups}
        pinActiveMetricNextToPlayer={pinActiveMetric}
      />
    </div>
  )
}
