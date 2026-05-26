"use client"

import { useEffect, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import TopPageLeadersClient from "@/app/components/TopPageLeadersClient"
import TopPagePitchingLeadersClient from "@/app/components/TopPagePitchingLeadersClient"
import { LeadersPanel, type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { getDataForPanel } from "@/app/components/top/topPageConstants"
import { fetchTopLeadersForPage } from "@/lib/topPage/fetchTopLeadersClient"
import type { SeasonTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"

type TopPageSeasonTabContentProps = {
  year: number
  layout: TopPageLayoutMode
  /** サーバー先読み済み（2026 スナップショット） */
  initialPayload?: SeasonTabPayload | null
}

export function TopPageSeasonTabContent({
  year,
  layout,
  initialPayload,
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

    // 2025 は投球 JSON が無いため取得しない（404 で打撃まで落ちないようにする）
    const loadPitching =
      year === 2026
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
        setError(err.message || "データの取得に失敗しました")
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
        {error || "データの取得に失敗しました"}
      </div>
    )
  }

  const renderLeague = (league: "CL" | "PL") => (
    <div className="space-y-4">
      <TopPageLeadersClient
        year={year}
        league={league}
        layout={layout}
        initialData={payload.batting[league]}
      />
      {payload.pitching ? (
        <TopPagePitchingLeadersClient
          year={year}
          league={league}
          layout={layout}
          initialData={payload.pitching[league]}
        />
      ) : (
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
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {renderLeague("CL")}
      {renderLeague("PL")}
    </div>
  )
}
