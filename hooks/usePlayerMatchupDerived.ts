"use client"

import { useEffect, useState } from "react"
import type { MatchupBattingApiResponse } from "@/app/api/players/[playerId]/matchup-batting/route"
import type { MatchupPitchingApiResponse } from "@/app/api/players/[playerId]/matchup-pitching/route"
import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import { PLAYER_MATCHUP_DISPLAY_YEAR } from "@/lib/playerMatchupSeasonTab"

export type PlayerMatchupDerivedState = {
  settled: boolean
  loading: boolean
  hasData: boolean
  payload: PlayerMatchupDerived | null
}

const EMPTY: PlayerMatchupDerivedState = {
  settled: false,
  loading: false,
  hasData: false,
  payload: null,
}

export type UsePlayerMatchupDerivedOptions = {
  enabled: boolean
  playerId: string
  role: "batter" | "pitcher"
}

export function usePlayerMatchupDerived(
  options: UsePlayerMatchupDerivedOptions,
): PlayerMatchupDerivedState {
  const { enabled, playerId, role } = options
  const [state, setState] = useState<PlayerMatchupDerivedState>(EMPTY)

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
    const path =
      role === "batter"
        ? `/api/players/${enc}/matchup-batting`
        : `/api/players/${enc}/matchup-pitching`

    fetch(`${path}?year=${encodeURIComponent(PLAYER_MATCHUP_DISPLAY_YEAR)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MatchupBattingApiResponse | MatchupPitchingApiResponse>) : null))
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
  }, [enabled, playerId, role])

  return state
}
