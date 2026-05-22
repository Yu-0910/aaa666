"use client"

import { useEffect, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import TopPageLeadersClient from "@/app/components/TopPageLeadersClient"
import TopPagePitchingLeadersClient from "@/app/components/TopPagePitchingLeadersClient"
import type { TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import {
  fetchCurrentWeekMeta,
  fetchTopWeeklyLeadersForPage,
} from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import { TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/weeklyLeadersSnapshotShared"
import type { WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

type TopPageWeeklyTabContentProps = {
  year: number
  layout: TopPageLayoutMode
  /** サーバー先読み済み（週メタ + 4 リーグ分 JSON） */
  initialPayload?: WeeklyTabPayload | null
}

export function TopPageWeeklyTabContent({
  year,
  layout,
  initialPayload,
}: TopPageWeeklyTabContentProps) {
  const [payload, setPayload] = useState<WeeklyTabPayload | null>(initialPayload ?? null)
  const [loading, setLoading] = useState(!initialPayload)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (year !== Number(TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR)) {
      setLoading(false)
      return
    }
    if (initialPayload) {
      setPayload(initialPayload)
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

  return (
    <div className="space-y-6">
      {renderLeague("CL")}
      {renderLeague("PL")}
    </div>
  )
}
