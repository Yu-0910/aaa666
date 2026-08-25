"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { teamPageNavEnabledForYear, teamPageNavHref } from "@/lib/teamPage/teamPageNavLinks"
import { type TopPageLayoutMode } from "@/app/components/top/TopPagePanels"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { fetchStandingsJson } from "@/lib/standings/fetchStandingsJson"
import { fetchWeeklyStandingsJson } from "@/lib/standings/fetchStandingsJson"
import { fetchWeeklyStandingsWithFallback } from "@/lib/standings/weeklyStandingsFallback"
import { fetchCurrentWeekMeta } from "@/lib/topPage/fetchTopWeeklyLeadersClient"
import type { TopStandingsView } from "@/app/components/common/RankingBottomNav"
import { formatStandingsCell } from "@/lib/standings/formatStandingsCell"
import {
  teamDisplayNameFromStandingRow,
  teamRomanNameFromCode,
} from "@/lib/standings/teamCodes"
import {
  standingsMetricColumnsForSource,
  WEEKLY_STANDINGS_METRIC_COLUMNS,
} from "@/lib/standings/metricColumns"
import type { StandingsMetricKey } from "@/lib/standings/metricColumns"
import {
  computeStandingsMetricLeagueRanks,
  isStandingsMetricWithLeagueRank,
  standingsMetricCircledRank,
} from "@/lib/standings/standingsMetricLeagueRanks"
import type { StandingsLeague, TeamStandingRow, TeamStandingsJson } from "@/lib/standings/types"

type TopPageStandingsTabProps = {
  year: number
  layout: TopPageLayoutMode
  activeView: TopStandingsView
}

type StandingsMetricJumpTarget = "batting" | "pitching"

type StandingsMetricJumpRequest = {
  target: StandingsMetricJumpTarget
  nonce: number
}

const STANDINGS_CLIENT_BUILD = "2026-08-25-2"

const LEAGUE_META: Record<
  StandingsLeague,
  { title: string; subtitle: string; color: string }
> = {
  CL: { title: "セ・リーグ", subtitle: "Central League", color: "#039850" },
  PL: { title: "パ・リーグ", subtitle: "Pacific League", color: "#10b8ce" },
}

const RANK_WIDTH = Math.round(28 * 0.9)
const TEAM_BAR_WIDTH = 4
const TEAM_NAME_BLOCK_HEIGHT = 32
/** 球団名・ローマ字ブロックの下方向オフセット（px・行スケール前） */
const TEAM_NAME_OFFSET_Y = 3
/** 球団帯カラー（縦ストライプ）の高さ */
const TEAM_BAR_HEIGHT = Math.round(TEAM_NAME_BLOCK_HEIGHT * 1.2)
const METRIC_COL_MIN = 52
/** 指標列の横幅スケール */
const METRIC_COL_WIDTH = Math.round(METRIC_COL_MIN * 0.8)
/** 主要指標列は横 1.1 倍 */
const METRIC_COL_WIDTH_AFTER_G = Math.round(METRIC_COL_WIDTH * 1.1)

function standingsMetricColWidth(key: StandingsMetricKey, scale = 1): number {
  if (key === "wl") return Math.round(METRIC_COL_WIDTH_AFTER_G * 1.2 * scale)
  const base = key === "g" ? METRIC_COL_WIDTH : METRIC_COL_WIDTH_AFTER_G
  return Math.round(base * scale)
}
const ROW_BG_EVEN = "#292929"
const ROW_BG_ODD = "#1f1f1f"
/** 順位・指標セルの数値フォント倍率 */
const STANDINGS_NUM_SIZE_SCALE = 1.1 * 0.85
/** 順位列の 1〜6 の数字だけを小さくする */
const STANDINGS_RANK_NUM_SIZE_SCALE = 0.8
/** 指標ヘッダー行の高さ（2行ラベル・順・球団で共通） */
const STANDINGS_HEADER_ROW_HEIGHT = 38
/** thead 固定時: 左ブロック（順・球団） */
const STANDINGS_HEAD_LEFT_Z = 3
/** thead 固定時: 指標列 */
const STANDINGS_HEAD_METRIC_Z = 2
/** tbody 左ブロック（横スクロール固定・ヘッダーより下） */
const STANDINGS_BODY_LEFT_Z = 1
/** 順位表の数値（個人ページの表セルと同じ Inter + tabular-nums） */
const STANDINGS_NUMERIC_CLASS = "latin font-black tabular-nums"

function rowBackgroundColor(idx: number): string {
  return idx % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD
}

function standingsMetricHeaderLabel(key: StandingsMetricKey, label: string) {
  if (key === "era_starter") {
    return (
      <>
        先発
        <br />
        防御率
      </>
    )
  }
  if (key === "era_relief") {
    return (
      <>
        救援
        <br />
        防御率
      </>
    )
  }
  return label
}

function standingsMetricHeaderNowrap(key: StandingsMetricKey): boolean {
  return key !== "era_starter" && key !== "era_relief"
}

export function TeamStandingsTable({
  rows,
  league,
  layout,
  year,
  source = "canonical",
  jumpRequest,
  compactRowScale = 1,
  teamRowScale = 1,
  metricRowScale = 1,
  metricFontScale = 1,
  metricColScale = 1,
  showMetricLeagueRanks = true,
  weeklyCompactColumns = false,
}: {
  rows: TeamStandingRow[]
  league: StandingsLeague
  layout: TopPageLayoutMode
  year: number
  source?: TeamStandingsJson["source"]
  jumpRequest?: StandingsMetricJumpRequest | null
  /** 行の縦スケール（セ・リーグUIテスト） */
  compactRowScale?: number
  /** 球団列の縦スケール（セ・リーグUIテスト） */
  teamRowScale?: number
  /** 指標列の縦スケール（セ・リーグUIテスト） */
  metricRowScale?: number
  /** 指標数値のフォントスケール（セ・リーグUIテスト） */
  metricFontScale?: number
  /** 指標列の横幅スケール（セ・リーグUIテスト） */
  metricColScale?: number
  showMetricLeagueRanks?: boolean
  weeklyCompactColumns?: boolean
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const teamPageLinksEnabled = teamPageNavEnabledForYear(year)
  const isMobile = layout === "mobile"
  const teamNameWidth = isMobile ? 88 : 112
  const leftBlockWidth = RANK_WIDTH + TEAM_BAR_WIDTH + teamNameWidth
  const metricColumns = useMemo(
    () => {
      const columns = (weeklyCompactColumns
        ? WEEKLY_STANDINGS_METRIC_COLUMNS
        : standingsMetricColumnsForSource(source as any)
      ).filter(
        (col) => col.key !== "g",
      )
      if (weeklyCompactColumns) return columns
      const pctIndex = columns.findIndex((col) => col.key === "pct")
      const gbIndex = columns.findIndex((col) => col.key === "gb")
      if (pctIndex >= 0 && gbIndex >= 0 && pctIndex < gbIndex) {
        const reordered = [...columns]
        const pctColumn = reordered[pctIndex]!
        reordered[pctIndex] = reordered[gbIndex]!
        reordered[gbIndex] = pctColumn
        return reordered
      }
      return columns
    },
    [source, weeklyCompactColumns],
  )

  const metricsBlockWidth = metricColumns.reduce(
    (sum, col) => sum + standingsMetricColWidth(col.key, metricColScale),
    0,
  )
  const tableMinWidth = leftBlockWidth + metricsBlockWidth
  const metricLeagueRanksByTeam = useMemo(
    () => (showMetricLeagueRanks ? computeStandingsMetricLeagueRanks(rows) : null),
    [rows, showMetricLeagueRanks],
  )

  useEffect(() => {
    if (!jumpRequest) return

    const targetKey = jumpRequest.target === "batting" ? "runs" : "runs_allowed"
    const targetIndex = metricColumns.findIndex((col) => col.key === targetKey)
    if (targetIndex < 0) return

    const scrollLeft = metricColumns
      .slice(0, targetIndex)
      .reduce((sum, col) => sum + standingsMetricColWidth(col.key, metricColScale), 0)

    scrollContainerRef.current?.scrollTo({ left: scrollLeft, behavior: "smooth" })
  }, [jumpRequest, metricColumns, metricColScale])

  const rowScale = compactRowScale
  const teamScale = rowScale * teamRowScale
  const metricScale = rowScale * metricRowScale
  const teamNameBlockHeight = Math.round(TEAM_NAME_BLOCK_HEIGHT * teamScale)
  const teamBarHeight = Math.round(TEAM_BAR_HEIGHT * teamScale)
  const metricRowMinHeight = Math.round(36 * metricScale)
  const rankFontSize = `${16 * STANDINGS_NUM_SIZE_SCALE * rowScale * STANDINGS_RANK_NUM_SIZE_SCALE}px`
  const metricFontSize = `${14 * STANDINGS_NUM_SIZE_SCALE * rowScale * metricFontScale}px`
  const teamNameFontSize = `${Math.round(13 * teamScale)}px`
  const teamRomanFontSize = `${Math.round(10 * teamScale)}px`
  const metricCellPy = Math.max(2, Math.round(6 * metricScale))
  const teamNameOffsetY = Math.round(TEAM_NAME_OFFSET_Y * teamScale)
  const rankNumericClass = STANDINGS_NUMERIC_CLASS
  const metricNumericClass = STANDINGS_NUMERIC_CLASS

  return (
    <div
      ref={scrollContainerRef}
      className="top-page-table-shell top-page-standings-scroll-shell w-full min-w-0 rounded border border-[#555] bg-black overflow-x-auto overflow-y-hidden overscroll-x-contain max-w-full"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pinch-zoom" }}
    >
      <table
        className="border-collapse border-spacing-0 max-w-none"
        style={{
          tableLayout: "fixed",
          width: `${tableMinWidth}px`,
          minWidth: `${tableMinWidth}px`,
        }}
      >
        <colgroup>
          <col style={{ width: `${leftBlockWidth}px` }} />
          {metricColumns.map((col) => (
            <col key={col.key} style={{ width: `${standingsMetricColWidth(col.key, metricColScale)}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-[#2a2a2a]" style={{ height: STANDINGS_HEADER_ROW_HEIGHT }}>
            <th
              className="sticky border-r-2 border-r-[#555] p-0"
              style={{
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: STANDINGS_HEAD_LEFT_Z,
                width: `${leftBlockWidth}px`,
                height: STANDINGS_HEADER_ROW_HEIGHT,
                boxSizing: "border-box",
                padding: 0,
                verticalAlign: "middle",
                backgroundColor: "#2a2a2a",
              }}
            >
              <div
                className="flex flex-nowrap items-stretch w-full h-full"
                style={{ height: STANDINGS_HEADER_ROW_HEIGHT }}
              >
                <div
                  className="flex items-center justify-center px-1 text-[10px] font-bold bg-[#ffff44] text-black flex-shrink-0 text-center"
                  style={{ width: RANK_WIDTH, height: STANDINGS_HEADER_ROW_HEIGHT, boxSizing: "border-box" }}
                >
                  順
                </div>
                <div
                  className="flex items-center px-2 text-[10px] font-bold bg-[#ffff44] text-black flex-shrink-0"
                  style={{
                    width: TEAM_BAR_WIDTH + teamNameWidth,
                    height: STANDINGS_HEADER_ROW_HEIGHT,
                    boxSizing: "border-box",
                  }}
                >
                  球団
                </div>
              </div>
            </th>
            {metricColumns.map((col) => {
              const colWidth = standingsMetricColWidth(col.key, metricColScale)
              return (
              <th
                key={col.key}
                className={`px-1 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black text-center leading-[1.05] ${
                  standingsMetricHeaderNowrap(col.key) ? "whitespace-nowrap" : ""
                }`}
                style={{
                  minWidth: colWidth,
                  width: colWidth,
                  height: STANDINGS_HEADER_ROW_HEIGHT,
                  boxSizing: "border-box",
                  verticalAlign: "middle",
                  position: "sticky",
                  top: 0,
                  zIndex: STANDINGS_HEAD_METRIC_Z,
                  backgroundColor: "#ffff44",
                }}
              >
                <span className="flex h-full items-center justify-center px-0.5">
                  {standingsMetricHeaderLabel(col.key, col.label)}
                </span>
              </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rowBg = rowBackgroundColor(idx)
            return (
              <tr
                key={row.team}
                className="group border-b border-[#333] hover:bg-[#2a2a2a]"
                style={{ backgroundColor: rowBg }}
              >
                <td
                  className="sticky border-r-2 border-r-[#555] group-hover:bg-[#2a2a2a]"
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: STANDINGS_BODY_LEFT_Z,
                    width: `${leftBlockWidth}px`,
                    padding: 0,
                    verticalAlign: "middle",
                    backgroundColor: rowBg,
                  }}
                >
                  <div
                    className="flex flex-nowrap items-stretch w-full"
                    style={{ height: teamBarHeight }}
                  >
                    <div
                      className={`flex items-center justify-center flex-shrink-0 self-stretch ${rankNumericClass} text-white/80`}
                      style={{ width: RANK_WIDTH, backgroundColor: rowBg, fontSize: rankFontSize }}
                    >
                      {row.rank}
                    </div>
                    <div
                      className="flex items-center gap-0 min-w-0 flex-shrink-0 self-stretch"
                      style={{ width: TEAM_BAR_WIDTH + teamNameWidth, backgroundColor: rowBg }}
                    >
                      <div
                        className="flex-shrink-0 self-center"
                        style={{
                          width: TEAM_BAR_WIDTH,
                          height: teamBarHeight,
                          backgroundColor: rankingTeamStripeColor(teamDisplayNameFromStandingRow(row), {
                            year,
                            league,
                          }),
                        }}
                      />
                      <div
                        className="flex-1 min-w-0 flex flex-col justify-start leading-[1.05] px-1"
                        style={{ minHeight: teamNameBlockHeight, paddingTop: teamNameOffsetY }}
                      >
                        {teamPageLinksEnabled ? (
                          <Link
                            href={teamPageNavHref(row.team, year)}
                            className="block truncate"
                          >
                            <span
                              className="text-white hover:text-[#ffff44] font-black tabular-nums truncate transition-colors"
                              style={{ fontSize: teamNameFontSize }}
                            >
                              {teamDisplayNameFromStandingRow(row)}
                            </span>
                          </Link>
                        ) : (
                          <span
                            className="block truncate text-white font-black tabular-nums"
                            style={{ fontSize: teamNameFontSize }}
                          >
                            {teamDisplayNameFromStandingRow(row)}
                          </span>
                        )}
                        <span
                          className="text-gray-400 latin truncate line-clamp-1"
                          style={{ fontSize: teamRomanFontSize }}
                        >
                          {teamRomanNameFromCode(row.team)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                {metricColumns.map((col) => {
                  const leagueRank = metricLeagueRanksByTeam?.get(row.team)?.[col.key]
                  const showLeagueRank =
                    showMetricLeagueRanks &&
                    isStandingsMetricWithLeagueRank(col.key) &&
                    leagueRank != null
                  return (
                  <td
                    key={col.key}
                    className={`relative p-0 text-center text-white ${metricNumericClass} border-r border-[#333] whitespace-nowrap group-hover:bg-[#2a2a2a]`}
                    style={{ fontSize: metricFontSize, backgroundColor: rowBg }}
                  >
                    <div
                      className="relative flex items-center justify-center px-1"
                      style={{ minHeight: metricRowMinHeight, padding: `${metricCellPy}px 0` }}
                    >
                      <span className="leading-none">{formatStandingsCell(col.key, row)}</span>
                      {showLeagueRank ? (
                        <span
                          className="absolute inset-x-0 top-1/2 mt-2.5 text-[9px] text-[#ffff44] font-normal leading-none"
                          aria-label={`リーグ内${leagueRank}位`}
                        >
                          {standingsMetricCircledRank(leagueRank)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function StandingsLeagueSection({
  league,
  data,
  layout,
  year,
  titleSuffix = "順位表",
  subtitle,
  showTeamPageNote = true,
  weeklyCompactColumns = false,
}: {
  league: StandingsLeague
  data: TeamStandingsJson
  layout: TopPageLayoutMode
  year: number
  titleSuffix?: string
  subtitle?: string
  showTeamPageNote?: boolean
  weeklyCompactColumns?: boolean
}) {
  const meta = LEAGUE_META[league]
  const isPl = league === "PL"
  const [jumpRequest, setJumpRequest] = useState<StandingsMetricJumpRequest | null>(null)

  const jumpToMetric = (target: StandingsMetricJumpTarget) => {
    setJumpRequest({ target, nonce: Date.now() })
  }

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0" style={{ width: "4px", height: "32px", backgroundColor: meta.color }} />
          <div className="min-w-0">
            <div className="text-sm font-medium">{meta.title} {titleSuffix}</div>
            <div className="text-[10px] text-gray-400">{subtitle ?? meta.subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="h-6 border border-[#555] bg-[#242424] px-2 text-[10px] font-bold text-gray-100 transition-colors hover:border-[#ffff44] hover:text-[#ffff44]"
            onClick={() => jumpToMetric("batting")}
          >
            野手指標
          </button>
          <button
            type="button"
            className="h-6 border border-[#555] bg-[#242424] px-2 text-[10px] font-bold text-gray-100 transition-colors hover:border-[#ffff44] hover:text-[#ffff44]"
            onClick={() => jumpToMetric("pitching")}
          >
            投手指標
          </button>
        </div>
      </div>
      <TeamStandingsTable
        rows={data.rows}
        league={league}
        layout={layout}
        year={year}
        source={data.source}
        jumpRequest={jumpRequest}
        compactRowScale={1.2}
        teamRowScale={0.85}
        metricRowScale={0.85}
        metricFontScale={isPl ? 0.89 : 0.85}
        metricColScale={1.15}
        showMetricLeagueRanks
        weeklyCompactColumns={weeklyCompactColumns}
      />
      {showTeamPageNote ? (
        <p className="text-[10px] text-gray-400">
          チーム名をタッチするとチームページへ移動できます。
        </p>
      ) : null}
    </section>
  )
}

export function TopPageStandingsTab({ year, layout, activeView }: TopPageStandingsTabProps) {
  const [cl, setCl] = useState<TeamStandingsJson | null>(null)
  const [pl, setPl] = useState<TeamStandingsJson | null>(null)
  const [weeklyCl, setWeeklyCl] = useState<TeamStandingsJson | null>(null)
  const [weeklyPl, setWeeklyPl] = useState<TeamStandingsJson | null>(null)
  const [weeklyLabel, setWeeklyLabel] = useState("")
  const [loading, setLoading] = useState(true)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCl(null)
    setPl(null)

    Promise.all([fetchStandingsJson(year, "CL"), fetchStandingsJson(year, "PL")])
      .then(([clData, plData]) => {
        if (cancelled) return
        setCl(clData)
        setPl(plData)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || "順位表データの取得に失敗しました")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year])

  useEffect(() => {
    if (!activeView.endsWith("weekly")) return

    let cancelled = false
    setWeeklyLoading(true)
    setWeeklyError(null)

    fetchCurrentWeekMeta(year)
      .then(async (weekMeta) => {
        const [clData, plData] = await Promise.all([
          fetchWeeklyStandingsWithFallback(
            year,
            weekMeta.weekKey,
            "CL",
            weekMeta.availableWeekKeys,
            fetchWeeklyStandingsJson,
          ),
          fetchWeeklyStandingsWithFallback(
            year,
            weekMeta.weekKey,
            "PL",
            weekMeta.availableWeekKeys,
            fetchWeeklyStandingsJson,
          ),
        ])
        if (cancelled) return
        setWeeklyCl(clData.data)
        setWeeklyPl(plData.data)
        setWeeklyLabel(clData.resolvedWeekLabel)
        setWeeklyLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setWeeklyError(err.message || "今週の順位表データの取得に失敗しました")
        setWeeklyLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeView, year])

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
        <Spinner className="size-8 text-[#FFFF44]" />
      </div>
    )
  }

  const isWeekly = activeView.endsWith("weekly")
  const league: StandingsLeague = activeView.startsWith("cl") ? "CL" : "PL"
  const data = isWeekly ? (league === "CL" ? weeklyCl : weeklyPl) : league === "CL" ? cl : pl

  if ((!isWeekly && (error || !cl || !pl)) || (isWeekly && (weeklyError || weeklyLoading === false && !data))) {
    return (
      <div className="text-white text-center py-8 text-sm space-y-2">
        <p>{(isWeekly ? weeklyError : error) || "順位表データの取得に失敗しました"}</p>
        <p className="text-gray-400 text-xs">
          {isWeekly
            ? `今週の順位表データが未生成の場合は、${year}年度の週次集計を確認してください。`
            : `${year} 年度のデータが未生成の場合は、ビルド後に R2 へ反映してください。`}
        </p>
      </div>
    )
  }

  if (isWeekly && weeklyLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-busy="true" aria-label="読み込み中">
        <Spinner className="size-8 text-[#FFFF44]" />
      </div>
    )
  }

  return (
    <div data-standings-client-build={STANDINGS_CLIENT_BUILD}>
      <StandingsLeagueSection
      league={league}
      data={data!}
      layout={layout}
      year={year}
      titleSuffix={isWeekly ? "今週の順位表" : undefined}
      subtitle={isWeekly ? `Weekly Standings (${weeklyLabel})` : undefined}
      showTeamPageNote={!isWeekly}
      weeklyCompactColumns={isWeekly}
      />
    </div>
  )
}
