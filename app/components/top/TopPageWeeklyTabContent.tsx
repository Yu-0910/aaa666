"use client"

import { useEffect, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import TopPageLeadersClient from "@/app/components/TopPageLeadersClient"
import TopPagePitchingLeadersClient from "@/app/components/TopPagePitchingLeadersClient"
import type { TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { StandingsLeagueSection } from "@/app/components/top/TopPageStandingsTab"
import {
  fetchCurrentWeekMeta,
  fetchTopWeeklyLeadersForPage,
} from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import { fetchWeeklyStandingsJson } from "@/lib/standings/fetchStandingsJson"
import { fetchWeeklyStandingsWithFallback } from "@/lib/standings/weeklyStandingsFallback"
import { TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/weeklyLeadersSnapshotShared"
import type { WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"
import type { TopWeeklyView } from "@/app/components/common/RankingBottomNav"
import type { StandingsLeague, TeamStandingsJson } from "@/lib/standings/types"

type TopPageWeeklyTabContentProps = {
  year: number
  layout: TopPageLayoutMode
  /** サーバー先読み済み（週メタ + 4 リーグ分 JSON） */
  initialPayload?: WeeklyTabPayload | null
  activeView: TopWeeklyView
}

export function TopPageWeeklyTabContent({
  year,
  layout,
  initialPayload,
  activeView,
}: TopPageWeeklyTabContentProps) {
  const [payload, setPayload] = useState<WeeklyTabPayload | null>(initialPayload ?? null)
  const [standings, setStandings] = useState<WeeklyTabPayload["standings"] | null>(
    initialPayload?.standings ?? null,
  )
  const [standingsWeekMeta, setStandingsWeekMeta] = useState<{
    CL?: { resolvedWeekKey: string; resolvedWeekLabel: string; fellBack: boolean }
    PL?: { resolvedWeekKey: string; resolvedWeekLabel: string; fellBack: boolean }
  } | null>(() => {
    if (!initialPayload?.standings) return null
    return {
      CL: {
        resolvedWeekKey: initialPayload.weekMeta.weekKey,
        resolvedWeekLabel: initialPayload.weekMeta.weekLabel,
        fellBack: false,
      },
      PL: {
        resolvedWeekKey: initialPayload.weekMeta.weekKey,
        resolvedWeekLabel: initialPayload.weekMeta.weekLabel,
        fellBack: false,
      },
    }
  })
  const [standingsLoading, setStandingsLoading] = useState(false)
  const [standingsError, setStandingsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initialPayload)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (year !== Number(TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR)) {
      setLoading(false)
      return
    }
    if (initialPayload) {
      setPayload(initialPayload)
      setStandings(initialPayload.standings ?? null)
      setStandingsWeekMeta(
        initialPayload.standings
          ? {
              CL: {
                resolvedWeekKey: initialPayload.weekMeta.weekKey,
                resolvedWeekLabel: initialPayload.weekMeta.weekLabel,
                fellBack: false,
              },
              PL: {
                resolvedWeekKey: initialPayload.weekMeta.weekKey,
                resolvedWeekLabel: initialPayload.weekMeta.weekLabel,
                fellBack: false,
              },
            }
          : null
      )
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setPayload(null)

    fetchCurrentWeekMeta(year)
      .then(async (weekMeta) => {
        const weekKey = weekMeta.weekKey
        const [clBat, plBat, clPitch, plPitch] = await Promise.all([
          fetchTopWeeklyLeadersForPage(year, "CL", "batting", weekKey),
          fetchTopWeeklyLeadersForPage(year, "PL", "batting", weekKey),
          fetchTopWeeklyLeadersForPage(year, "CL", "pitching", weekKey),
          fetchTopWeeklyLeadersForPage(year, "PL", "pitching", weekKey),
        ])
        if (cancelled) return
        setPayload({
          weekMeta,
          batting: { CL: clBat.config, PL: plBat.config },
          pitching: { CL: clPitch.config, PL: plPitch.config },
        })
        setStandings(null)
        setStandingsWeekMeta(null)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || "今週のデータを取得できませんでした")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, initialPayload])

  useEffect(() => {
    if (!payload?.weekMeta.weekKey) return
    if (activeView !== "cl-standings" && activeView !== "pl-standings") return
    if (standings?.CL && standings?.PL) return

    let cancelled = false
    setStandingsLoading(true)
    setStandingsError(null)

    Promise.all([
      fetchWeeklyStandingsWithFallback(
        year,
        payload.weekMeta.weekKey,
        "CL",
        payload.weekMeta.availableWeekKeys,
        fetchWeeklyStandingsJson,
      ),
      fetchWeeklyStandingsWithFallback(
        year,
        payload.weekMeta.weekKey,
        "PL",
        payload.weekMeta.availableWeekKeys,
        fetchWeeklyStandingsJson,
      ),
    ])
      .then(([clData, plData]) => {
        if (cancelled) return
        setStandings({ CL: clData.data, PL: plData.data })
        setStandingsWeekMeta({
          CL: {
            resolvedWeekKey: clData.resolvedWeekKey,
            resolvedWeekLabel: clData.resolvedWeekLabel,
            fellBack: clData.fellBack,
          },
          PL: {
            resolvedWeekKey: plData.resolvedWeekKey,
            resolvedWeekLabel: plData.resolvedWeekLabel,
            fellBack: plData.fellBack,
          },
        })
        setStandingsLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setStandingsError(err.message || "今週の順位表データを取得できませんでした")
        setStandingsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeView, payload?.weekMeta.weekKey, standings?.CL, standings?.PL, year])

  if (year !== Number(TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR)) {
    return (
      <div className="text-white text-center py-8 text-sm">
        今週タブは {TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR} シーズンのみ表示しています。
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
        <Spinner className="size-8 text-[#FFFF44]" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="text-white text-center py-8 space-y-2 text-sm">
        <p>{error || "今週の成績データがありません"}</p>
        <p className="text-gray-400 text-xs">
          管理者: npm run phase28:build:weekly-rankings → npm run top-weekly-leaders:build:2026
        </p>
      </div>
    )
  }

  const { weekKey, weekLabel } = payload.weekMeta

  const renderLeague = (league: "CL" | "PL") => (
    <div className="space-y-4">
      <TopPageLeadersClient
        year={year}
        league={league}
        layout={layout}
        weekKey={weekKey}
        weekLabel={weekLabel}
        initialData={payload.batting[league]}
      />
      <TopPagePitchingLeadersClient
        year={year}
        league={league}
        layout={layout}
        weekKey={weekKey}
        weekLabel={weekLabel}
        initialData={payload.pitching[league]}
      />
    </div>
  )

  if (activeView === "cl-standings" || activeView === "pl-standings") {
    const league: StandingsLeague = activeView === "cl-standings" ? "CL" : "PL"
    const data: TeamStandingsJson | undefined = standings?.[league]
    const resolvedWeek = standingsWeekMeta?.[league]
    if (standingsLoading) {
      return (
        <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
          <Spinner className="size-8 text-[#FFFF44]" />
        </div>
      )
    }
    if (standingsError || !data) {
      return (
        <div className="text-white text-center py-8 space-y-2 text-sm">
          <p>{standingsError || "今週の順位表データがありません"}</p>
          <p className="text-gray-400 text-xs">
            管理者: npm run phase29:build:standings -- --year {year} --weekly
          </p>
        </div>
      )
    }
    return (
      <StandingsLeagueSection
        league={league}
        data={data}
        layout={layout}
        year={year}
        titleSuffix="今週の順位表"
        subtitle={`Weekly Standings (${resolvedWeek?.resolvedWeekLabel ?? weekLabel})`}
        showTeamPageNote={false}
      />
    )
  }

  return <div className="space-y-6">{renderLeague(activeView === "cl" ? "CL" : "PL")}</div>
}
