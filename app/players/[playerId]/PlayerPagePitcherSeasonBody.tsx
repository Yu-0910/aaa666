"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import { CareerHighStatGrid } from "@/app/components/player/CareerHighStatGrid"
import type { ViewportLayout } from "@/lib/viewportLayout"
import type { PitcherSeasonPocPayload, PitcherSeasonPitchingPeriodPayload } from "@/lib/pitcherSeasonPocTypes"
import { ORDERED_PITCH_COUNT_KEYS } from "@/lib/yahooGame/pitchCountSim"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import {
  pitcherPocBasicRow1,
  pitcherPocBasicRow2,
  pitcherPocBasicRow3,
  pitcherPocDayNightRows,
  pitcherPocHomeAwayRows,
  pitcherPocHandCells,
  pitcherPocCatcherRows,
  pitcherPocInningRow,
  pitcherPocMetricRow1,
  pitcherPocMetricRow2,
  pitcherPocMetricRow3,
  pitcherPocCountRows,
  pitcherPocSituationRows,
  pitcherPocTeamVsRows,
  pitcherPocStadiumRows,
  EMPTY_TEAM_VS_ROWS,
  EMPTY_STADIUM_VS_ROWS,
} from "@/lib/pitcherSeasonPocUi"
import { formatEra, formatRankingStatDisplay } from "@/lib/formatStat"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { formatSlashStatDisplay, slashRate3FromCounts } from "@/lib/battingRateFormat"
import {
  PitchTypeSplitViewsSection,
  type PitchTypeVsHandPanelsOpenState,
} from "@/app/components/PitchTypeSplitViewsSection"
import { kMinusBbPctOfBf, pctOfBf, PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS } from "./playerPageShared"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })
const PitchTypeChartLegend = dynamic(
  () => import("@/app/components/PitchTypePieChart").then((m) => ({ default: m.PitchTypeChartLegend })),
  { ssr: false },
)

export type PlayerPagePitcherSeasonBodyProps = {
  tb: string
  sectionStripeColor: string
  pitcherSeasonSubTab: "basic" | "pitch" | "situation" | "matchup"
  pitcherSeasonPocApiSettled: boolean
  pitcherSeasonPocPayload: PitcherSeasonPocPayload | null
  rosterMainReady: boolean
  pitcherSeasonPitchTypesPayload: PitcherSeasonPitchTypesPayload | null
  pitcherSeasonPitchTypesLoading: boolean
  gamePitchTypes: {
    game_id: string
    pitcher_id: string
    pitches_total: number
    rows: unknown[]
    total_row?: unknown
  } | null
  pitcherSeasonPitchingPeriodPayload: PitcherSeasonPitchingPeriodPayload | null
  pitcherPeriodMonthRows: Array<Record<string, unknown>>
  pitcherPeriodWeekRows: Array<Record<string, unknown>>
  layout: ViewportLayout
  isMobile: boolean
  seasonPilotPlayerId: string
  catcherAppearances: { gamesAsCatcher: number; gameIds: string[] } | null
  catcherPitchers: Array<Record<string, unknown>>
  catcherDefenseBasic: {
    sbAttempts: number
    sb: number
    cs: number
    csPct: number | null
  } | null
  catcherStartingSummary: Record<string, unknown> | null
  catcherPaRoundPitchTypes: Array<{
    key: "1" | "2" | "3" | "4" | "5"
    pitches_total: number
    rows: { pitch_type: string; pitches: number; pct: number }[]
  }>
  showFielderSeasonPilotUi: boolean
  kikuchiSeasonDetailTab: "basic" | "pitch" | "situation" | "matchup" | "catcher"
  /** 対左右球種データあり: 巡目別・カウント別の [左][右] 折りたたみ UI */
  pitchTypeSidePanelPilot?: boolean
  pitchTypeVsHandPanels?: PitchTypeVsHandPanelsOpenState
  onPitchTypeVsHandPanelToggle?: (section: "paRound" | "count", side: "left" | "right") => void
  /** 球種情報タブ初回表示時のみグラフアニメーションを再生 */
  animatePitchCharts?: boolean
  /** 伊藤大海: カウント別投球成績の打数・被安打列レイアウト */
  isItoDaiyaPage?: boolean
  /** 髙橋遥人: PC版の投手表倍率パイロット */
  pitcherPcTableCssPilot?: boolean
}

/** カウント別投球成績: 打数・被安打セルの表示順（伊藤は打数→被安打） */
function orderCountPitchAbCells(cells: string[], abBeforeH: boolean): string[] {
  if (!abBeforeH || cells.length < 2) return cells
  return [cells[1], cells[0], ...cells.slice(2)]
}

function pitcherCurrentSeasonBasicCards(
  pitcherSeasonPocPayload: PitcherSeasonPocPayload | null,
  pitcherSeasonPitchTypesPayload: PitcherSeasonPitchTypesPayload | null,
) {
  const na = "—"
  const b = pitcherSeasonPocPayload?.basic
  const wins =
    b == null
      ? na
      : `${typeof b.winCount === "number" ? b.winCount : b.decision === "win" ? 1 : 0}-${
          typeof b.lossCount === "number" ? b.lossCount : b.decision === "loss" ? 1 : 0
        }`
  const fastballRow = pitcherSeasonPitchTypesPayload?.rows.find((row) =>
    /ストレート|直球|fastball/i.test(row.pitch_type),
  )
  const fastballAvgSpeed =
    fastballRow?.avg_speed_kmh != null && Number.isFinite(fastballRow.avg_speed_kmh)
      ? fastballRow.avg_speed_kmh.toFixed(1)
      : na

  return [
    { title: "防御率", value: b ? formatEra(b.era) : na, year: "" },
    { title: "勝敗", value: wins, year: "" },
    {
      title: "K-BB％",
      value: b && b.bf > 0 ? formatRankingStatDisplay("K-BB％", ((b.so - b.bb) / b.bf) * 100) : na,
      year: "",
    },
    {
      title: "K％",
      value: b && b.bf > 0 ? formatRankingStatDisplay("K％", (b.so / b.bf) * 100) : na,
      year: "",
    },
    {
      title: "BB％",
      value: b && b.bf > 0 ? formatRankingStatDisplay("BB％", (b.bb / b.bf) * 100) : na,
      year: "",
    },
    { title: "ストレート平均球速", value: fastballAvgSpeed, year: "" },
  ]
}

export function PlayerPagePitcherSeasonBody(props: PlayerPagePitcherSeasonBodyProps) {
  const {
    tb,
    sectionStripeColor,
    pitcherSeasonSubTab,
    pitcherSeasonPocApiSettled,
    pitcherSeasonPocPayload,
    rosterMainReady,
    pitcherSeasonPitchTypesPayload,
    pitcherSeasonPitchTypesLoading,
    gamePitchTypes,
    pitcherSeasonPitchingPeriodPayload,
    pitcherPeriodMonthRows,
    pitcherPeriodWeekRows,
    layout,
    isMobile,
    seasonPilotPlayerId,
    catcherAppearances,
    catcherPitchers,
    catcherDefenseBasic,
    catcherStartingSummary,
    catcherPaRoundPitchTypes,
    showFielderSeasonPilotUi,
    kikuchiSeasonDetailTab,
    pitchTypeSidePanelPilot = false,
    pitchTypeVsHandPanels,
    onPitchTypeVsHandPanelToggle,
    animatePitchCharts = true,
    isItoDaiyaPage = false,
    pitcherPcTableCssPilot = false,
  } = props

  const pitcherSeasonFirstH2Class = `${tb} mb-4 pl-4`
  const seasonNumericFontClass = PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS
  const pitcherBasicCards = useMemo(
    () => pitcherCurrentSeasonBasicCards(pitcherSeasonPocPayload, pitcherSeasonPitchTypesPayload),
    [pitcherSeasonPocPayload, pitcherSeasonPitchTypesPayload],
  )

  const pitcherPocTeamTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocTeamVsRows(pitcherSeasonPocPayload)
        : EMPTY_TEAM_VS_ROWS,
    [pitcherSeasonPocPayload],
  )

  const pitcherPocCatcherTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocCatcherRows(pitcherSeasonPocPayload)
        : [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }],
    [pitcherSeasonPocPayload],
  )

  const pitcherPocHomeAwayTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocHomeAwayRows(pitcherSeasonPocPayload)
        : (["ホーム", "アウェー"] as const).map((label) => ({
            label,
            era: "—",
            wl: "—",
            ip: "—",
            k_bb_pct: "—",
            k_pct: "—",
            whip: "—",
            avg: "—",
          })),
    [pitcherSeasonPocPayload],
  )

  const pitcherPocDayNightTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocDayNightRows(pitcherSeasonPocPayload)
        : (["デー", "ナイター"] as const).map((label) => ({
            label,
            era: "—",
            wl: "—",
            ip: "—",
            k_bb_pct: "—",
            k_pct: "—",
            whip: "—",
            qs_pct: "—",
          })),
    [pitcherSeasonPocPayload],
  )

  const pitcherPocMaxInning = useMemo(() => {
    const fallback = 9
    const maxFromData =
      pitcherSeasonPocPayload?.splits?.byInning?.reduce((m, r) => Math.max(m, r.inning ?? 0), 0) ?? 0
    return Math.min(18, Math.max(fallback, maxFromData))
  }, [pitcherSeasonPocPayload])

  const pitcherPocStadiumTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocStadiumRows(pitcherSeasonPocPayload)
        : EMPTY_STADIUM_VS_ROWS,
    [pitcherSeasonPocPayload],
  )

  return (
    <div className={seasonNumericFontClass}>
                <DerivedPipelineEmptyNotice
                  variant="pitcher"
                  show={Boolean(
                    pitcherSeasonPocApiSettled && !pitcherSeasonPocPayload && rosterMainReady
                  )}
                />

                {pitcherSeasonSubTab === "basic" && (
                  <>
                    <h2
                      className={pitcherSeasonFirstH2Class}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      基本成績
                    </h2>

                    <CareerHighStatGrid
                      cards={pitcherBasicCards}
                      isMobile={isMobile}
                      className={
                        pitcherPcTableCssPilot
                          ? "fielder-basic-career-high-grid takahashi-haruto-basic-stat-grid roster-pitcher-basic-stat-grid mb-4"
                          : "pitcher-basic-career-high-grid mb-4"
                      }
                    />

                    <h2
                      className={pitcherSeasonFirstH2Class}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      詳細成績
                    </h2>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">防御率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">試合</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">先発</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">救援</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝利</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">敗戦</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">Ｓ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">ＨＰ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">QS</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow1(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">完投</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完封</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">無四球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">回数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打者</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">投球数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">P/IP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被安</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K%</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow2(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">被本</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">三振</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">四球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">故意四</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">死球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">暴投</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">失点</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">自責</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">WHIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">QS率</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow3(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        対チーム別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "108px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                チーム
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">防御率</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">回数</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">K％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocTeamTable.map((row) => (
                              <tr key={row.team} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  <div className="flex items-center gap-1 min-h-[1.25rem]">
                                    <div
                                      className="flex-shrink-0"
                                      style={{
                                        width: "4.32px",
                                        height: "17.28px",
                                        backgroundColor: rankingTeamStripeColor(row.team),
                                      }}
                                    />
                                    <span>{row.team}</span>
                                  </div>
                                </td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "1.25rem" }}>
                    <div
                      style={{
                        transform: "scale(1.2)",
                        transformOrigin: "top left",
                        width: "83.333%",
                        paddingTop: "2rem",
                        marginBottom: "1.35rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        左右別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "48px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                条件
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被安打</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                { label: "対右", key: "vsR" as const },
                                { label: "対左", key: "vsL" as const },
                              ] as const
                            ).map(({ label, key }) => {
                              const agg =
                                pitcherSeasonPocPayload?.splits?.vsHand?.[key] ?? null
                              const cells =
                                agg && pitcherSeasonPocPayload
                                  ? pitcherPocHandCells(agg)
                                  : Array.from({ length: 7 }, () => "—")
                              return (
                              <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-0 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {label}
                                </td>
                                {cells.map((cell, i) => (
                                  <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>

                    <div style={{ paddingTop: "2.75rem" }}>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-0`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      投球指標
                    </h2>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">QS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HQS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">SQS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被BABIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被出塁率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被長打率</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow1(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[16px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">GO/AO</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">援護率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IPR</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB%</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">FIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HR/9</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K-BB％</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow2(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[16px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">K％</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB％</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">LOB%</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">PR</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSAA</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSWIN</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow3(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[16px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "2.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        月間別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                月
                              </th>
                              {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "QS％"].map((h) => (
                                <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPeriodMonthRows.length > 0
                              ? pitcherPeriodMonthRows.map((row) => (
                                  <tr
                                    key={`m-${row.split_value}`}
                                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                  >
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.split_label}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {formatEra(row.era)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {`${Number(row.wins ?? 0)}-${Number(row.losses ?? 0)}`}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.ip}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {kMinusBbPctOfBf(row.so, row.bb, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {pctOfBf(row.so, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.whip != null ? row.whip.toFixed(3) : "—"}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {`${Number(row.wins ?? 0)}-${Number(row.losses ?? 0)}`}
                                    </td>
                                  </tr>
                                ))
                              : [
                                  { month: "～4月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "5月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "6月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "7月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "8月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "9月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "10月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "11月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                ].map((row) => (
                                  <tr key={row.month} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.month}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                  </tr>
                                ))}
                          </tbody>
                        </table>
                      </div>

                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        週間別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                週間
                              </th>
                              {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "被打率"].map((h) => (
                                <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPeriodWeekRows.length > 0
                              ? pitcherPeriodWeekRows.map((row) => (
                                  <tr
                                    key={`w-${row.split_value}`}
                                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                  >
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.split_label}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {formatEra(row.era)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      —
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.ip}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {kMinusBbPctOfBf(row.so, row.bb, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {pctOfBf(row.so, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.whip != null ? row.whip.toFixed(3) : "—"}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.avgAgainstApprox}
                                    </td>
                                  </tr>
                                ))
                              : (
                                  <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      3/10〜3/15
                                    </td>
                                    {Array.from({ length: 7 }, (_, i) => (
                                      <td
                                        key={i}
                                        className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                      >
                                        —
                                      </td>
                                    ))}
                                  </tr>
                                )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                  </>
                )}

                {pitcherSeasonSubTab === "pitch" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      投球データ
                    </h2>
                    {(() => {
                      const seasonRows = pitcherSeasonPitchTypesPayload?.rows ?? []
                      if (!seasonRows.length) return null
                      const colorOrder = seasonRows.map((r) => r.pitch_type)
                      const toChart = (pctKey: "pct_vs_left" | "pct_vs_right") =>
                        seasonRows
                          .map((r) => ({
                            pitch_type: r.pitch_type,
                            pitches: r.pitches,
                            pct: r[pctKey] ?? 0,
                          }))
                          .filter((r) => r.pct > 0)
                      const leftRows = toChart("pct_vs_left")
                      const rightRows = toChart("pct_vs_right")
                      if (!leftRows.length && !rightRows.length) return null
                      const vsHand = pitcherSeasonPocPayload?.splits?.vsHand
                      const donutCenterStats = (
                        agg: typeof vsHand extends null ? never : NonNullable<typeof vsHand>["vsL"],
                      ) => {
                        if (!agg || agg.bf <= 0) return undefined
                        const cells = pitcherPocHandCells(agg)
                        return { avgAgainst: cells[5], kBbPct: cells[2] }
                      }
                      return (
                        <div
                          className={
                            pitcherPcTableCssPilot
                              ? "season-pitch-chart-panel mb-4 w-full"
                              : "mb-4 w-full"
                          }
                        >
                          <div className="flex flex-row flex-wrap items-start justify-center gap-2 w-full">
                            {rightRows.length > 0 ? (
                              <PitchTypePieChart
                                title="対右"
                                rows={rightRows}
                                centerStats={vsHand ? donutCenterStats(vsHand.vsR) : undefined}
                                pitchTypeColorOrder={colorOrder}
                                compact
                                sizeScale={0.85}
                                isAnimationActive={animatePitchCharts}
                              />
                            ) : null}
                            {leftRows.length > 0 ? (
                              <PitchTypePieChart
                                title="対左"
                                rows={leftRows}
                                centerStats={vsHand ? donutCenterStats(vsHand.vsL) : undefined}
                                pitchTypeColorOrder={colorOrder}
                                compact
                                sizeScale={0.85}
                                isAnimationActive={animatePitchCharts}
                              />
                            ) : null}
                          </div>
                          <PitchTypeChartLegend
                            pitchTypes={colorOrder}
                            pitchTypeColorOrder={colorOrder}
                          />
                        </div>
                      )
                    })()}
                    <PitcherSeasonPitchTypesTable
                      rows={pitcherSeasonPitchTypesPayload?.rows ?? []}
                      loading={pitcherSeasonPitchTypesLoading}
                    />

                    <PitchTypeSplitViewsSection
                      key={`pitch-type-splits-${pitcherSeasonPocPayload?.npbPlayerId ?? "none"}-${pitchTypeSidePanelPilot ? "pilot" : "std"}`}
                      tb={tb}
                      sectionStripeColor={sectionStripeColor}
                      pitcherSeasonPocPayload={pitcherSeasonPocPayload}
                      seasonRows={pitcherSeasonPitchTypesPayload?.rows}
                      gameRows={(gamePitchTypes?.rows ?? []) as { pitch_type: string; pct: number }[]}
                      countSplits={pitcherSeasonPocPayload?.splits?.byCountPitchTypes}
                      sidePanelPilot={pitchTypeSidePanelPilot}
                      vsHandPanels={pitchTypeVsHandPanels}
                      onVsHandPanelToggle={onPitchTypeVsHandPanelToggle}
                      chartRevealAnimate={animatePitchCharts}
                    />
                  </>
                )}

                {pitcherSeasonSubTab === "situation" && (
                  <>
                    {/* カウント別の投球成績（野手「カウント別の打撃成績」と同デザイン） */}
                    <div className="w-full mb-7">
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        カウント別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "auto",
                            minWidth: "360px",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "54px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                条件
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">単打</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">二塁打</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">三塁打</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocCountRows(pitcherSeasonPocPayload)
                              : ORDERED_PITCH_COUNT_KEYS.map((label) => ({
                                  label,
                                  cells: Array.from({ length: 7 }, () => "ー"),
                                }))
                            ).map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-0.5 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                {row.cells.map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 状況別の投球成績（菊池ページ「状況別の打撃成績」と同じ条件列・ランナー別） */}
                    <div className="w-full mb-7">
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        状況別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "auto",
                            minWidth: "520px",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "52px" }} />
                            {isItoDaiyaPage ? (
                              <>
                                <col style={{ width: "54px" }} />
                                <col style={{ width: "54px" }} />
                              </>
                            ) : (
                              <>
                                <col style={{ width: "50px" }} />
                                <col style={{ width: "60px" }} />
                              </>
                            )}
                            {/* K-BB％ / K％ を BB％と同じ横幅に揃える */}
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                条件
                              </th>
                              {isItoDaiyaPage ? (
                                <>
                                  <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                                  <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被安打</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被安打</th>
                                  <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                                </>
                              )}
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocSituationRows(pitcherSeasonPocPayload)
                              : [
                                  "無し",
                                  "1塁",
                                  "2塁",
                                  "3塁",
                                  "1・2塁",
                                  "1・3塁",
                                  "2・3塁",
                                  "満塁",
                                  "非得点圏",
                                  "得点圏",
                                ].map((label) => ({
                                  label,
                                  cells: Array.from({ length: 7 }, () => "ー"),
                                }))
                            ).map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-0.5 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                {orderCountPitchAbCells(row.cells, isItoDaiyaPage).map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 巡目別の投球成績（野手「巡目別の打撃成績」と同デザイン） */}
                    <div className="w-full mb-7">
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        巡目別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                            minWidth: "570px",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "56px" }} />
                            <col style={{ width: "43px" }} />
                            <col style={{ width: "43px" }} />
                            <col style={{ width: "43px" }} />
                            <col style={{ width: "43px" }} />
                            <col style={{ width: "43px" }} />
                            <col style={{ width: "38px" }} />
                            <col style={{ width: "38px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                巡目
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                防御率
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                被打率
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                K-BB％
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                K％
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                BB％
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                自責点
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                被本塁打
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const LABELS = [
                                { key: "1", label: "1巡目" },
                                { key: "2", label: "2巡目" },
                                { key: "3", label: "3巡目" },
                                { key: "4", label: "4巡目" },
                                { key: "5", label: "5巡目以上" },
                              ] as const
                              const na = "—"
                              const rows = pitcherSeasonPocPayload?.splits?.byPaRound ?? []
                              const byKey = new Map(rows.map((r) => [String(r.key ?? "").trim(), r]))
                              const pct = (num: number, den: number) =>
                                den > 0 ? `${((num / den) * 100).toFixed(1)}%` : na
                              const eraCell = (era: number | null | undefined) => (era == null ? na : formatEra(era))
                              const avgAgainst = (r: { avg?: string; h: number; ab: number } | null) => {
                                if (!r) return na
                                const s = (r.avg ?? "").trim()
                                if (s) return s
                                return r.ab > 0 ? slashRate3FromCounts(r.h, r.ab) : na
                              }

                              return LABELS.map((item) => {
                                const r = byKey.get(item.key) ?? null
                                const bf = r?.bf ?? 0
                                const so = r?.so ?? 0
                                const bb = r?.bb ?? 0
                                const er = r?.er
                                return (
                                  <tr key={item.key} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                    <td
                                      className="px-0 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {item.label}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r ? eraCell(r.era) : na}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {avgAgainst(r as any)}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r ? pct(so - bb, bf) : na}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r ? pct(so, bf) : na}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r ? pct(bb, bf) : na}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r && typeof er === "number" ? String(er) : na}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {r ? String(r.hr ?? 0) : na}
                                    </td>
                                  </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "3rem" }}>
                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        球場別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                球場
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocStadiumTable.map((row) => (
                              <tr key={row.venue} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  <div className="flex items-center gap-1 min-h-[1.25rem]">
                                    <div
                                      className="w-1 h-4 flex-shrink-0"
                                      style={{
                                        backgroundColor: rankingTeamStripeColor(row.teamLabel),
                                      }}
                                    />
                                    <span>{row.venue}</span>
                                  </div>
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "3rem" }}>
                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        ホーム&ビジター別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                種別
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocHomeAwayTable.map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{formatSlashStatDisplay(row.avg)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      イニング別の投球成績
                    </h2>
                    <div className="overflow-x-auto overflow-y-hidden mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "separate",
                          borderSpacing: 0,
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <colgroup>
                          <col style={{ width: "58px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              イニング
                            </th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: pitcherPocMaxInning }, (_, i) => i + 1).map((inn) => {
                            const label = `${inn}回`
                            const cells =
                              pitcherSeasonPocPayload != null
                                ? pitcherPocInningRow(pitcherSeasonPocPayload, inn)
                                : Array.from({ length: 8 }, () => "—")
                            return (
                            <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-0.5 py-1 text-center latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {label}
                              </td>
                              {cells.map((cell, j) => (
                                <td
                                  key={j}
                                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "2.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        捕手別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                捕手
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocCatcherTable.map((row, ri) => (
                              <tr
                                key={`${row.label}-${ri}`}
                                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                              >
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                {row.cells.map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        デー&ナイター別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                種別
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocDayNightTable.map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                    </div>
                  </>
                )}
    </div>
  )
}
