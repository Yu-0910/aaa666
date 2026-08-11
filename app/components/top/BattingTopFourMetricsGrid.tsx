"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import type { LeaderRow } from "@/lib/ranking/leadersTypes"
import {
  BATTING_TOP_2025_FOUR_GRID_CLASS,
  BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS,
  BATTING_TOP_2025_GRID_METRICS,
  BATTING_TOP_2025_SEASON_GRID_CLASS,
  battingSeasonGridMetrics,
  battingTop2025SeasonTopN,
  pad2025SeasonTopMetricLeaders,
  topLeaderRowTypography,
  usesBatting2026SeasonSixMetricGrid,
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
  getStatsListUrl: (metric: string) => string
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
  year,
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
  year: number
  getRankingUrl: (metric: string) => string
  getStatsListUrl: (metric: string) => string
  onStatsListNavigate?: (url: string) => void
  renderLeaderRow: (props: LeaderRowRenderProps) => ReactNode
  typography: ReturnType<typeof topLeaderRowTypography>
  panelClassName?: string
  bordered?: boolean
}) {
  const rows = leaders[metric]
  if (!rows?.length) return null
  const topN = battingTop2025SeasonTopN(metric, String(year))
  const displayRows = topN != null ? rows.slice(0, topN) : rows

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
        <StatsListControl href={getStatsListUrl(metric)} onNavigate={onStatsListNavigate} className={statsListClass} />
      </div>
      <div className="min-w-0 space-y-0 overflow-hidden">
        {displayRows.map((leader, leaderIndex) =>
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
    ? year === 2025
      ? pad2025SeasonTopMetricLeaders(leaders as Record<string, LeaderRow[] | undefined>)
      : (leaders as Record<string, LeaderRow[] | undefined>)
    : leaders

  if (usePairedLayout) {
    const seasonAreaClass: Record<string, string> = {
      OPS: "batting-top-2025-season-ops",
      打率: "batting-top-2025-season-avg",
      本塁打: "batting-top-2025-season-hr",
      打点: "batting-top-2026-season-rbi",
      出塁率: "batting-top-2026-season-obp",
      長打率: "batting-top-2026-season-slg",
      IsoP: "batting-top-2026-season-isop",
      IsoD: "batting-top-2026-season-isod",
      盗塁: "batting-top-2026-season-sb",
      "BB/K": "batting-top-2026-season-bbk",
      RC: "batting-top-2026-season-rc",
      GPA: "batting-top-2026-season-gpa",
    }
    const seasonMetrics = battingSeasonGridMetrics(year)
    const hasAny = seasonMetrics.some((m) => (displayLeaders[m]?.length ?? 0) > 0)
    if (!hasAny) return null

    const seasonPanelClass = "p-1 min-w-0 h-full flex flex-col overflow-hidden"
    const gridClass = usesBatting2026SeasonSixMetricGrid(year, isWeeklyTab)
      ? "batting-top-2026-season-grid"
      : BATTING_TOP_2025_SEASON_GRID_CLASS

    return (
      <div className={BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS}>
        <div className={gridClass}>
          {seasonMetrics.map((metric) => {
            if (!(displayLeaders[metric]?.length ?? 0)) return null
            return (
              <div key={metric} className={`${seasonAreaClass[metric] ?? ""} min-w-0`}>
                <MetricPanel
                  metric={metric}
                  leaders={displayLeaders}
                  year={year}
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
              year={year}
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
