"use client"

import Link from "next/link"
import metricMap from "@/config/metric_map.json"
import pitchingMetricMap from "@/config/pitching_metric_map.json"
import { getPitchingSortOrderForKey } from "@/lib/ranking/pitchingSortOrder"
import {
  teamColors,
  standingsCL,
  standingsPL,
  type LeadersConfig,
} from "@/app/components/top/topPageConstants"
import { TopPageModernLeaderRow } from "@/app/components/top/TopPageModernLeaderRow"
import {
  BATTING_TOP_2025_FOUR_GRID_CLASS,
  BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS,
  shouldShowTopBattingFourGrid,
  topLeaderRowTypography,
  type TopLeaderRowTypography,
  usesTopBattingModernLayout,
  usesTopPageModernLeaderRow,
  usesTopPageModernMetricTitle,
} from "@/lib/topPageBatting2025Grid"
import { BattingTopFourMetricsGrid } from "@/app/components/top/BattingTopFourMetricsGrid"
import {
  PITCHING_TOP_2026_GRID_METRICS,
  shouldShowTopPitchingFourGrid,
  usesTopPitchingModernLayout,
} from "@/lib/topPagePitching2026Grid"
import {
  getWeeklyPitchingRankingUrl,
  getWeeklyPitchingStatsListUrl,
} from "@/lib/topPage/weeklyRankingUrl"
import { leaderListReactKey, type LeaderRow } from "@/lib/ranking/leadersTypes"

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
  /** 今週タブ: 火曜 weekKey */
  weekKey?: string
}

/** 投手ランキング完成品は 2026 のみ（計画書 §3.1） */
const PITCHING_RANKING_SEASON = 2026

function miniTeamBarFor(typography: TopLeaderRowTypography): string | undefined {
  if (typography.teamBar === "h-[1.3rem]") return "h-6"
  if (typography.teamBar === "h-[1.65rem]") return "h-7"
  return "h-8"
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
  weekKey,
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
    if (statsCategory === "pitching" && league && weekKey) {
      return getWeeklyPitchingRankingUrl(PITCHING_RANKING_SEASON, weekKey, league, metric)
    }
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
    if (statsCategory === "pitching" && league && weekKey) {
      return getWeeklyPitchingStatsListUrl(PITCHING_RANKING_SEASON, weekKey, league)
    }
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
  const useModernMetricTitle = usesTopPageModernMetricTitle(year, statsCategory)
  const panelModernLeaderRow = usesTopPageModernLeaderRow(year, statsCategory)
  const rowTypography = topLeaderRowTypography(year, statsCategory, Boolean(weekKey))
  const isTopBattingModern = usesTopBattingModernLayout(year) && statsCategory === "batting"
  const isTopPitchingModern = usesTopPitchingModernLayout(year) && statsCategory === "pitching"
  const effectiveMiniGrid =
    isTopPitchingModern && layout === "desktop" ? "grid grid-cols-4 gap-1" : miniGrid

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: "4px", height: "32px", backgroundColor: leagueColor }} />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div
              className={`text-[10px] text-gray-400 ${weekKey ? "latin tabular-nums" : ""}`}
            >
              {leagueName}
            </div>
          </div>
        </div>
      </div>

      {isTopPitchingModern && shouldShowTopPitchingFourGrid(data.leaders) ? (
        <div className={BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS}>
          <div className={BATTING_TOP_2025_FOUR_GRID_CLASS}>
            {PITCHING_TOP_2026_GRID_METRICS.map((metric) =>
              data.leaders[metric] ? (
                <div key={metric} className="bg-black border border-[#555] p-1 relative">
                  <div className="relative mb-1 flex min-h-[22px] items-center">
                    <Link
                      href={getRankingUrl(metric)}
                      className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
                    >
                      <span
                        className={`text-[#ffff44] text-[13px] tracking-wider ${/[a-zA-Z％%]/.test(metric) ? "latin" : ""}`}
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
                      <TopPageModernLeaderRow
                        key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                        leader={leader as Record<string, unknown>}
                        stat={metric}
                        index={leaderIndex}
                        modernLeaderRow={panelModernLeaderRow}
                        typography={rowTypography}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      ) : isTopBattingModern && shouldShowTopBattingFourGrid(data.leaders) ? (
        <BattingTopFourMetricsGrid
          year={year}
          isWeeklyTab={Boolean(weekKey)}
          leaders={data.leaders}
          getRankingUrl={getRankingUrl}
          getStatsListUrl={getStatsListUrl}
          renderLeaderRow={({ leader, stat, index }) => (
            <TopPageModernLeaderRow
              key={leaderListReactKey(leader as LeaderRow, index)}
              leader={leader}
              stat={stat}
              index={index}
              modernLeaderRow={panelModernLeaderRow}
              typography={rowTypography}
            />
          )}
        />
      ) : isTopBattingModern && data.top3Metrics.length >= 3 ? (
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
                      className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${useModernMetricTitle ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center`}
                    >
                      成績一覧
                    </Link>
                  </div>
                  <div className="space-y-0">
                    {data.leaders[metric]?.map((leader, leaderIndex) => (
                      <TopPageModernLeaderRow
                        key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                        leader={leader as Record<string, unknown>}
                        stat={metric}
                        index={leaderIndex}
                        modernLeaderRow={panelModernLeaderRow}
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
                <Link
                  href={getStatsListUrl()}
                  className={`relative z-20 ml-auto shrink-0 bg-black py-0.5 px-1 ${useModernMetricTitle ? "text-[9px]" : "text-[10px]"} text-[#e8e8e8] hover:text-white transition-colors flex items-center`}
                >
                  成績一覧
                </Link>
              </div>
              <div className="space-y-0">
                {data.leaders[data.top3Metrics[2]!]?.map((leader, leaderIndex) => (
                  <TopPageModernLeaderRow
                    key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                    leader={leader as Record<string, unknown>}
                    stat={data.top3Metrics[2]!}
                    index={leaderIndex}
                    modernLeaderRow={panelModernLeaderRow}
                    typography={rowTypography}
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
              {useModernMetricTitle ? (
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
                  <TopPageModernLeaderRow
                    key={leaderListReactKey(leader as LeaderRow, leaderIndex)}
                    leader={leader as Record<string, unknown>}
                    stat={metric}
                    index={leaderIndex}
                    modernLeaderRow={panelModernLeaderRow}
                    typography={rowTypography}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={effectiveMiniGrid}>
        {(isTopBattingModern ? data.miniMetrics.filter((m) => m !== "打点") : data.miniMetrics).map((metric) => {
          const leader = data.leaders[metric]?.[0]
          if (!leader) return null
          return (
            <div key={metric} className="bg-black border border-[#555] p-0.5 relative">
              {useModernMetricTitle ? (
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
              <TopPageModernLeaderRow
                leader={leader as Record<string, unknown>}
                stat={metric}
                index={0}
                modernLeaderRow={panelModernLeaderRow}
                typography={rowTypography}
                miniTeamBar={miniTeamBarFor(rowTypography)}
              />
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
