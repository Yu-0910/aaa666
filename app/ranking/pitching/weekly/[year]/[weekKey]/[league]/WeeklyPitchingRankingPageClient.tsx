"use client"



import { useRouter } from "next/navigation"

import { useState, useEffect, useMemo, type ReactNode } from "react"

import { useClientSearchString } from "@/hooks/useIsDesktop"

import RankingUI from "@/components/RankingUI"

import type { RankingViewModel, RankingRow } from "@/lib/ranking/types"

import { loadWeeklyPitchingRankingJson } from "@/lib/ranking/jsonLoader"

import {

  shouldRequireQualifyingPitching,

  computePitchingQualifyingMinIpByTeam,

  rowMeetsPitchingQualifyingIp,

  type PitchingQualifyingThresholds,

} from "@/lib/ranking/qualifyingPitching"

import { fetchPitchingThresholdsClient } from "@/lib/ranking/qualifyingThresholdsShared"


import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"

import { mergeRomanNamesFromCsv, normalizeRankingRow } from "@/lib/ranking/normalizeRankingRow"

import { fetchWeeklyCurrentWeekClient } from "@/lib/ranking/fetchWeeklyCurrentWeekClient"

import { mergeAvailableWeekKeys } from "@/lib/ranking/weeklyAvailableWeekKeys"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { buildWeeklyRankingTopNavGroups } from "@/lib/ranking/rankingNavLinks"

import { FullPageLoading } from "@/components/ui/spinner"



interface WeeklyPitchingRankingPageClientProps {

  initialViewModel: RankingViewModel

  weekKey: string

  weekLabel: string

  availableWeekKeys: string[]

}



function WeeklyPageShell({

  children,

  emptyNoData,

  emptyAfterFilter,

  league,

}: {

  children: ReactNode

  emptyNoData: boolean

  emptyAfterFilter: boolean

  league: string

}) {

  return (

    <div className="min-h-screen bg-black text-white flex flex-col">

      {emptyNoData && <WeeklyEmptyBanner league={league} />}

      {emptyAfterFilter && (

        <div className="border-b border-[#444] bg-[#141414] px-3 py-2 text-center text-xs sm:text-sm text-gray-400">

          当週の規定投球回を満たす選手がいません。別の指標を選ぶか、phase28:build:weekly-rankings で週別

          team-games.json を生成してください。

        </div>

      )}

      {children}

    </div>

  )

}



function WeeklyEmptyBanner({ league }: { league: string }) {

  return (

    <div className="border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-center text-xs sm:text-sm text-amber-100/90">

      この週の投手ランキングデータがまだありません。npm run phase28:build:weekly-rankings を実行してください。

      {league ? ` (${league})` : ""}

    </div>

  )

}



export default function WeeklyPitchingRankingPageClient({

  initialViewModel,

  weekKey,

  weekLabel,

  availableWeekKeys: initialWeekKeys,

}: WeeklyPitchingRankingPageClientProps) {

  const router = useRouter()

  const clientSearch = useClientSearchString()

  const { sortKey, order } = useMemo(() => {

    const q = clientSearch.replace(/^\?/, "")

    const sp = new URLSearchParams(q)

    const sk = sp.get("sort") || "era"

    const ord = (sp.get("order") as "asc" | "desc") || getPitchingSortOrderForKey(sk)

    return { sortKey: sk, order: ord }

  }, [clientSearch])
  const pinActiveMetric = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    const sp = new URLSearchParams(q)
    return sp.get("pinActiveMetric") === "1"
  }, [clientSearch])



  const [rowsFromJson, setRowsFromJson] = useState<RankingRow[]>([])

  const [loadError, setLoadError] = useState<string | null>(null)

  const [fetchSettled, setFetchSettled] = useState(false)

  const [weekOptions, setWeekOptions] = useState(() =>

    initialWeekKeys.map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) }))

  )

  const [pitchingThresholdsCanonical, setPitchingThresholdsCanonical] =

    useState<PitchingQualifyingThresholds | null>(null)



  const year = initialViewModel.season

  const league = initialViewModel.league

  const leagueUpper = league.toUpperCase()

  const is2026 = year === "2026"



  useEffect(() => {

    let cancelled = false

    fetchWeeklyCurrentWeekClient(year).then((meta) => {

      if (cancelled || !meta?.availableWeekKeys?.length) return

      setWeekOptions((current) =>
        mergeAvailableWeekKeys(
          current.map((w) => w.weekKey),
          meta.availableWeekKeys,
          weekKey
        ).map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) }))
      )

    })

    return () => {

      cancelled = true

    }

  }, [year])



  useEffect(() => {

    if (!is2026) {

      setPitchingThresholdsCanonical(null)

      return

    }

    let cancelled = false

    fetchPitchingThresholdsClient(year, leagueUpper, weekKey)

      .then((t) => {

        if (!cancelled) setPitchingThresholdsCanonical(t)

      })

      .catch(() => {

        if (!cancelled) setPitchingThresholdsCanonical(null)

      })

    return () => {

      cancelled = true

    }

  }, [is2026, year, leagueUpper, weekKey])



  const metricDef = initialViewModel.metrics.find((m) => m.key === sortKey)



  useEffect(() => {

    if (!metricDef) {

      setRowsFromJson([])

      setLoadError(null)

      setFetchSettled(true)

      return

    }

    let cancelled = false

    setLoadError(null)

    setFetchSettled(false)

    loadWeeklyPitchingRankingJson(year, weekKey, league, metricDef.label)

      .then((data: unknown) => {

        if (cancelled) return

        const rawRows = Array.isArray(data) ? data : (data as { rows?: unknown[] })?.rows ?? []

        const rows: RankingRow[] = (rawRows as Record<string, unknown>[]).map(normalizeRankingRow)

        return mergeRomanNamesFromCsv(rows, year, league)

      })

      .then((rows) => {

        if (cancelled || rows == null) return

        setRowsFromJson(rows)

        setLoadError(null)

      })

      .catch((e: Error) => {

        if (cancelled) return

        setLoadError(e.message || "データの読み込みに失敗しました")

        setRowsFromJson([])

      })

      .finally(() => {

        if (!cancelled) setFetchSettled(true)

      })

    return () => {

      cancelled = true

    }

  }, [year, weekKey, league, sortKey, metricDef?.label])



  const pitchingQualifyingThresholds = useMemo(() => {

    if (is2026 && pitchingThresholdsCanonical) return pitchingThresholdsCanonical

    return computePitchingQualifyingMinIpByTeam(rowsFromJson)

  }, [is2026, pitchingThresholdsCanonical, rowsFromJson])



  const sortedRows = useMemo(() => {

    const rows = rowsFromJson

    const metric = initialViewModel.metrics.find((m) => m.key === sortKey)

    if (!metric) return rows



    const requiresQ = shouldRequireQualifyingPitching(metric.key)

    const canApply =

      requiresQ && rows.length > 0 && pitchingQualifyingThresholds.fallbackMinIp > 0



    let filteredRows = rows

    if (canApply) {

      filteredRows = rows.filter((row) =>

        rowMeetsPitchingQualifyingIp(row, pitchingQualifyingThresholds)

      )

    }



    const sorted = [...filteredRows].sort((a, b) => {

      const aValue = a[metric.key]

      const bValue = b[metric.key]

      if (aValue === null || aValue === undefined) return 1

      if (bValue === null || bValue === undefined) return -1

      if (isNaN(Number(aValue))) return 1

      if (isNaN(Number(bValue))) return -1

      if (order === "asc") return Number(aValue) - Number(bValue)

      return Number(bValue) - Number(aValue)

    })



    return sorted.map((row, index) => ({

      ...row,

      rank: index + 1,

    }))

  }, [rowsFromJson, initialViewModel.metrics, sortKey, order, pitchingQualifyingThresholds])



  const handleSortChange = (metricKey: string) => {

    let newOrder: "asc" | "desc"

    if (sortKey === metricKey) {

      newOrder = order === "asc" ? "desc" : "asc"

    } else {

      newOrder = getPitchingSortOrderForKey(metricKey)

    }

    router.replace(

      `/ranking/pitching/weekly/${year}/${weekKey}/${league}?sort=${encodeURIComponent(metricKey)}&order=${newOrder}${pinActiveMetric ? "&pinActiveMetric=1" : ""}`

    )

  }



  const handleWeekChange = (newWeekKey: string) => {

    router.push(

      `/ranking/pitching/weekly/${year}/${newWeekKey}/${league}?sort=${encodeURIComponent(sortKey)}&order=${order}${pinActiveMetric ? "&pinActiveMetric=1" : ""}`

    )

  }



  if (loadError) {

    return (

      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">

        <div className="text-center max-w-lg">

          <h1 className="text-2xl font-bold mb-4">エラー</h1>

          <p className="text-gray-400 text-sm leading-relaxed">{loadError}</p>

        </div>

      </div>

    )

  }



  if (metricDef && !fetchSettled) {

    return <FullPageLoading />

  }



  const emptyNoData = fetchSettled && rowsFromJson.length === 0 && !!metricDef

  const emptyAfterFilter =

    fetchSettled &&

    rowsFromJson.length > 0 &&

    sortedRows.length === 0 &&

    shouldRequireQualifyingPitching(sortKey)
  const headerNavGroups =
    leagueUpper === "CL" || leagueUpper === "PL"
      ? buildWeeklyRankingTopNavGroups(year, weekKey, leagueUpper, "pitching")
      : undefined

  return (

    <WeeklyPageShell

      emptyNoData={emptyNoData}

      emptyAfterFilter={emptyAfterFilter}

      league={league}

    >

      <RankingUI

        viewModel={{ ...initialViewModel, rows: rowsFromJson }}

        sortedRows={sortedRows}

        sortKey={sortKey}

        order={order}

        onSortChange={handleSortChange}

        rankingPathBase="/ranking/pitching/weekly"

        metricLabelFallback="投球成績"

        yearOptions={[2026]}

        weekLabelInTitle={weekLabel}

        weekSelector={{

          weekKey,

          options: weekOptions.length > 0 ? weekOptions : [{ weekKey, weekLabel }],

          onWeekChange: handleWeekChange,

        }}
        headerNavGroups={headerNavGroups}
        pinActiveMetricNextToPlayer={pinActiveMetric}

      />

    </WeeklyPageShell>

  )

}

