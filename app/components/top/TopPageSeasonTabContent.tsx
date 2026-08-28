"use client"

import { useEffect, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import TopPageLeadersClient from "@/app/components/TopPageLeadersClient"
import TopPagePitchingLeadersClient from "@/app/components/TopPagePitchingLeadersClient"
import { LeadersPanel } from "@/app/components/top/TopPagePanels"
import type { TopPageLayoutMode } from "@/app/components/top/topPageLayoutMode"
import type { TopSeasonStatView } from "@/app/components/common/RankingBottomNav"
import { getDataForPanel } from "@/app/components/top/topPageConstants"
import { usesTopPageModernLayout } from "@/lib/topPageModernLayout"
import { fetchTopLeadersForPage } from "@/lib/topPage/fetchTopLeadersClient"
import type { SeasonTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

type TopPageSeasonTabContentProps = {
  year: number
  layout: TopPageLayoutMode
  /** サーバー先読み済み（2026 スナップショット） */
  initialPayload?: SeasonTabPayload | null
  activeView?: TopSeasonStatView
}

export function TopPageSeasonTabContent({
  year,
  layout,
  initialPayload,
  activeView = "cl-batting",
}: TopPageSeasonTabContentProps) {
  const [payload, setPayload] = useState<SeasonTabPayload | null>(initialPayload ?? null)
  const [loading, setLoading] = useState(!initialPayload)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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

    const loadBatting = Promise.all([
      fetchTopLeadersForPage(year, "CL", "batting"),
      fetchTopLeadersForPage(year, "PL", "batting"),
    ]).then(([CL, PL]) => ({ CL, PL }))

    // 投球 JSON が無い年度は 404 になるため打撃取得を妨げないよう個別に catch
    const loadPitching = usesTopPageModernLayout(year)
      ? Promise.all([
          fetchTopLeadersForPage(year, "CL", "pitching"),
          fetchTopLeadersForPage(year, "PL", "pitching"),
        ])
          .then(([CL, PL]) => ({ CL, PL }))
          .catch(() => undefined)
      : Promise.resolve(undefined)

    Promise.all([loadBatting, loadPitching])
      .then(([batting, pitching]) => {
        if (cancelled) return
        setPayload({ batting, pitching })
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError("データの取得に失敗しました")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, initialPayload])

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
        <Spinner className="size-8 text-[#FFFF44]" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="text-white text-center py-8 text-sm">
        データの取得に失敗しました
      </div>
    )
  }

  const renderPanel = (view: TopSeasonStatView) => {
    const league = view.startsWith("cl") ? "CL" : "PL"
    const isPitching = view.endsWith("pitching")

    if (!isPitching) {
      return (
        <TopPageLeadersClient
          year={year}
          league={league}
          layout={layout}
          initialData={payload.batting[league]}
        />
      )
    }

    if (payload.pitching) {
      return (
        <TopPagePitchingLeadersClient
          year={year}
          league={league}
          layout={layout}
          initialData={payload.pitching[league]}
        />
      )
    }

    return (
      <LeadersPanel
        title={`${league === "CL" ? "セ・リーグ" : "パ・リーグ"} 投球成績`}
        leagueName={league === "CL" ? "Central League" : "Pacific League"}
        leagueColor={league === "CL" ? "#039850" : "#10b8ce"}
        data={getDataForPanel(league, "pitching")}
        year={year}
        league={league}
        layout={layout}
        statsCategory="pitching"
      />
    )
  }

  return (
    <div className="space-y-6">
      {renderPanel(activeView)}
    </div>
  )
}
