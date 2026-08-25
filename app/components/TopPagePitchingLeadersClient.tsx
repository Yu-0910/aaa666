"use client"

import { useEffect, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { LeadersPanel, type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { fetchTopLeadersForPage } from "@/lib/topPage/fetchTopLeadersClient"
import { fetchTopWeeklyLeadersForPage } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import {
  topLeadersSectionSubtitle,
  topSeasonLeadersSectionTitle,
  topWeeklyLeadersSectionTitle,
} from "@/lib/topPage/weeklyTabDisplayTitle"

type TopPagePitchingLeadersClientProps = {
  year: number | string
  league: string
  layout?: TopPageLayoutMode
  weekKey?: string
  weekLabel?: string
  initialData?: LeadersConfig
}

const leagueColors: Record<string, string> = {
  CL: "#039850",
  PL: "#10b8ce",
}

const leagueNames: Record<string, { ja: string; en: string }> = {
  CL: { ja: "セ・リーグ", en: "Central League" },
  PL: { ja: "パ・リーグ", en: "Pacific League" },
}

export default function TopPagePitchingLeadersClient({
  year,
  league,
  layout = "mobile",
  weekKey,
  weekLabel,
  initialData,
}: TopPagePitchingLeadersClientProps) {
  const [data, setData] = useState<LeadersConfig | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  const upperLeague = league.toUpperCase()
  const leagueInfo = leagueNames[upperLeague] || { ja: `${upperLeague}リーグ`, en: `${upperLeague} League` }
  const leagueColor = leagueColors[upperLeague] || "#666"

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const load = weekKey
      ? fetchTopWeeklyLeadersForPage(year, upperLeague, "pitching", weekKey).then((r) => r.config)
      : fetchTopLeadersForPage(year, upperLeague, "pitching")

    load
      .then((leadersData) => {
        if (cancelled) return
        setData(leadersData)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        console.error("[TopPagePitchingLeadersClient] Error:", err)
        setError("データの取得に失敗しました")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, upperLeague, weekKey, initialData])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return <div className="text-red-400 text-center py-4 text-sm">データの取得に失敗しました</div>
  }

  const pitchingTitle = weekKey
    ? topWeeklyLeadersSectionTitle(upperLeague, "pitching")
    : topSeasonLeadersSectionTitle(upperLeague, "pitching")
  const pitchingSubtitle = topLeadersSectionSubtitle(upperLeague, {
    kind: "pitching",
    weekLabel: weekKey ? weekLabel : undefined,
  })

  return (
    <LeadersPanel
      title={pitchingTitle}
      leagueName={pitchingSubtitle}
      leagueColor={leagueColor}
      data={data}
      year={Number(year)}
      league={upperLeague}
      layout={layout}
      statsCategory="pitching"
      weekKey={weekKey}
    />
  )
}
