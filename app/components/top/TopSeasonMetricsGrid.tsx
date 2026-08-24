"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS, battingTop2025SeasonTopN, topLeaderRowTypography } from "@/lib/topPageBatting2025Grid"
import { pitchingTop2026SeasonTopN } from "@/lib/topPagePitching2026Grid"

type LeaderRowRenderProps = {
  leader: Record<string, unknown>
  stat: string
  index: number
}

type TopSeasonMetricsGridProps = {
  year: number
  statsCategory: "batting" | "pitching"
  isWeeklyTab: boolean
  leaders: Record<string, unknown[] | undefined>
  metricRows: readonly (readonly string[])[]
  areaClassByMetric: Record<string, string>
  gridClassName: string
  displayMetricTitle?: (metricKey: string) => string
  getRankingUrl: (metric: string) => string
  getStatsListUrl: (metric: string) => string
  onStatsListNavigate?: (url: string) => void
  renderLeaderRow: (props: LeaderRowRenderProps) => ReactNode
}

function metricTitleClass(metric: string, titleSize: string): string {
  return `text-[#ffff44] ${titleSize} tracking-wider ${/[a-zA-Z％%]/.test(metric) ? "latin" : ""}`
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
  metricKey,
  metricTitle,
  leaders,
  topN,
  isWeeklyTab,
  getRankingUrl,
  getStatsListUrl,
  onStatsListNavigate,
  renderLeaderRow,
  typography,
}: {
  metricKey: string
  metricTitle: string
  leaders: Record<string, unknown[] | undefined>
  topN?: number | null
  isWeeklyTab: boolean
  getRankingUrl: (metric: string) => string
  getStatsListUrl: (metric: string) => string
  onStatsListNavigate?: (url: string) => void
  renderLeaderRow: (props: LeaderRowRenderProps) => ReactNode
  typography: ReturnType<typeof topLeaderRowTypography>
}) {
  const rows = leaders[metricKey]
  if (!rows?.length) return null
  const displayRows = topN != null ? rows.slice(0, topN) : rows

  const statsListBgClass = isWeeklyTab ? "!bg-transparent" : "bg-black"
  const statsListClass = `relative z-20 ml-auto shrink-0 ${statsListBgClass} py-0.5 px-0.5 ${typography.statsListLink} text-[#e8e8e8] hover:text-white transition-colors flex items-center`
  const panelClass = "top-page-table-shell rounded p-1 min-w-0 h-full flex flex-col overflow-hidden"
  const panelBgClass = isWeeklyTab ? "bg-[#1b1b1b]" : "bg-[#1f1f1f]"

  return (
    <div className={`${panelBgClass} border border-[#555] relative min-w-0 ${panelClass}`}>
      <div className={`relative mb-1 flex ${typography.metricHeaderMinH} items-center`}>
        <Link
          href={getRankingUrl(metricKey)}
          className="absolute left-1/2 top-1/2 z-10 max-w-[calc(100%-2.75rem)] -translate-x-1/2 -translate-y-1/2 text-center hover:opacity-80 transition-opacity"
        >
          <span className={metricTitleClass(metricTitle, typography.metricTitle)}>{metricTitle}</span>
        </Link>
        <StatsListControl href={getStatsListUrl(metricKey)} onNavigate={onStatsListNavigate} className={statsListClass} />
      </div>
      <div className="min-w-0 space-y-0 overflow-hidden">
        {displayRows.map((leader, leaderIndex) =>
          renderLeaderRow({
            leader: leader as Record<string, unknown>,
            stat: metricKey,
            index: leaderIndex,
          })
        )}
      </div>
    </div>
  )
}

export function TopSeasonMetricsGrid({
  year,
  statsCategory,
  isWeeklyTab,
  leaders,
  metricRows,
  areaClassByMetric,
  gridClassName,
  displayMetricTitle = (m) => m,
  getRankingUrl,
  getStatsListUrl,
  onStatsListNavigate,
  renderLeaderRow,
}: TopSeasonMetricsGridProps) {
  const typography = topLeaderRowTypography(year, statsCategory, isWeeklyTab)
  const topNForMetric =
    statsCategory === "pitching"
      ? (metric: string) => pitchingTop2026SeasonTopN(metric)
      : (metric: string) => battingTop2025SeasonTopN(metric, String(year))
  const flatMetrics = metricRows.flat()
  const hasAny = flatMetrics.some((m) => (leaders[m]?.length ?? 0) > 0)
  if (!hasAny) return null

  return (
    <div className={BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS}>
      <div className={gridClassName}>
        {flatMetrics.map((metricKey) => {
          if (!(leaders[metricKey]?.length ?? 0)) return null
          const title = displayMetricTitle(metricKey)
          const area = areaClassByMetric[metricKey] ?? ""
          return (
            <div key={metricKey} className={`${area} min-w-0`}>
              <MetricPanel
                metricKey={metricKey}
                metricTitle={title}
                leaders={leaders}
                topN={topNForMetric(metricKey)}
                isWeeklyTab={isWeeklyTab}
                getRankingUrl={getRankingUrl}
                getStatsListUrl={getStatsListUrl}
                onStatsListNavigate={onStatsListNavigate}
                renderLeaderRow={renderLeaderRow}
                typography={typography}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
