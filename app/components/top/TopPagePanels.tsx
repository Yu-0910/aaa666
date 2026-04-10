"use client"

import Link from "next/link"
import { formatStat } from "@/lib/formatStat"
import metricMap from "@/config/metric_map.json"
import pitchingMetricMap from "@/config/pitching_metric_map.json"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"
import {
  teamColors,
  standingsCL,
  standingsPL,
  type LeadersConfig,
} from "@/app/components/top/topPageConstants"
import { abbreviatedRomanForUrl } from "@/lib/topPageLeaderName"
import { BATTING_TOP_2025_GRID_METRICS, battingTop2025GridReady } from "@/lib/topPageBatting2025Grid"

export type TopPageLayoutMode = "mobile" | "desktop"

type LeadersPanelProps = {
  data: LeadersConfig
  title: string
  leagueName: string
  leagueColor: string
  year?: number
  league?: string
  layout: TopPageLayoutMode
  /** 投球パネルは投手ランキング（下記年度固定）へ遷移 */
  statsCategory?: "batting" | "pitching"
}

/** 投手ランキング完成品は 2026 のみ（計画書 §3.1） */
const PITCHING_RANKING_SEASON = 2026

const LeaderRow = ({
  leader,
  stat,
  index,
  year,
}: {
  leader: Record<string, unknown>
  index: number
  stat: unknown
  year: number
}) => {
  const formattedValue = formatStat(stat, leader.value)
  const l = leader as { romanName?: string; name?: string; team?: string }
  const romanShort = abbreviatedRomanForUrl({ romanName: l.romanName, name: String(l.name ?? "") })
  const isTop2025 = year === 2025

  const playerName = typeof leader.name === "string" ? leader.name : ""
  const teamKey = typeof leader.team === "string" ? leader.team : ""

  return (
    <div className={`flex gap-0.5 py-0.5 ${isTop2025 ? "items-stretch" : "items-center"}`}>
      <div className="w-4 h-4 shrink-0 rounded-full bg-[#2a2a2a] flex items-center justify-center self-center">
        <span className="text-white text-[10px] latin tabular-nums">{index + 1}</span>
      </div>
      <div
        className={`w-1 mr-1 shrink-0 rounded-[1px] ${isTop2025 ? "self-center h-[1.95rem]" : "h-6 self-center"}`}
        style={{ backgroundColor: teamColors[teamKey] || "#666" }}
      />
      <Link
        href={`/players/${playerName}?name=${encodeURIComponent((playerName || "").replace(/\s+/g, ""))}${romanShort ? `&roman=${encodeURIComponent(romanShort)}` : ""}`}
        className={`flex-1 min-w-0 hover:opacity-80 transition-opacity ${isTop2025 ? "flex flex-col justify-center gap-0" : "flex items-center gap-1"}`}
      >
        {isTop2025 ? (
          <>
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <span className="text-white text-sm font-semibold leading-tight truncate">{playerName}</span>
              <span className="text-white text-lg bebas tabular-nums font-normal shrink-0 leading-none tracking-[-0.01em] -translate-x-1">{formattedValue}</span>
            </div>
            {romanShort && (
              <span className="latin text-[10px] text-gray-400 leading-snug tracking-wide">{romanShort}</span>
            )}
          </>
        ) : (
          <>
            <span className="text-white text-sm font-semibold leading-tight">{playerName}</span>
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

const MiniLeaderRow = ({
  leader,
  stat,
  year,
}: {
  leader: Record<string, unknown>
  stat: unknown
  year: number
}) => {
  const formattedValue = formatStat(stat, leader.value)
  const l = leader as { romanName?: string; name?: string; team?: string }
  const romanShort = abbreviatedRomanForUrl({ romanName: l.romanName, name: String(l.name ?? "") })
  const isTop2025 = year === 2025

  const playerName = typeof leader.name === "string" ? leader.name : ""
  const teamKey = typeof leader.team === "string" ? leader.team : ""

  return (
    <div className={`flex gap-0.5 py-0.5 ${isTop2025 ? "items-stretch" : "items-center"}`}>
      <div className="w-4 h-4 shrink-0 rounded-full bg-[#2a2a2a] flex items-center justify-center self-center">
        <span className="text-white text-[10px] latin tabular-nums">1</span>
      </div>
      <div
        className={`w-1 mr-1 shrink-0 rounded-[1px] ${isTop2025 ? "self-center h-8" : "h-10 self-center"}`}
        style={{ backgroundColor: teamColors[teamKey] || "#666" }}
      />
      <Link
        href={`/players/${playerName}?name=${encodeURIComponent((playerName || "").replace(/\s+/g, ""))}${romanShort ? `&roman=${encodeURIComponent(romanShort)}` : ""}`}
        className={`flex-1 min-w-0 hover:opacity-80 transition-opacity ${isTop2025 ? "flex flex-col justify-center gap-0" : "flex flex-col justify-center"}`}
      >
        {isTop2025 ? (
          <>
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <span className="text-white text-sm font-semibold leading-tight truncate">{playerName}</span>
              <span className="text-white text-lg bebas tabular-nums font-normal shrink-0 leading-none tracking-[-0.01em] -translate-x-1">{formattedValue}</span>
            </div>
            {romanShort && (
              <span className="latin text-[10px] text-gray-400 leading-snug tracking-wide">{romanShort}</span>
            )}
          </>
        ) : (
          <>
            <span className="text-white text-sm font-semibold leading-tight">{playerName}</span>
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

export function LeadersPanel({
  data,
  title,
  leagueName,
  leagueColor,
  year = 2025,
  league,
  layout,
  statsCategory = "batting",
}: LeadersPanelProps) {
  const normalizeBattingMetricKey = (metric: string): string => {
    if (metric in metricMap) {
      return metricMap[metric as keyof typeof metricMap]
    }
    const lowerMetric = metric.toLowerCase()
    for (const [key, value] of Object.entries(metricMap)) {
      if (key.toLowerCase() === lowerMetric) {
        return value
      }
    }
    return metric.toLowerCase().replace("%", "pct").replace("/", "").replace("-", "")
  }

  const normalizePitchingMetricKey = (metric: string): string => {
    const map = pitchingMetricMap as Record<string, string>
    if (metric in map && !metric.startsWith("_")) {
      return map[metric]!
    }
    const lowerMetric = metric.toLowerCase()
    for (const [key, value] of Object.entries(map)) {
      if (key.startsWith("_")) continue
      if (key.toLowerCase() === lowerMetric) {
        return value
      }
    }
    return metric.toLowerCase().replace("%", "pct").replace("/", "").replace("-", "")
  }

  const getRankingUrl = (metric: string): string => {
    if (statsCategory === "pitching" && league) {
      const metricKey = normalizePitchingMetricKey(metric)
      const order = getPitchingSortOrderForKey(metricKey)
      return `/ranking/pitching/${PITCHING_RANKING_SEASON}/${league}?sort=${encodeURIComponent(metricKey)}&order=${order}`
    }
    if (year && league) {
      const metricKey = normalizeBattingMetricKey(metric)
      const order = metricKey === "kpct" || metricKey === "k%" ? "asc" : "desc"
      return `/ranking/${year}/${league}?sort=${encodeURIComponent(metricKey)}&order=${order}`
    }
    return `/ranking/${encodeURIComponent(metric)}`
  }

  const getStatsListUrl = (): string => {
    if (statsCategory === "pitching" && league) {
      return `/ranking/pitching/${PITCHING_RANKING_SEASON}/${league}`
    }
    if (year && league) {
      return `/ranking/${year}/${league}`
    }
    return "/ranking/coming-soon"
  }

  const topGrid = layout === "desktop" ? "grid grid-cols-3 gap-1" : "grid grid-cols-1 gap-1"
  const miniGrid = layout === "desktop" ? "grid grid-cols-5 gap-1" : "grid grid-cols-2 gap-1"

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-[10px] text-gray-400">{leagueName}</div>
          </div>
        </div>
      </div>

      {year === 2025 && statsCategory === "batting" && battingTop2025GridReady(data.leaders) ? (
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
                    <Link
                      href={getStatsListUrl()}
                      className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center"
                    >
                      成績一覧
                    </Link>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <LeaderRow
                        key={leader.rank}
                        leader={leader as Record<string, unknown>}
                        stat={metric}
                        index={leaderIndex}
                        year={year}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      ) : year === 2025 && statsCategory === "batting" && data.top3Metrics.length >= 3 ? (
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
                    <Link
                      href={getStatsListUrl()}
                      className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${year === 2025 ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center`}
                    >
                      成績一覧
                    </Link>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <LeaderRow
                        key={leader.rank}
                        leader={leader as Record<string, unknown>}
                        stat={metric}
                        index={leaderIndex}
                        year={year}
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
                <Link
                  href={getStatsListUrl()}
                  className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 ${year === 2025 ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center`}
                >
                  成績一覧
                </Link>
              </div>
              <div className="space-y-0">
                {data.leaders[data.top3Metrics[2]!]?.map((leader, leaderIndex) => (
                  <LeaderRow
                    key={leader.rank}
                    leader={leader as Record<string, unknown>}
                    stat={data.top3Metrics[2]!}
                    index={leaderIndex}
                    year={year}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={topGrid}>
          {data.top3Metrics.map((metric) => (
            <div key={metric} className="bg-black border border-[#555] p-1 relative">
              {year === 2025 ? (
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
                  <Link
                    href={getStatsListUrl()}
                    className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center"
                  >
                    成績一覧
                  </Link>
                </div>
              ) : (
                <div className="flex items-stretch justify-between mb-1">
                  <Link
                    href={getRankingUrl(metric)}
                    className="bg-black py-0.5 flex-1 text-center hover:opacity-80 transition-opacity"
                  >
                    <span className="latin text-[#ffff44] text-xs tracking-wider">{metric}</span>
                  </Link>
                  <Link
                    href={getStatsListUrl()}
                    className="bg-black py-0.5 px-1 text-[10px] text-[#e8e8e8] hover:text-white transition-colors flex items-center"
                  >
                    成績一覧
                  </Link>
                </div>
              )}
              <div className="space-y-0">
                {data.leaders[metric]?.map((leader, leaderIndex) => (
                  <LeaderRow
                    key={leader.rank}
                    leader={leader as Record<string, unknown>}
                    stat={metric}
                    index={leaderIndex}
                    year={year}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={miniGrid}>
        {(statsCategory === "batting" && year === 2025 ? data.miniMetrics.filter((m) => m !== "打点") : data.miniMetrics).map((metric) => {
          const leader = data.leaders[metric]?.[0]
          if (!leader) return null
          return (
            <div key={metric} className="bg-black border border-[#555] p-0.5 relative">
              {year === 2025 ? (
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
                  <Link
                    href={getStatsListUrl()}
                    className="relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 text-[9px] text-[#e8e8e8] hover:text-white transition-colors flex items-center"
                  >
                    成績一覧
                  </Link>
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
                  <Link
                    href={getStatsListUrl()}
                    className="bg-black py-0.5 px-0.5 text-[10px] text-[#e8e8e8] hover:text-white transition-colors flex items-center"
                  >
                    成績一覧
                  </Link>
                </div>
              )}
              <MiniLeaderRow leader={leader as Record<string, unknown>} stat={metric} year={year} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StandingsPanel({ league, leagueColor }: { league: string; leagueColor: string }) {
  const standings = league === "CL" ? standingsCL : standingsPL

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
          <div>
            <div className="text-sm font-medium">{league === "CL" ? "セ・リーグ" : "パ・リーグ"} 順位表</div>
          </div>
        </div>
      </div>
      <div className="bg-black border border-[#555] p-4">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-[10px] text-gray-400">順位</th>
              <th className="text-[10px] text-gray-400">チーム</th>
              <th className="text-[10px] text-gray-400">勝</th>
              <th className="text-[10px] text-gray-400">負</th>
              <th className="text-[10px] text-gray-400">勝率</th>
              <th className="text-[10px] text-gray-400">得点</th>
              <th className="text-[10px] text-gray-400">防御率</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team) => (
              <tr key={team.name} className="hover:bg-[#2a2a2a] transition-colors">
                <td className="text-white text-base bebas tabular-nums font-normal">{team.pos}</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{team.name}</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{team.w}</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{team.l}</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{(team.pct * 100).toFixed(1)}%</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{team.runs}</td>
                <td className="text-white text-base bebas tabular-nums font-normal">{team.era}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
