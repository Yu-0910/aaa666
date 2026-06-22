"use client"

import { useEffect, useState } from "react"
import type { BatterVsTeamCountPitchTypesApiResponse } from "@/app/api/players/[playerId]/batter-vs-team-count-pitch-types/route"
import type { BatterVsTeamCountPitchTypesFile } from "@/lib/batterVsTeamCountPitchTypesTypes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export type BatterVsTeamCountPitchTypesDerivedState = {
  settled: boolean
  loading: boolean
  hasData: boolean
  payload: BatterVsTeamCountPitchTypesFile | null
}

const EMPTY: BatterVsTeamCountPitchTypesDerivedState = {
  settled: false,
  loading: false,
  hasData: false,
  payload: null,
}

export type UseBatterVsTeamCountPitchTypesDerivedOptions = {
  enabled: boolean
  playerId: string
  year?: string
}

export function useBatterVsTeamCountPitchTypesDerived(
  options: UseBatterVsTeamCountPitchTypesDerivedOptions,
): BatterVsTeamCountPitchTypesDerivedState {
  const { enabled, playerId, year = DERIVED_SEASON_YEAR_DEFAULT } = options
  const [state, setState] = useState<BatterVsTeamCountPitchTypesDerivedState>(EMPTY)

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY)
      return
    }
    const id = playerId.trim()
    if (!id) {
      setState({ ...EMPTY, settled: true })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, settled: false }))

    const enc = encodeURIComponent(id)
    fetch(
      `/api/players/${enc}/batter-vs-team-count-pitch-types?year=${encodeURIComponent(year)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<BatterVsTeamCountPitchTypesApiResponse>) : null))
      .then((json) => {
        if (cancelled) return
        const payload = json?.hasData ? json.payload ?? null : null
        setState({
          settled: true,
          loading: false,
          hasData: payload != null,
          payload,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({ settled: true, loading: false, hasData: false, payload: null })
      })

    return () => {
      cancelled = true
    }
  }, [enabled, playerId, year])

  return state
}
