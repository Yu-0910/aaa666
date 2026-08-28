"use client"



import { useRouter } from "next/navigation"

import { useState, useEffect, useMemo, type ReactNode } from "react"

import { useClientSearchString } from "@/hooks/useIsDesktop"

import RankingUI from "@/components/RankingUI"

import type { RankingViewModel, RankingRow } from "@/lib/ranking/types"

import { loadWeeklyRankingJson } from "@/lib/ranking/jsonLoader"
import { enrichBattingRankingDerivedMetrics } from "@/lib/ranking/enrichRankingDerivedMetrics"

import { lookupRomanInMap } from "@/lib/ranking/romanNameLookup"

import { fetchWeeklyCurrentWeekClient } from "@/lib/ranking/fetchWeeklyCurrentWeekClient"

import { mergeAvailableWeekKeys } from "@/lib/ranking/weeklyAvailableWeekKeys"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { buildWeeklyRankingTopNavGroups } from "@/lib/ranking/rankingNavLinks"

import { shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { fetchMinPAByTeamClient } from "@/lib/ranking/qualifyingThresholdsShared"
import { sortBattingRankingRows } from "@/lib/ranking/sortBattingRankingRows"


import { FullPageLoading } from "@/components/ui/spinner"



interface WeeklyRankingPageClientProps {

  initialViewModel: RankingViewModel

  weekKey: string

  weekLabel: string

  availableWeekKeys: string[]

}



function getDefaultSortOrder(metricKey: string): "asc" | "desc" {

  if (metricKey === "kpct" || metricKey === "k%") return "asc"

  return "desc"

}

function normalizeExplicitNpbId(raw: unknown): string | undefined {

  const id = String(raw ?? "").trim().replace(/[^\d]/g, "")

  return id || undefined

}



function normalizeRankingRow(raw: Record<string, unknown>): RankingRow {

  const romanNameRaw = (

    raw["romanName"] ??

    raw["roman_name"] ??

    raw["RomanName"] ??

    raw["name_en"] ??

    raw["player_name_en"] ??

    ""

  ) as string

  const romanName =

    typeof romanNameRaw === "string" && romanNameRaw.trim() !== "" ? romanNameRaw.trim() : undefined

  const name = String(

    raw["name"] ??

      raw["player"] ??

      raw["player_name_ja"] ??

      raw["選手名"] ??

      raw["名前"] ??

      raw["Name"] ??

      ""

  ).trim()

  const nameValue = name || "不明"
  const playerId = String(raw["playerId"] ?? raw["player_id"] ?? raw["id"] ?? "").trim()
  const explicitNpb = String(raw["npbPlayerId"] ?? raw["npb_player_id"] ?? "").trim()
  const team = String(raw["team"] ?? raw["Team"] ?? raw["チーム"] ?? raw["team_name"] ?? "").trim()
  return enrichBattingRankingDerivedMetrics({

    ...raw,

    rank: raw["rank"] as number,

    playerId,

    npbPlayerId: normalizeExplicitNpbId(explicitNpb),

    name: nameValue,

    romanName,

    team,

  } as RankingRow) as RankingRow

}



async function mergeRomanNamesFromCsv(

  rows: RankingRow[],

  season: string,

  league: string

): Promise<RankingRow[]> {

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin

  const url = `${baseUrl}/api/roman-names/${season}/${league}`

  let map: Record<string, string> = {}

  try {

    const res = await fetch(url, { cache: "no-store" })

    if (res.ok) map = (await res.json()) as Record<string, string>

  } catch {

    return rows

  }

  return rows.map((row) => {

    if (row.romanName && row.romanName.trim()) return row

    const npbId = String(row.npbPlayerId ?? "").replace(/\D/g, "").replace(/^0+/, "")
    const byNpbId = npbId ? map[`npb:${npbId}`]?.trim() : ""
    if (byNpbId) return { ...row, romanName: byNpbId }

    const en = lookupRomanInMap(map, row.name, row.team)

    if (!en) return row

    return { ...row, romanName: en }

  })

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

          当週の規定打席を満たす選手がいません。別の指標を選ぶか、phase28:build:weekly-rankings で週別

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

      この週のランキングデータがまだありません。npm run phase28:build:weekly-rankings を実行してください。

      {league ? ` (${league})` : ""}

    </div>

  )

}



export default function WeeklyRankingPageClient({

  initialViewModel,

  weekKey,

  weekLabel,

  availableWeekKeys: initialWeekKeys,

}: WeeklyRankingPageClientProps) {

  const router = useRouter()

  const clientSearch = useClientSearchString()

  const { sortKey, order } = useMemo(() => {

    const q = clientSearch.replace(/^\?/, "")

    const sp = new URLSearchParams(q)

    const sk = sp.get("sort") || "ops"

    const ord = (sp.get("order") as "asc" | "desc") || getDefaultSortOrder(sk)

    return { sortKey: sk, order: ord }

  }, [clientSearch])
  const pinActiveMetric = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    const sp = new URLSearchParams(q)
    return sp.get("pinActiveMetric") === "1"
  }, [clientSearch])



  const [rowsFromJson, setRowsFromJson] = useState<RankingRow[]>([])

  const [loading, setLoading] = useState(true)

  const [loadError, setLoadError] = useState<string | null>(null)

  const [weekOptions, setWeekOptions] = useState(() =>

    initialWeekKeys.map((k) => ({ weekKey: k, weekLabel: weekLabelForKey(k) }))

  )

  const [minPAByTeamCanonical, setMinPAByTeamCanonical] = useState<Map<string, number> | null>(null)



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

  }, [year, weekKey])



  useEffect(() => {

    if (!is2026) {

      setMinPAByTeamCanonical(null)

      return

    }

    let cancelled = false

    fetchMinPAByTeamClient(year, leagueUpper, weekKey)

      .then((map) => {

        if (!cancelled) setMinPAByTeamCanonical(map.size > 0 ? map : null)

      })

      .catch(() => {

        if (!cancelled) setMinPAByTeamCanonical(null)

      })

    return () => {

      cancelled = true

    }

  }, [is2026, year, leagueUpper, weekKey])



  const metricDef = initialViewModel.metrics.find((m) => m.key === sortKey)



  useEffect(() => {

    if (!metricDef) {

      setRowsFromJson([])

      setLoading(false)

      setLoadError(null)

      return

    }

    let cancelled = false

    setLoading(true)

    setLoadError(null)

    loadWeeklyRankingJson(year, weekKey, league, metricDef.label)

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

        if (!cancelled) setLoading(false)

      })

    return () => {

      cancelled = true

    }

  }, [year, weekKey, league, sortKey, metricDef?.label])



  const { rows: sortedRows, qualifyingDividerAfterRank } = useMemo(
    () =>
      sortBattingRankingRows({
        rows: rowsFromJson,
        metrics: initialViewModel.metrics,
        sortKey,
        order,
        season: year,
        league,
        is2026,
        minPAByTeamCanonical,
      }),
    [rowsFromJson, initialViewModel.metrics, sortKey, order, year, league, is2026, minPAByTeamCanonical]
  )



  const handleSortChange = (metricKey: string) => {

    let newOrder: "asc" | "desc"

    if (sortKey === metricKey) {

      newOrder = order === "asc" ? "desc" : "asc"

    } else {

      newOrder = getDefaultSortOrder(metricKey)

    }

    router.replace(

      `/ranking/weekly/${year}/${weekKey}/${league}?sort=${encodeURIComponent(metricKey)}&order=${newOrder}${pinActiveMetric ? "&pinActiveMetric=1" : ""}`

    )

  }



  const handleWeekChange = (newWeekKey: string) => {

    router.push(

      `/ranking/weekly/${year}/${newWeekKey}/${league}?sort=${encodeURIComponent(sortKey)}&order=${order}${pinActiveMetric ? "&pinActiveMetric=1" : ""}`

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



  const emptyNoData = rowsFromJson.length === 0 && !!metricDef

  const emptyAfterFilter =

    rowsFromJson.length > 0 && sortedRows.length === 0 && shouldRequireQualifyingPA(sortKey)
  const headerNavGroups =
    leagueUpper === "CL" || leagueUpper === "PL"
      ? buildWeeklyRankingTopNavGroups(year, weekKey, leagueUpper, "batting")
      : undefined

  return (

    <WeeklyPageShell emptyNoData={emptyNoData} emptyAfterFilter={emptyAfterFilter} league={league}>

      <RankingUI

        viewModel={{ ...initialViewModel, rows: rowsFromJson }}

        sortedRows={sortedRows}

        sortKey={sortKey}

        order={order}

        onSortChange={handleSortChange}

        rankingPathBase="/ranking/weekly"

        yearOptions={[parseInt(year, 10)]}

        weekLabelInTitle={weekLabel}

        weekSelector={{

          weekKey,

          options: weekOptions.length > 0 ? weekOptions : [{ weekKey, weekLabel }],

          onWeekChange: handleWeekChange,

        }}
        headerNavGroups={headerNavGroups}
        pinActiveMetricNextToPlayer={pinActiveMetric}
        qualifyingDividerAfterRank={qualifyingDividerAfterRank}

      />

    </WeeklyPageShell>

  )

}

