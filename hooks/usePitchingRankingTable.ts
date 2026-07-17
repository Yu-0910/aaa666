"use client"

import { useEffect, useMemo, useState } from "react"
import type { RankingRow, RankingViewModel } from "@/lib/ranking/types"
import { loadPitchingRankingJson, loadWeeklyPitchingRankingJson } from "@/lib/ranking/jsonLoader"
import {
  shouldRequireQualifyingPitching,
  computePitchingQualifyingMinIpByTeam,
  type PitchingQualifyingThresholds,
} from "@/lib/ranking/qualifyingPitching"
import { fetchPitchingThresholdsClient } from "@/lib/ranking/qualifyingThresholdsShared"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"
import { mergeRomanNamesFromCsv, normalizeRankingRow } from "@/lib/ranking/normalizeRankingRow"
import { sortPitchingRankingRows } from "@/lib/ranking/sortPitchingRankingRows"
import { useClientSearchString } from "@/hooks/useIsDesktop"

export type UsePitchingRankingTableOptions = {
  initialViewModel: RankingViewModel
  teamCode?: string
  weekKey?: string
}

export function usePitchingRankingTable({
  initialViewModel,
  teamCode,
  weekKey,
}: UsePitchingRankingTableOptions) {
  const clientSearch = useClientSearchString()
  const { sortKey, order } = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    const sp = new URLSearchParams(q)
    const sk = sp.get("sort") || "era"
    const ord = (sp.get("order") as "asc" | "desc") || getPitchingSortOrderForKey(sk)
    return { sortKey: sk, order: ord }
  }, [clientSearch])

  const [rowsFromJson, setRowsFromJson] = useState<RankingRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetchSettled, setFetchSettled] = useState(false)
  const [pitchingThresholdsCanonical, setPitchingThresholdsCanonical] =
    useState<PitchingQualifyingThresholds | null>(null)

  const season = initialViewModel.season
  const leagueUpper = initialViewModel.league.toUpperCase()
  const is2026 = season === "2026"
  const metricDef = initialViewModel.metrics.find((m) => m.key === sortKey)

  useEffect(() => {
    if (!is2026) {
      setPitchingThresholdsCanonical(null)
      return
    }
    let cancelled = false
    fetchPitchingThresholdsClient(season, leagueUpper, weekKey)
      .then((t) => {
        if (!cancelled) setPitchingThresholdsCanonical(t)
      })
      .catch(() => {
        if (!cancelled) setPitchingThresholdsCanonical(null)
      })
    return () => {
      cancelled = true
    }
  }, [is2026, season, leagueUpper, weekKey])

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
    const loadJson = weekKey
      ? loadWeeklyPitchingRankingJson(
          initialViewModel.season,
          weekKey,
          initialViewModel.league,
          metricDef.label,
          Boolean(teamCode),
        )
      : loadPitchingRankingJson(
          initialViewModel.season,
          initialViewModel.league,
          metricDef.label,
          teamCode ? true : !shouldRequireQualifyingPitching(metricDef.key),
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
        const missingDataHint = is2026
          ? "2026年の投手ランキングデータが見つかりません（JSON 未配置の可能性）。npm run phase19:build:pitching-rankings を実行してください。"
          : `${season}年の投手ランキングデータが見つかりません。npm run pitching-rankings:build:historical を実行してください。`
        setLoadError(
          e.message?.includes("404")
            ? missingDataHint
            : e.message || "データの読み込みに失敗しました",
        )
        setRowsFromJson([])
      })
      .finally(() => {
        if (!cancelled) setFetchSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [initialViewModel.season, initialViewModel.league, sortKey, metricDef?.label, teamCode, weekKey])

  const pitchingQualifyingThresholds = useMemo(() => {
    if (is2026 && pitchingThresholdsCanonical) return pitchingThresholdsCanonical
    return computePitchingQualifyingMinIpByTeam(rowsFromJson)
  }, [is2026, pitchingThresholdsCanonical, rowsFromJson])

  const { rows: sortedRows, qualifyingDividerAfterRank } = useMemo(
    () =>
      sortPitchingRankingRows({
        rows: rowsFromJson,
        metrics: initialViewModel.metrics,
        sortKey,
        order,
        pitchingQualifyingThresholds,
        teamCode,
        skipTeamQualifyingFilter: Boolean(teamCode && weekKey),
      }),
    [
      rowsFromJson,
      initialViewModel.metrics,
      sortKey,
      order,
      pitchingQualifyingThresholds,
      teamCode,
      weekKey,
    ],
  )

  return {
    sortKey,
    order,
    rowsFromJson,
    sortedRows,
    qualifyingDividerAfterRank,
    loadError,
    fetchSettled,
    metricDef,
  }
}
