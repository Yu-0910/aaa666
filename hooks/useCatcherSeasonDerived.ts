"use client"

import { useEffect, useState } from "react"
import type { CatcherAppearancesApiResponse } from "@/app/api/players/[playerId]/catcher-appearances/route"
import type { CatcherPitchersApiResponse } from "@/app/api/players/[playerId]/catcher-pitchers/route"
import type { CatcherDefenseBasicApiResponse } from "@/app/api/players/[playerId]/catcher-defense-basic/route"
import type { CatcherStartingSummaryApiResponse } from "@/app/api/players/[playerId]/catcher-starting-summary/route"
import type { CatcherPaRoundPitchTypesApiResponse } from "@/app/api/players/[playerId]/catcher-pa-round-pitch-types/route"
import {
  EMPTY_CATCHER_SEASON_DERIVED,
  type CatcherSeasonDerivedState,
} from "@/lib/catcherSeasonDerivedTypes"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

export type UseCatcherSeasonDerivedOptions = {
  enabled: boolean
  playerId: string
  rosterKnownCatcher: boolean
  /** 派生出場なしかつ名簿非捕手のとき、捕手タブから離れる */
  onLeaveCatcherTab?: () => void
}

export function useCatcherSeasonDerived(
  options: UseCatcherSeasonDerivedOptions
): CatcherSeasonDerivedState {
  const { enabled, playerId, rosterKnownCatcher, onLeaveCatcherTab } = options
  const [state, setState] = useState<CatcherSeasonDerivedState>(EMPTY_CATCHER_SEASON_DERIVED)

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY_CATCHER_SEASON_DERIVED)
      return
    }
    const id = playerId.trim()
    if (!id) {
      setState(EMPTY_CATCHER_SEASON_DERIVED)
      return
    }

    let cancelled = false
    const y = DERIVED_SEASON_YEAR_DEFAULT
    const zeroAppearances = { gamesAsCatcher: 0, gameIds: [] as string[] }
    const enc = encodeURIComponent(id)

    const fetchJson = <T,>(path: string) =>
      fetch(`${path}?year=${encodeURIComponent(y)}`, { cache: "no-store" }).then((r) =>
        r.ok ? (r.json() as Promise<T>) : null
      )

    Promise.all([
      fetchJson<CatcherAppearancesApiResponse>(`/api/players/${enc}/catcher-appearances`),
      fetchJson<CatcherPitchersApiResponse>(`/api/players/${enc}/catcher-pitchers`),
      fetchJson<CatcherDefenseBasicApiResponse>(`/api/players/${enc}/catcher-defense-basic`),
      fetchJson<CatcherStartingSummaryApiResponse>(`/api/players/${enc}/catcher-starting-summary`),
      fetchJson<CatcherPaRoundPitchTypesApiResponse>(
        `/api/players/${enc}/catcher-pa-round-pitch-types`
      ),
    ])
      .then(([appearances, pitchers, defense, starting, paRound]) => {
        if (cancelled) return

        let appearancesPayload = appearances?.hasData ? appearances.payload : null
        if (!appearancesPayload) {
          if (rosterKnownCatcher) {
            appearancesPayload = zeroAppearances
          } else {
            onLeaveCatcherTab?.()
          }
        }

        setState({
          appearances: appearancesPayload,
          pitchers: pitchers?.hasData && pitchers.payload?.rows ? pitchers.payload.rows : [],
          seasonTotals:
            pitchers?.hasData && pitchers.payload?.seasonTotals
              ? pitchers.payload.seasonTotals
              : null,
          defenseBasic:
            defense?.hasData && defense.payload
              ? {
                  sbAttempts: defense.payload.sbAttempts,
                  sb: defense.payload.sb,
                  cs: defense.payload.cs,
                  csPct: defense.payload.csPct,
                  pb: defense.payload.pb ?? 0,
                  pitches: defense.payload.pitches ?? 0,
                  battedBallOuts: defense.payload.battedBallOuts ?? null,
                }
              : null,
          startingSummary: starting?.hasData && starting.payload ? starting.payload : null,
          paRoundPitchTypes:
            paRound?.hasData && paRound.payload?.byPaRoundPitchTypes
              ? paRound.payload.byPaRoundPitchTypes
              : [],
          paRoundPitchTypesVsL:
            paRound?.hasData && paRound.payload?.byPaRoundPitchTypesVsL
              ? paRound.payload.byPaRoundPitchTypesVsL
              : [],
          paRoundPitchTypesVsR:
            paRound?.hasData && paRound.payload?.byPaRoundPitchTypesVsR
              ? paRound.payload.byPaRoundPitchTypesVsR
              : [],
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({
          appearances: rosterKnownCatcher ? zeroAppearances : null,
          pitchers: [],
          seasonTotals: null,
          defenseBasic: null,
          startingSummary: null,
          paRoundPitchTypes: [],
          paRoundPitchTypesVsL: [],
          paRoundPitchTypesVsR: [],
        })
        if (!rosterKnownCatcher) onLeaveCatcherTab?.()
      })

    return () => {
      cancelled = true
    }
  }, [enabled, playerId, rosterKnownCatcher, onLeaveCatcherTab])

  return state
}
