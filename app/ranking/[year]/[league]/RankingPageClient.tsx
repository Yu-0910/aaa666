/**
 * Client Component for Ranking Page
 * ソート処理とクエリパラメータ管理を行う
 */

"use client"

import { useRouter } from "next/navigation"
import RankingUI from "@/components/RankingUI"
import type { RankingViewModel } from "@/lib/ranking/types"
import { getDefaultBattingSortOrder } from "@/lib/ranking/battingSortOrder"
import { shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { season2026BattingQualifyingNote } from "@/lib/ranking/qualifyingUiNotes"
import { buildRankingTopNavGroups } from "@/lib/ranking/rankingNavLinks"
import { useBattingRankingTable } from "@/hooks/useBattingRankingTable"
import { FullPageLoading } from "@/components/ui/spinner"

interface RankingPageClientProps {
  initialViewModel: RankingViewModel
}

export default function RankingPageClient({ initialViewModel }: RankingPageClientProps) {
  const router = useRouter()
  const { sortKey, order, yahooPoc, yahooGameId, rowsFromJson, sortedRows, loading, loadError } =
    useBattingRankingTable({ initialViewModel })

  const handleSortChange = (metricKey: string) => {
    const currentSort = sortKey
    const currentOrder = order

    let newOrder: "asc" | "desc"
    if (currentSort === metricKey) {
      newOrder = currentOrder === "asc" ? "desc" : "asc"
    } else {
      newOrder = getDefaultBattingSortOrder(metricKey)
    }

    const extra = yahooPoc ? `&yahooPoc=1&yahooGameId=${encodeURIComponent(yahooGameId)}` : ""
    router.replace(
      `/ranking/${initialViewModel.season}/${initialViewModel.league}?sort=${encodeURIComponent(metricKey)}&order=${newOrder}${extra}`,
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">エラー</h1>
          <p className="text-gray-400">{loadError}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <FullPageLoading />
  }

  const titleSubNote = season2026BattingQualifyingNote(sortKey, initialViewModel.season)
  const headerNavGroups =
    initialViewModel.league === "CL" || initialViewModel.league === "PL"
      ? buildRankingTopNavGroups(initialViewModel.season, initialViewModel.league, "batting")
      : undefined
  const emptyAfterFilter =
    !loadError &&
    rowsFromJson.length > 0 &&
    sortedRows.length === 0 &&
    shouldRequireQualifyingPA(sortKey) &&
    !yahooPoc

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {emptyAfterFilter && (
        <div className="border-b border-[#444] bg-[#141414] px-3 py-2 text-center text-xs sm:text-sm text-gray-400">
          規定打席を満たす選手がいません。別の指標を選ぶか、team-games.json の生成（npm run phase12:build:rankings）を確認してください。
        </div>
      )}
      <RankingUI
        viewModel={{ ...initialViewModel, rows: rowsFromJson }}
        sortedRows={sortedRows}
        sortKey={sortKey}
        order={order}
        onSortChange={handleSortChange}
        titleSubNote={titleSubNote}
        headerNavGroups={headerNavGroups}
      />
    </div>
  )
}
