"use client"

import { useEffect, useState } from "react"
import type { PlayerGameLogApiResponse } from "@/app/api/players/[playerId]/game-log/route"

export type PlayerGameLogDerivedState = {
  settled: boolean
  loading: boolean
  payload: PlayerGameLogApiResponse["payload"]
}

const EMPTY: PlayerGameLogDerivedState = {
  settled: false,
  loading: false,
  payload: null,
}

export function usePlayerGameLogDerived(options: {
  enabled: boolean
  playerId: string
}) {
  const { enabled, playerId } = options
  const [state, setState] = useState<PlayerGameLogDerivedState>(EMPTY)

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY)
      return
    }
    const id = playerId.trim()
    if (!id) {
      setState({ settled: true, loading: false, payload: null })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, settled: false }))
    fetch(`/api/players/${encodeURIComponent(id)}/game-log?year=2026`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<PlayerGameLogApiResponse>) : null))
      .then((json) => {
        if (cancelled) return
        setState({
          settled: true,
          loading: false,
          payload: json?.payload ?? null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({ settled: true, loading: false, payload: null })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, playerId])

  return state
}

