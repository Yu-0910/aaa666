"use client"

import { useEffect, useMemo, useState } from "react"
import type { CatcherAppearancesApiResponse } from "@/app/api/players/[playerId]/catcher-appearances/route"
import type { CatcherDefenseBasicApiResponse } from "@/app/api/players/[playerId]/catcher-defense-basic/route"
import type { CatcherPitchersApiResponse } from "@/app/api/players/[playerId]/catcher-pitchers/route"
import type { CatcherStartingSummaryApiResponse } from "@/app/api/players/[playerId]/catcher-starting-summary/route"
import { useClientSearchString } from "@/hooks/useIsDesktop"
import { lookupRomanInMap } from "@/lib/ranking/romanNameLookup"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  TEAM_CATCHER_DEFAULT_SORT_KEY,
  TEAM_CATCHER_DEFAULT_SORT_ORDER,
  TEAM_CATCHER_SORT_KEYS,
  type TeamCatcherSortKey,
} from "@/lib/teamPage/teamCatcherColumns"
import { sortTeamCatcherRows } from "@/lib/teamPage/sortTeamCatcherRows"
import {
  buildTeamCatcherStatsRow,
  type TeamCatcherRosterSeed,
  type TeamCatcherStatsRow,
} from "@/lib/teamPage/teamCatcherRoster"
import type { CatcherApiBundle } from "@/lib/teamPage/teamCatcherBasicStats"

function parseCatcherSortFromSearch(search: string): {
  sortKey: TeamCatcherSortKey
  order: "asc" | "desc"
} {
  const sp = new URLSearchParams(search.replace(/^\?/, ""))
  const sortRaw = sp.get("sort") ?? TEAM_CATCHER_DEFAULT_SORT_KEY
  const orderRaw = sp.get("order")
  const sortKey = (TEAM_CATCHER_SORT_KEYS as readonly string[]).includes(sortRaw)
    ? (sortRaw as TeamCatcherSortKey)
    : TEAM_CATCHER_DEFAULT_SORT_KEY
  const order =
    orderRaw === "asc" || orderRaw === "desc" ? orderRaw : TEAM_CATCHER_DEFAULT_SORT_ORDER
  return { sortKey, order }
}

async function fetchRomanNameMap(
  year: string,
  league: string,
): Promise<Record<string, string>> {
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin
  const url = `${baseUrl}/api/roman-names/${year}/${league}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (res.ok) return (await res.json()) as Record<string, string>
  } catch {
    /* ignore */
  }
  return {}
}

async function fetchCatcherBundle(
  seed: TeamCatcherRosterSeed,
  year: string,
): Promise<TeamCatcherStatsRow> {
  const enc = encodeURIComponent(seed.npbPlayerId)
  const q = `year=${encodeURIComponent(year)}`
  const fetchJson = <T,>(path: string) =>
    fetch(`${path}?${q}`, { cache: "no-store" }).then((r) =>
      r.ok ? (r.json() as Promise<T>) : null,
    )

  const [appearances, defense, starting, pitchers] = await Promise.all([
    fetchJson<CatcherAppearancesApiResponse>(`/api/players/${enc}/catcher-appearances`),
    fetchJson<CatcherDefenseBasicApiResponse>(`/api/players/${enc}/catcher-defense-basic`),
    fetchJson<CatcherStartingSummaryApiResponse>(`/api/players/${enc}/catcher-starting-summary`),
    fetchJson<CatcherPitchersApiResponse>(`/api/players/${enc}/catcher-pitchers`),
  ])

  const api: CatcherApiBundle = {
    gamesAsCatcher:
      appearances?.hasData && appearances.payload ? appearances.payload.gamesAsCatcher : null,
    defense: defense?.hasData && defense.payload ? defense.payload : null,
    starting: starting?.hasData && starting.payload ? starting.payload : null,
    pitcherRows: pitchers?.hasData && pitchers.payload?.rows ? pitchers.payload.rows : [],
    seasonTotals:
      pitchers?.hasData && pitchers.payload?.seasonTotals
        ? pitchers.payload.seasonTotals
        : null,
  }

  return buildTeamCatcherStatsRow(seed, api)
}

function mergeRomanNames(
  rows: TeamCatcherStatsRow[],
  romanMap: Record<string, string>,
  teamShort: string,
): TeamCatcherStatsRow[] {
  return rows.map((row) => {
    if (row.romanName?.trim()) return row
    const en = lookupRomanInMap(romanMap, row.nameJa, teamShort)
    return en ? { ...row, romanName: en } : row
  })
}

export type UseTeamCatcherStatsRowsOptions = {
  seeds: TeamCatcherRosterSeed[]
  year: string
  teamCode: string
  league: "CL" | "PL"
}

export function useTeamCatcherStatsRows({
  seeds,
  year,
  teamCode,
  league,
}: UseTeamCatcherStatsRowsOptions) {
  const clientSearch = useClientSearchString()
  const { sortKey, order } = useMemo(
    () => parseCatcherSortFromSearch(clientSearch),
    [clientSearch],
  )

  const [rows, setRows] = useState<TeamCatcherStatsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const seedKey = useMemo(() => seeds.map((s) => s.npbPlayerId).join("|"), [seeds])
  const teamShort = teamShortFromCode(teamCode)

  useEffect(() => {
    if (seeds.length === 0) {
      setRows([])
      setLoading(false)
      setLoadError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([
      Promise.all(seeds.map((seed) => fetchCatcherBundle(seed, year))),
      fetchRomanNameMap(year, league),
    ])
      .then(([built, romanMap]) => {
        if (cancelled) return
        const withRoman = mergeRomanNames(built, romanMap, teamShort)
        setRows(withRoman)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLoadError(e.message || "データの読み込みに失敗しました")
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [seedKey, seeds, year, league, teamShort])

  const sortedRows = useMemo(
    () => sortTeamCatcherRows(rows, sortKey, order),
    [rows, sortKey, order],
  )

  const hasAnyDerivedData = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.gamesAsCatcher ?? 0) > 0 ||
          r.pitches != null ||
          r.bf != null ||
          r.starts != null,
      ),
    [rows],
  )

  return { sortKey, order, sortedRows, loading, loadError, hasAnyDerivedData, seedCount: seeds.length }
}
