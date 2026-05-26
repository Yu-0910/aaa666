"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import type { LeaderRow } from "@/lib/ranking/leadersTypes"
import {
  BATTING_TOP_2025_FOUR_GRID_CLASS,
  BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS,
  BATTING_TOP_2025_GRID_METRICS,
  BATTING_TOP_2025_SEASON_GRID_CLASS,
  BATTING_TOP_2025_SEASON_TOP_METRICS,
  pad2025SeasonTopMetricLeaders,
  topLeaderRowTypography,
  usesTopBatting2025SeasonPairedLayout,
} from "@/lib/topPageBatting2025Grid"

type LeaderRowRenderProps = {
  leader: Record<string, unknown>
  stat: string
  index: number
}

type BattingTopFourMetricsGridProps = {
  year: number
  isWeeklyTab: boolean
  leaders: Record<string, unknown[] | undefined>
  getRankingUrl: (metric: string) => string
  getStatsListUrl: () => string
  onStatsListNavigate?: (url: string) => void
  renderLeaderRow: (props: LeaderRowRenderProps) => ReactNode
}

function metricTitleClass(metric: string, titleSize: string): string {
  return `text-[#ffff44] ${titleSize} tracking-wider ${/[a-zA-Z]/.test(metric) ? "latin" : ""}`
}

function StatsListControl({
  href,
  onNavigate,
  className,
}: {
  href: string
  onNavigate?: (url: string) => void
  className: string
}) {
  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onNavigate(href)
        }}
        className={`${className} cursor-pointer`}
      >
        成績一覧
      </button>
    )
  }
  return (
    <Link href={href} className={className}>
      成績一覧
    </Link>
  )
}

function MetricPanel({
  metric,
  leaders,
  getRankingUrl,
  getStatsListUrl,
  onStatsListNavigate,
  renderLeaderRow,
  typography,
  panelClassName = "p-1",
  bordered = true,
}: {
  metric: string
  leaders: Record<string, unknown[] | undefined>
  getRankingUrl: (metric: string) => string
  getStatsListUrl: () => string
  onStatsListNavigate?: (url: string) => void
  renderLeaderRow: (props: LeaderRowRenderProps) => ReactNode
  typography: ReturnType<typeof topLeaderRowTypography>
  panelClassName?: string
  bordered?: boolean
}) {
  const rows = leaders[metric]
  if (!rows?.length) return null

  const statsListClass = `relative z-20 ml-auto shrink-0 bg-black py-0.5 px-0.5 ${typography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center`
  const borderClass = bordered ? "border border-[#555]" : ""

  return (
    <div className={`bg-black ${borderClass} relative min-w-0 ${panelClassName}`}>
      <div className={`relative mb-1 flex ${typography.metricHeaderMinH} items-center`}>
        <Link
          href={getRankingUrl(metric)}
          className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
        >
          <span className={metricTitleClass(metric, typography.metricTitle)}>{metric}</span>
        </Link>
        <StatsListControl href={getStatsListUrl()} onNavigate={onStatsListNavigate} className={statsListClass} />
      </div>
      <div className="min-w-0 space-y-0 overflow-hidden">
        {rows.map((leader, leaderIndex) =>
          renderLeaderRow({ leader: leader as Record<string, unknown>, stat: metric, index: leaderIndex })
        )}
      </div>
    </div>
  )
}

export function BattingTopFourMetricsGrid({
  year,
  isWeeklyTab,
  leaders,
  getRankingUrl,
  getStatsListUrl,
  onStatsListNavigate,
  renderLeaderRow,
}: BattingTopFourMetricsGridProps) {
  const typography = topLeaderRowTypography(year, "batting", isWeeklyTab)
  const usePairedLayout = usesTopBatting2025SeasonPairedLayout(year, isWeeklyTab)
  const displayLeaders = usePairedLayout
    ? pad2025SeasonTopMetricLeaders(leaders as Record<string, LeaderRow[] | undefined>)
    : leaders

  if (usePairedLayout) {
    const seasonAreaClass: Record<string, string> = {
      OPS: "batting-top-2025-season-ops",
      打率: "batting-top-2025-season-avg",
      本塁打: "batting-top-2025-season-hr",
    }
    const hasTopRow = BATTING_TOP_2025_SEASON_TOP_METRICS.some((m) => (displayLeaders[m]?.length ?? 0) > 0)
    const hasRbi = (displayLeaders.打点?.length ?? 0) > 0
    if (!hasTopRow && !hasRbi) return null

    const seasonPanelClass = "p-1 min-w-0 h-full flex flex-col overflow-hidden"

    return (
      <div className={BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS}>
        <div className={BATTING_TOP_2025_SEASON_GRID_CLASS}>
          {BATTING_TOP_2025_SEASON_TOP_METRICS.map((metric) => {
            if (!(displayLeaders[metric]?.length ?? 0)) return null
            return (
              <div key={metric} className={`${seasonAreaClass[metric]} min-w-0`}>
                <MetricPanel
                  metric={metric}
                  leaders={displayLeaders}
                  getRankingUrl={getRankingUrl}
                  getStatsListUrl={getStatsListUrl}
                  onStatsListNavigate={onStatsListNavigate}
                  renderLeaderRow={renderLeaderRow}
                  typography={typography}
                  panelClassName={seasonPanelClass}
                />
              </div>
            )
          })}
          {hasRbi ? (
            <div className="batting-top-2025-season-rbi min-w-0">
              <MetricPanel
                metric="打点"
                leaders={displayLeaders}
                getRankingUrl={getRankingUrl}
                getStatsListUrl={getStatsListUrl}
                onStatsListNavigate={onStatsListNavigate}
                renderLeaderRow={renderLeaderRow}
                typography={typography}
                panelClassName={seasonPanelClass}
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS}>
      <div className={BATTING_TOP_2025_FOUR_GRID_CLASS}>
        {BATTING_TOP_2025_GRID_METRICS.map((metric) =>
          leaders[metric]?.length ? (
            <MetricPanel
              key={metric}
              metric={metric}
              leaders={leaders}
              getRankingUrl={getRankingUrl}
              getStatsListUrl={getStatsListUrl}
              onStatsListNavigate={onStatsListNavigate}
              renderLeaderRow={renderLeaderRow}
              typography={typography}
            />
          ) : null
        )}
      </div>
    </div>
  )
}
