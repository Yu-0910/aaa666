"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import RankingUI from "@/components/RankingUI"
import type { RankingViewModel } from "@/lib/ranking/types"
import { getDefaultBattingSortOrder } from "@/lib/ranking/normalizeRankingRow"
import { useBattingRankingTable } from "@/hooks/useBattingRankingTable"
import { fetchWeeklyCurrentWeekClient } from "@/lib/ranking/fetchWeeklyCurrentWeekClient"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { teamPageHref } from "@/lib/teamPage/teamPageHref"
import { FullPageLoading } from "@/components/ui/spinner"

type Props = {
  initialViewModel: RankingViewModel
  teamCode: string
  teamDisplay: string
  weekKey?: string
  weekLabel?: string
  availableWeekKeys?: string[]
}

export default function TeamBattingRankingPageClient({
  initialViewModel,
  teamCode,
  teamDisplay,
  weekKey,
  weekLabel: initialWeekLabel,
  availableWeekKeys: initialWeekKeys = [],
}: Props) {
  const router = useRouter()
  const isWeekly = !!weekKey
  const [weekOptions, setWeekOptions] = useState(() =>
    initialWeekKeys.map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) })),
  )

  useEffect(() => {
    if (!isWeekly) return
    let cancelled = false
    fetchWeeklyCurrentWeekClient(initialViewModel.season).then((meta) => {
      if (cancelled || !meta?.availableWeekKeys?.length) return
      setWeekOptions(
        meta.availableWeekKeys.map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [isWeekly, initialViewModel.season])

  const { sortKey, order, sortedRows, loading, loadError, qualifyingDividerAfterRank } =
    useBattingRankingTable({
      initialViewModel,
      teamCode,
      weekKey,
    })

  const handleSortChange = (metricKey: string) => {
    let newOrder: "asc" | "desc"
    if (sortKey === metricKey) {
      newOrder = order === "asc" ? "desc" : "asc"
    } else {
      newOrder = getDefaultBattingSortOrder(metricKey)
    }
    router.replace(
      teamPageHref({
        teamCode,
        year: initialViewModel.season,
        subTab: "batting",
        weekKey,
        sort: metricKey,
        order: newOrder,
      }),
    )
  }

  const handleWeekChange = (newWeekKey: string) => {
    router.push(
      teamPageHref({
        teamCode,
        year: initialViewModel.season,
        subTab: "batting",
        weekKey: newWeekKey,
        sort: sortKey,
        order,
      }),
    )
  }

  if (loadError) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center">
        <p className="text-sm text-gray-400">{loadError}</p>
      </div>
    )
  }

  if (loading) {
    return <FullPageLoading />
  }

  const resolvedWeekLabel =
    initialWeekLabel ??
    weekOptions.find((w) => w.weekKey === weekKey)?.weekLabel ??
    (weekKey ? weekLabelForKey(weekKey) : undefined)

  return (
    <>
      {isWeekly && weekKey ? (
        <div className="mb-3 flex justify-end">
          <select
            value={weekKey}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors max-w-[9rem]"
            aria-label="週を選択"
          >
            {(weekOptions.length > 0
              ? weekOptions
              : [{ weekKey, weekLabel: resolvedWeekLabel ?? weekKey }]
            ).map((w) => (
              <option key={w.weekKey} value={w.weekKey}>
                {w.weekLabel}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <RankingUI
        viewModel={initialViewModel}
        sortedRows={sortedRows}
        sortKey={sortKey}
        order={order}
        onSortChange={handleSortChange}
        embedInShell
        qualifyingDividerAfterRank={qualifyingDividerAfterRank}
        titleScopeName={teamDisplay}
        weekLabelInTitle={isWeekly ? resolvedWeekLabel : undefined}
      />
    </>
  )
}
