"use client"

import { useEffect, useMemo, useState } from "react"
import type { RankingRow, RankingViewModel } from "@/lib/ranking/types"
import { loadRankingJson, loadWeeklyRankingJson } from "@/lib/ranking/jsonLoader"
import { shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { fetchMinPAByTeamClient } from "@/lib/ranking/qualifyingThresholdsShared"
import {
  getDefaultBattingSortOrder,
  mergeRomanNamesFromCsv,
  normalizeRankingRow,
} from "@/lib/ranking/normalizeRankingRow"
import { sortBattingRankingRows } from "@/lib/ranking/sortBattingRankingRows"
import { useClientSearchString } from "@/hooks/useIsDesktop"

export type UseBattingRankingTableOptions = {
  initialViewModel: RankingViewModel
  teamCode?: string
  weekKey?: string
}

export function useBattingRankingTable({
  initialViewModel,
  teamCode,
  weekKey,
}: UseBattingRankingTableOptions) {
  const clientSearch = useClientSearchString()
  const { sortKey, order, yahooPoc, yahooGameId } = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    const sp = new URLSearchParams(q)
    const sk = sp.get("sort") || "ops"
    const ord = (sp.get("order") as "asc" | "desc") || getDefaultBattingSortOrder(sk)
    return {
      sortKey: sk,
      order: ord,
      yahooPoc: sp.get("yahooPoc") === "1",
      yahooGameId: sp.get("yahooGameId") || "2021038624",
    }
  }, [clientSearch])

  const [rowsFromJson, setRowsFromJson] = useState<RankingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [minPAByTeamCanonical, setMinPAByTeamCanonical] = useState<Map<string, number> | null>(null)

  const season = initialViewModel.season
  const leagueUpper = initialViewModel.league.toUpperCase()
  const is2026 = season === "2026"
  const metricDef = initialViewModel.metrics.find((m) => m.key === sortKey)

  useEffect(() => {
    if (!is2026) {
      setMinPAByTeamCanonical(null)
      return
    }
    let cancelled = false
    fetchMinPAByTeamClient(season, leagueUpper, weekKey)
      .then((map) => {
        if (!cancelled) setMinPAByTeamCanonical(map.size > 0 ? map : null)
      })
      .catch(() => {
        if (!cancelled) setMinPAByTeamCanonical(null)
      })
    return () => {
      cancelled = true
    }
  }, [is2026, season, leagueUpper, weekKey])

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
    const loadJson = weekKey
      ? loadWeeklyRankingJson(
          initialViewModel.season,
          weekKey,
          initialViewModel.league,
          metricDef.label,
        )
      : loadRankingJson(
          initialViewModel.season,
          initialViewModel.league,
          metricDef.label,
          teamCode ? true : !shouldRequireQualifyingPA(metricDef.key),
        )
    loadJson
      .then((data: unknown) => {
        if (cancelled) return
        const rawRows = Array.isArray(data) ? data : (data as { rows?: unknown[] })?.rows ?? []
        const rows: RankingRow[] = (rawRows as Record<string, unknown>[]).map(normalizeRankingRow)
        return mergeRomanNamesFromCsv(rows, initialViewModel.season, initialViewModel.league)
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
  }, [
    initialViewModel.season,
    initialViewModel.league,
    sortKey,
    metricDef?.label,
    yahooPoc,
    yahooGameId,
    teamCode,
    weekKey,
  ])

  const { rows: sortedRows, qualifyingDividerAfterRank } = useMemo(
    () =>
      sortBattingRankingRows({
        rows: rowsFromJson,
        metrics: initialViewModel.metrics,
        sortKey,
        order,
        season: initialViewModel.season,
        league: initialViewModel.league,
        yahooPoc,
        is2026,
        minPAByTeamCanonical,
        teamCode,
      }),
    [
      rowsFromJson,
      initialViewModel.metrics,
      initialViewModel.season,
      initialViewModel.league,
      sortKey,
      order,
      yahooPoc,
      is2026,
      minPAByTeamCanonical,
      teamCode,
    ],
  )

  return {
    sortKey,
    order,
    yahooPoc,
    yahooGameId,
    rowsFromJson,
    sortedRows,
    qualifyingDividerAfterRank,
    loading,
    loadError,
  }
}
