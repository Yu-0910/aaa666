/**
 * クライアントコンポーネント: 指定年度・リーグの打撃成績リーダーを表示
 * LeadersPanelと同じロジックを使用
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import metricMap from "@/config/metric_map.json"
import type { TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { TopPageModernLeaderRow } from "@/app/components/top/TopPageModernLeaderRow"
import {
  battingMiniMetricsForSeasonTab,
  shouldShowTopBattingMainGrid,
  topLeaderRowTypography,
  type TopLeaderRowTypography,
  usesTopBattingModernLayout,
  usesTopPageModernLeaderRow,
} from "@/lib/topPageBatting2025Grid"
import { BattingTopFourMetricsGrid } from "@/app/components/top/BattingTopFourMetricsGrid"
import { fetchTopLeadersForPage } from "@/lib/topPage/fetchTopLeadersClient"
import { fetchTopWeeklyLeadersForPage } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import {
  getWeeklyBattingRankingUrl,
  getWeeklyBattingStatsListUrl,
} from "@/lib/topPage/weeklyRankingUrl"
import {
  topLeadersSectionSubtitle,
  topSeasonLeadersSectionTitle,
  topWeeklyLeadersSectionTitle,
} from "@/lib/topPage/weeklyTabDisplayTitle"
import { leaderListReactKey, type LeaderRow } from "@/lib/ranking/leadersTypes"

type LeadersConfig = {
  top3Metrics: string[]
  miniMetrics: string[]
  leaders: Record<string, any[]>
}

type TopPageLeadersClientProps = {
  year: number | string
  league: string
  layout?: TopPageLayoutMode
  /** 指定時は今週タブ（週間スナップショット） */
  weekKey?: string
  weekLabel?: string
  /** TOPタブ親で先読み済みのとき（自前のローディングUIを出さない） */
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

function miniTeamBarFor(typography: TopLeaderRowTypography): string | undefined {
  if (typography.teamBar === "h-[1.3rem]") return "h-6"
  if (typography.teamBar === "h-[1.65rem]") return "h-7"
  return "h-8"
}

export default function TopPageLeadersClient({
  year,
  league,
  layout = "mobile",
  weekKey,
  weekLabel,
  initialData,
}: TopPageLeadersClientProps) {
  const [data, setData] = useState<LeadersConfig | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  
  // リーグ名を大文字に正規化
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
      ? fetchTopWeeklyLeadersForPage(year, upperLeague, "batting", weekKey).then((r) => r.config)
      : fetchTopLeadersForPage(year, upperLeague, "batting")

    load
      .then((leadersData) => {
        if (cancelled) return
        setData(leadersData)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        console.error("[TopPageLeadersClient] Error fetching leaders:", err)
        setError(err.message || "データの取得に失敗しました")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, upperLeague, weekKey, initialData])
  
  const normalizeMetricKey = (metric: string): string => {
    if (metric in metricMap) {
      return metricMap[metric as keyof typeof metricMap]
    }
    const lowerMetric = metric.toLowerCase()
    for (const [key, value] of Object.entries(metricMap)) {
      if (key.toLowerCase() === lowerMetric) {
        return value
      }
    }
    return metric.toLowerCase().replace('%', 'pct').replace('/', '').replace('-', '')
  }

  const getRankingUrl = (metric: string): string => {
    const yearStr = String(year)
    if (weekKey) {
      return getWeeklyBattingRankingUrl(yearStr, weekKey, upperLeague, metric)
    }
    const metricKey = normalizeMetricKey(metric)
    const order = metricKey === "kpct" || metricKey === "k%" ? "asc" : "desc"
    return `/ranking/${yearStr}/${upperLeague}?sort=${encodeURIComponent(metricKey)}&order=${order}`
  }

  const getStatsListUrl = (): string => {
    const yearStr = String(year)
    const url = weekKey
      ? getWeeklyBattingStatsListUrl(yearStr, weekKey, upperLeague)
      : `/ranking/${yearStr}/${upperLeague}`
    if (process.env.NODE_ENV === "development") {
      console.log(`[TopPageLeadersClient] getStatsListUrl: ${url}`)
    }
    return url
  }

  const battingTitle = weekKey
    ? topWeeklyLeadersSectionTitle(upperLeague, "batting")
    : topSeasonLeadersSectionTitle(upperLeague, "batting")
  const battingSubtitle = topLeadersSectionSubtitle(upperLeague, {
    kind: "batting",
    weekLabel: weekKey ? weekLabel : undefined,
  })

  if (loading) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
            <div>
              <div className="text-sm font-medium">{battingTitle}</div>
              <div
                className={`text-[10px] text-gray-400 ${weekKey ? "latin tabular-nums" : ""}`}
              >
                {battingSubtitle}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center py-4" role="status" aria-busy="true" aria-label="読み込み中">
          <Spinner className="size-7 text-[#FFFF44]" />
        </div>
      </div>
    )
  }
  
  if (error || !data) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
            <div>
              <div className="text-sm font-medium">{battingTitle}</div>
              <div
                className={`text-[10px] text-gray-400 ${weekKey ? "latin tabular-nums" : ""}`}
              >
                {battingSubtitle}
              </div>
            </div>
          </div>
        </div>
        <div className="text-white text-sm text-center py-4">データの取得に失敗しました</div>
      </div>
    )
  }

  const isWeeklyBattingTab = Boolean(weekKey)
  const yearNum = Number(year)
  const modernLeaderRow = usesTopPageModernLeaderRow(yearNum, "batting", isWeeklyBattingTab)
  const rowTypography = topLeaderRowTypography(yearNum, "batting", isWeeklyBattingTab)
  const showBattingMainGrid =
    usesTopBattingModernLayout(yearNum, isWeeklyBattingTab) &&
    shouldShowTopBattingMainGrid(yearNum, isWeeklyBattingTab, data.leaders)
  const miniMetricsForTab = battingMiniMetricsForSeasonTab(
    yearNum,
    data.miniMetrics,
    isWeeklyBattingTab
  )

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
          <div>
            <div className="text-sm font-medium">{battingTitle}</div>
            <div
              className={`text-[10px] text-gray-400 ${weekKey ? "latin tabular-nums" : ""}`}
            >
              {battingSubtitle}
            </div>
          </div>
        </div>
      </div>

      {showBattingMainGrid ? (
        <BattingTopFourMetricsGrid
          year={yearNum}
          isWeeklyTab={isWeeklyBattingTab}
          leaders={data.leaders}
          getRankingUrl={getRankingUrl}
          getStatsListUrl={getStatsListUrl}
          onStatsListNavigate={(url) => {
            if (process.env.NODE_ENV === "development") {
              console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
            }
            router.push(url)
          }}
          renderLeaderRow={({ leader, stat, index }) => (
            <TopPageModernLeaderRow
              key={leaderListReactKey(leader as LeaderRow, index)}
              leader={leader}
              stat={stat}
              index={index}
              modernLeaderRow={modernLeaderRow}
              typography={rowTypography}
            />
          )}
        />
      ) : !isWeeklyBattingTab && usesTopBattingModernLayout(yearNum, false) && data.top3Metrics.length >= 3 ? (
        <div className="flex flex-col gap-1 max-w-md mx-auto w-full">
          <div className="grid grid-cols-2 gap-1">
            {data.top3Metrics.slice(0, 2).map((metric) =>
              data.leaders[metric] ? (
                <div key={metric} className="bg-black border border-[#555] p-1 relative min-w-0">
                  <div className="relative mb-1 flex min-h-[22px] items-center">
                    <Link
                      href={getRankingUrl(metric)}
                      className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
                    >
                      <span
                        className={`text-[#ffff44] text-[13px] tracking-wider ${/[a-zA-Z]/.test(metric) ? "latin" : ""}`}
                      >
                        {metric}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        const url = getStatsListUrl()
                        if (process.env.NODE_ENV === "development") {
                          console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                        }
                        router.push(url)
                      }}
                      className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                    >
                      成績一覧
                    </button>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <TopPageModernLeaderRow
                        key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                        leader={leader}
                        stat={metric}
                        index={leaderIndex}
                        modernLeaderRow={modernLeaderRow}
                        typography={rowTypography}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
          {data.leaders[data.top3Metrics[2]!] && (
            <div className="bg-black border border-[#555] p-1 relative w-full">
              <div className="relative mb-1 flex min-h-[22px] items-center">
                <Link
                  href={getRankingUrl(data.top3Metrics[2]!)}
                  className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
                >
                  <span
                    className={`text-[#ffff44] text-[13px] tracking-wider ${/[a-zA-Z]/.test(data.top3Metrics[2]!) ? "latin" : ""}`}
                  >
                    {data.top3Metrics[2]}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    const url = getStatsListUrl()
                    if (process.env.NODE_ENV === "development") {
                      console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                    }
                    router.push(url)
                  }}
                  className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                >
                  成績一覧
                </button>
              </div>
              <div className="space-y-0">
                {data.leaders[data.top3Metrics[2]!]?.map((leader, leaderIndex) => (
                  <TopPageModernLeaderRow
                    key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                    leader={leader}
                    stat={data.top3Metrics[2]!}
                    index={leaderIndex}
                    modernLeaderRow={modernLeaderRow}
                    typography={rowTypography}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : !isWeeklyBattingTab ? (
        <div className={layout === "desktop" ? "grid grid-cols-3 gap-1" : "grid grid-cols-1 gap-1"}>
          {data.top3Metrics.map((metric) => (
            <div key={metric} className="bg-black border border-[#555] p-1 relative">
              {usesTopBattingModernLayout(Number(year), isWeeklyBattingTab) ? (
                <div className="relative mb-1 flex min-h-[22px] items-center">
                  <Link
                    href={getRankingUrl(metric)}
                    className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={`text-[#ffff44] text-[13px] tracking-wider ${/[a-zA-Z]/.test(metric) ? "latin" : ""}`}
                    >
                      {metric}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      const url = getStatsListUrl()
                      if (process.env.NODE_ENV === "development") {
                        console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                      }
                      router.push(url)
                    }}
                    className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                  >
                    成績一覧
                  </button>
                </div>
              ) : (
                <div className="flex items-stretch justify-between mb-1">
                  <Link
                    href={getRankingUrl(metric)}
                    className="bg-black py-0.5 flex-1 text-center hover:opacity-80 transition-opacity"
                  >
                    <span className="latin text-[#ffff44] text-xs tracking-wider">{metric}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      const url = getStatsListUrl()
                      if (process.env.NODE_ENV === "development") {
                        console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                      }
                      router.push(url)
                    }}
                    className={`bg-black py-0.5 px-1 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                  >
                    成績一覧
                  </button>
                </div>
              )}
              <div className="space-y-0">
                {data.leaders[metric]?.map((leader, leaderIndex) => (
                  <TopPageModernLeaderRow
                    key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                    leader={leader}
                    stat={metric}
                    index={leaderIndex}
                    modernLeaderRow={modernLeaderRow}
                    typography={rowTypography}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isWeeklyBattingTab && miniMetricsForTab.length > 0 && (
      <div className={layout === "desktop" ? "grid grid-cols-5 gap-1" : "grid grid-cols-2 gap-1"}>
        {miniMetricsForTab.map((metric) => {
          const leader = data.leaders[metric]?.[0]
          if (!leader) return null
          return (
            <div key={metric} className="bg-black border border-[#555] p-0.5 relative">
              {usesTopBattingModernLayout(Number(year), isWeeklyBattingTab) ? (
                <div className="relative mb-1 flex min-h-[22px] items-center">
                  <Link
                    href={getRankingUrl(metric)}
                    className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={`text-[#ffff44] text-[13px] ${/[a-zA-Z]/.test(metric) ? "latin" : ""}`}
                    >
                      {metric}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      const url = getStatsListUrl()
                      if (process.env.NODE_ENV === "development") {
                        console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                      }
                      router.push(url)
                    }}
                    className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                  >
                    成績一覧
                  </button>
                </div>
              ) : (
                <div className="flex items-stretch justify-between mb-1">
                  <Link
                    href={getRankingUrl(metric)}
                    className="bg-black py-0.5 flex-1 text-center hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={`text-[#ffff44] text-xs ${/[a-zA-Z]/.test(metric) ? "latin" : ""}`}
                    >
                      {metric}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      const url = getStatsListUrl()
                      if (process.env.NODE_ENV === "development") {
                        console.log(`[TopPageLeadersClient] 成績一覧 clicked: ${url}`)
                      }
                      router.push(url)
                    }}
                    className={`bg-black py-0.5 px-0.5 ${rowTypography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                  >
                    成績一覧
                  </button>
                </div>
              )}
              <TopPageModernLeaderRow
                leader={leader}
                stat={metric}
                index={0}
                modernLeaderRow={modernLeaderRow}
                typography={rowTypography}
                miniTeamBar={miniTeamBarFor(rowTypography)}
              />
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

