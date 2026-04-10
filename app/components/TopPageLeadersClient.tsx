/**
 * クライアントコンポーネント: 指定年度・リーグの打撃成績リーダーを表示
 * LeadersPanelと同じロジックを使用
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import { formatStat } from "@/lib/formatStat"
import metricMap from "@/config/metric_map.json"
import type { TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { abbreviatedRomanForUrl } from "@/lib/topPageLeaderName"
import { BATTING_TOP_2025_GRID_METRICS, battingTop2025GridReady } from "@/lib/topPageBatting2025Grid"

type LeadersConfig = {
  top3Metrics: string[]
  miniMetrics: string[]
  leaders: Record<string, any[]>
}

type TopPageLeadersClientProps = {
  year: number | string
  league: string
  layout?: TopPageLayoutMode
}

const teamColors: Record<string, string> = {
  H: "#ffde00",
  G: "#ff6600",
  DB: "#0067c0",
  C: "#d60718",
  D: "#004ea2",
  S: "#2bbb3f",
  Bs: "#b79e51",
  M: "#222",
  F: "#0077c8",
  E: "#7a0019",
  L: "#004098",
  Hs: "#ffdb00",
}

const leagueColors: Record<string, string> = {
  CL: "#039850",
  PL: "#10b8ce",
}

const leagueNames: Record<string, { ja: string; en: string }> = {
  CL: { ja: "セ・リーグ", en: "Central League" },
  PL: { ja: "パ・リーグ", en: "Pacific League" },
}

const LeaderRow = ({
  leader,
  stat,
  index,
  year,
}: {
  leader: any
  index: number
  stat: any
  year: number
}) => {
  const formattedValue = formatStat(stat, leader.value)
  const romanShort = abbreviatedRomanForUrl(leader)
  const isTop2025 = year === 2025

  return (
    <div className={`flex gap-0.5 py-0.5 ${isTop2025 ? "items-stretch" : "items-center"}`}>
      <div className="w-4 h-4 shrink-0 rounded-full bg-[#2a2a2a] flex items-center justify-center self-center">
        <span className="text-white text-[10px] latin tabular-nums">{index + 1}</span>
      </div>
      <div
        className={`w-1 mr-1 shrink-0 rounded-[1px] ${isTop2025 ? "self-center h-[1.95rem]" : "h-6 self-center"}`}
        style={{ backgroundColor: teamColors[leader.team] || "#666" }}
      />
      <Link
        href={`/players/${leader.name}?name=${encodeURIComponent((leader.name || "").replace(/\s+/g, ""))}${romanShort ? `&roman=${encodeURIComponent(romanShort)}` : ""}`}
        className={`flex-1 min-w-0 hover:opacity-80 transition-opacity ${isTop2025 ? "flex flex-col justify-center gap-0" : "flex items-center gap-1"}`}
      >
        {isTop2025 ? (
          <>
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <span className="text-white text-sm font-semibold leading-tight truncate">{leader.name}</span>
              <span className="text-white text-lg bebas tabular-nums font-normal shrink-0 leading-none tracking-[-0.01em] -translate-x-1">{formattedValue}</span>
            </div>
            {romanShort && (
              <span className="latin text-[10px] text-gray-400 leading-snug tracking-wide">{romanShort}</span>
            )}
          </>
        ) : (
          <>
            <span className="text-white text-sm font-semibold leading-tight">{leader.name}</span>
            {romanShort && (
              <span className="latin text-[10px] text-gray-400 leading-tight">{romanShort}</span>
            )}
          </>
        )}
      </Link>
      {!isTop2025 && (
        <div className="text-white text-base bebas tabular-nums font-normal self-center shrink-0">{formattedValue}</div>
      )}
    </div>
  )
}

const MiniLeaderRow = ({ leader, stat, year }: { leader: any; stat: any; year: number }) => {
  const formattedValue = formatStat(stat, leader.value)
  const romanShort = abbreviatedRomanForUrl(leader)
  const isTop2025 = year === 2025

  return (
    <div className={`flex gap-0.5 py-0.5 ${isTop2025 ? "items-stretch" : "items-center"}`}>
      <div className="w-4 h-4 shrink-0 rounded-full bg-[#2a2a2a] flex items-center justify-center self-center">
        <span className="text-white text-[10px] latin tabular-nums">1</span>
      </div>
      <div
        className={`w-1 mr-1 shrink-0 rounded-[1px] ${isTop2025 ? "self-center h-8" : "h-10 self-center"}`}
        style={{ backgroundColor: teamColors[leader.team] || "#666" }}
      />
      <Link
        href={`/players/${leader.name}?name=${encodeURIComponent((leader.name || "").replace(/\s+/g, ""))}${romanShort ? `&roman=${encodeURIComponent(romanShort)}` : ""}`}
        className={`flex-1 min-w-0 hover:opacity-80 transition-opacity ${isTop2025 ? "flex flex-col justify-center gap-0" : "flex flex-col justify-center"}`}
      >
        {isTop2025 ? (
          <>
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <span className="text-white text-sm font-semibold leading-tight truncate">{leader.name}</span>
              <span className="text-white text-lg bebas tabular-nums font-normal shrink-0 leading-none tracking-[-0.01em] -translate-x-1">{formattedValue}</span>
            </div>
            {romanShort && (
              <span className="latin text-[10px] text-gray-400 leading-snug tracking-wide">{romanShort}</span>
            )}
          </>
        ) : (
          <>
            <span className="text-white text-sm font-semibold leading-tight">{leader.name}</span>
            {romanShort && (
              <span className={`latin text-[10px] text-gray-400 leading-tight`}>{romanShort}</span>
            )}
          </>
        )}
      </Link>
      {!isTop2025 && (
        <div className="text-white text-base bebas tabular-nums font-normal self-center shrink-0">{formattedValue}</div>
      )}
    </div>
  )
}

export default function TopPageLeadersClient({ year, league, layout = "mobile" }: TopPageLeadersClientProps) {
  const [data, setData] = useState<LeadersConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  
  // リーグ名を大文字に正規化
  const upperLeague = league.toUpperCase()
  const leagueInfo = leagueNames[upperLeague] || { ja: `${upperLeague}リーグ`, en: `${upperLeague} League` }
  const leagueColor = leagueColors[upperLeague] || "#666"
  
  useEffect(() => {
    // APIルートからデータを取得
    const apiUrl = `/api/leaders/${year}/${upperLeague}`
    console.log(`[TopPageLeadersClient] Fetching: ${apiUrl}`)
    
    fetch(apiUrl)
      .then(res => {
        console.log(`[TopPageLeadersClient] Response status: ${res.status}`)
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData.error || `HTTP error! status: ${res.status}`)
          })
        }
        return res.json()
      })
      .then(data => {
        console.log(`[TopPageLeadersClient] Data received:`, data)
        // エラーレスポンスをチェック
        if (data.error) {
          throw new Error(data.error)
        }
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('[TopPageLeadersClient] Error fetching leaders:', err)
        setError(err.message || 'データの取得に失敗しました')
        setLoading(false)
      })
  }, [year, upperLeague])
  
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
    const metricKey = normalizeMetricKey(metric)
    const order = (metricKey === 'kpct' || metricKey === 'k%') ? 'asc' : 'desc'
    const yearStr = String(year)
    return `/ranking/${yearStr}/${upperLeague}?sort=${encodeURIComponent(metricKey)}&order=${order}`
  }

  const getStatsListUrl = (): string => {
    const yearStr = String(year)
    const url = `/ranking/${yearStr}/${upperLeague}`
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TopPageLeadersClient] getStatsListUrl: ${url}`)
    }
    return url
  }

  if (loading) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
            <div>
              <div className="text-sm font-medium">{leagueInfo.ja} 打撃成績</div>
              <div className="text-[10px] text-gray-400">{leagueInfo.en}</div>
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
              <div className="text-sm font-medium">{leagueInfo.ja} 打撃成績</div>
              <div className="text-[10px] text-gray-400">{leagueInfo.en}</div>
            </div>
          </div>
        </div>
        <div className="text-white text-sm text-center py-4">データの取得に失敗しました</div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
          <div>
            <div className="text-sm font-medium">{leagueInfo.ja} 打撃成績</div>
            <div className="text-[10px] text-gray-400">{leagueInfo.en}</div>
          </div>
        </div>
      </div>

      {Number(year) === 2025 && battingTop2025GridReady(data.leaders) ? (
        <div className="flex flex-col gap-1 max-w-md mx-auto w-full">
          <div className="grid grid-cols-2 gap-1">
            {BATTING_TOP_2025_GRID_METRICS.map((metric) =>
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
                      className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer"
                    >
                      成績一覧
                    </button>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <LeaderRow
                        key={leader.rank}
                        leader={leader}
                        stat={metric}
                        index={leaderIndex}
                        year={Number(year)}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      ) : Number(year) === 2025 && data.top3Metrics.length >= 3 ? (
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
                      className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${Number(year) === 2025 ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                    >
                      成績一覧
                    </button>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <LeaderRow
                        key={leader.rank}
                        leader={leader}
                        stat={metric}
                        index={leaderIndex}
                        year={Number(year)}
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
                  className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 ${Number(year) === 2025 ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer`}
                >
                  成績一覧
                </button>
              </div>
              <div className="space-y-0">
                {data.leaders[data.top3Metrics[2]!]?.map((leader, leaderIndex) => (
                  <LeaderRow
                    key={leader.rank}
                    leader={leader}
                    stat={data.top3Metrics[2]!}
                    index={leaderIndex}
                    year={Number(year)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={layout === "desktop" ? "grid grid-cols-3 gap-1" : "grid grid-cols-1 gap-1"}>
          {data.top3Metrics.map((metric) => (
            <div key={metric} className="bg-black border border-[#555] p-1 relative">
              {Number(year) === 2025 ? (
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
                    className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer"
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
                    className="bg-black py-0.5 px-1 text-[10px] text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer"
                  >
                    成績一覧
                  </button>
                </div>
              )}
              <div className="space-y-0">
                {data.leaders[metric]?.map((leader, leaderIndex) => (
                  <LeaderRow
                    key={leader.rank}
                    leader={leader}
                    stat={metric}
                    index={leaderIndex}
                    year={Number(year)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={layout === "desktop" ? "grid grid-cols-5 gap-1" : "grid grid-cols-2 gap-1"}>
        {(Number(year) === 2025 ? data.miniMetrics.filter((m) => m !== "打点") : data.miniMetrics).map((metric) => {
          const leader = data.leaders[metric]?.[0]
          if (!leader) return null
          return (
            <div key={metric} className="bg-black border border-[#555] p-0.5 relative">
              {Number(year) === 2025 ? (
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
                    className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer"
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
                    className="bg-black py-0.5 px-0.5 text-[10px] text-[#e8e8e8] hover:text-white transition-colors flex items-center cursor-pointer"
                  >
                    成績一覧
                  </button>
                </div>
              )}
              <MiniLeaderRow leader={leader} stat={metric} year={Number(year)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

