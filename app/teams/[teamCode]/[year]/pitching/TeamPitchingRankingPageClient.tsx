"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import RankingUI from "@/components/RankingUI"
import type { RankingViewModel } from "@/lib/ranking/types"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"
import { usePitchingRankingTable } from "@/hooks/usePitchingRankingTable"
import { fetchWeeklyCurrentWeekClient } from "@/lib/ranking/fetchWeeklyCurrentWeekClient"
import { mergeAvailableWeekKeys } from "@/lib/ranking/weeklyAvailableWeekKeys"
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

export default function TeamPitchingRankingPageClient({
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
      setWeekOptions((current) =>
        mergeAvailableWeekKeys(
          current.map((w) => w.weekKey),
          meta.availableWeekKeys,
          weekKey
        ).map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [isWeekly, initialViewModel.season])

  const {
    sortKey,
    order,
    rowsFromJson,
    sortedRows,
    loadError,
    fetchSettled,
    metricDef,
    qualifyingDividerAfterRank,
  } = usePitchingRankingTable({ initialViewModel, teamCode, weekKey })

  const handleSortChange = (metricKey: string) => {
    let newOrder: "asc" | "desc"
    if (sortKey === metricKey) {
      newOrder = order === "asc" ? "desc" : "asc"
    } else {
      newOrder = getPitchingSortOrderForKey(metricKey)
    }
    router.replace(
      teamPageHref({
        teamCode,
        year: initialViewModel.season,
        subTab: "pitching",
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
        subTab: "pitching",
        weekKey: newWeekKey,
        sort: sortKey,
        order,
      }),
    )
  }

  if (loadError) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] px-4 py-8 text-center">
        <p className="text-sm text-gray-400 leading-relaxed">{loadError}</p>
      </div>
    )
  }

  if (metricDef && !fetchSettled) {
    return <FullPageLoading />
  }

  const emptyNoData = fetchSettled && rowsFromJson.length === 0 && !!metricDef
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
      {!loadError && emptyNoData && (
        <div className="border border-amber-900/50 bg-amber-950/40 px-3 py-2 mb-3 text-center text-xs sm:text-sm text-amber-100/90">
          この指標のランキングデータがまだありません。
        </div>
      )}
      <RankingUI
        viewModel={initialViewModel}
        sortedRows={sortedRows}
        sortKey={sortKey}
        order={order}
        onSortChange={handleSortChange}
        metricLabelFallback="投球成績"
        embedInShell
        qualifyingDividerAfterRank={qualifyingDividerAfterRank}
        titleScopeName={teamDisplay}
        weekLabelInTitle={isWeekly ? resolvedWeekLabel : undefined}
      />
    </>
  )
}
