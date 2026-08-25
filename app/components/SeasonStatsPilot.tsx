"use client"

import { useState, useEffect, useLayoutEffect } from "react"
import type { CSSProperties, ReactNode } from "react"
import dynamic from "next/dynamic"
import type { BattingTotalRowSource } from "@/lib/seasonStatsPilotTypes"
import {
  DERIVED_SEASON_YEAR_DEFAULT,
  formatSeasonRispAvgDisplay,
  mergeSeasonStatsRows,
  type BattingVsHandTotalReconciliation,
  type PilotBlocksData,
  type SeasonStatsRow,
} from "@/lib/seasonStatsPilotShared"
import { unwrapSeasonStatsApiJson } from "@/lib/api/unwrapPlayerDerivedPayload"
import type {
  PitchTypeHandSplitStats,
  PitchTypeStats,
  SpeedBandStatsMap,
} from "@/lib/pitchDetailsPilotShared"
import { STRAIGHT_SPEED_BANDS, STRAIGHT_SPEED_BAND_KEYS } from "@/lib/straightSpeedBands"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { createFielderPlaceholderTotalRow } from "@/lib/fielderSeasonPlaceholderRow"
import { rosterPositionToFieldStubRowKey } from "@/lib/rosterFieldPositionStub"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import { STADIUM_VENUE_UI_ROWS_BATTING, formatPlayerPageStadiumDisplay } from "@/lib/stadiumVenueNormalize"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import { formatRankingStatDisplay } from "@/lib/formatStat"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { STARTER_FIELD_TABLE_KEYS } from "@/lib/yahooGame/starterFieldPositionFromStats"
import { playerVsTeamNamesMatch } from "@/lib/standings/teamCodes"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })
const PitchTypeChartLegend = dynamic(
  () => import("@/app/components/PitchTypePieChart").then((m) => ({ default: m.PitchTypeChartLegend })),
  { ssr: false }
)

export type PilotSeasonDetailTab = "basic" | "pitch" | "situation"

type Props = {
  playerId: string
  /** 菊池ページの今季サブタブ。未指定時は全ブロックを表示 */
  seasonDetailTab?: PilotSeasonDetailTab
  layout?: ViewportLayout
  /** 菊池など：見出し・表ブロック間の縦余白を広げる */
  looseSpacing?: boolean
  /** 2026 名簿の野手シェル：API 失敗時も通算「—」で今季ブロックを出す */
  rosterFielderShell?: boolean
  /** 名簿の支配下ポジション（例: 捕手）。スタメン守備位置別のプレースホルダ行に使う */
  rosterPrimaryPositionLabel?: string
  /** 見出し左の縦帯色（未指定時は従来の赤） */
  headingStripeColor?: string
  /** 今季サブタブ固定レイアウト: タブ下余白と重複する先頭 mt を抑える */
  pinLayoutShell?: boolean
  /** 球種情報タブ初回表示時のみ円グラフアニメーションを再生 */
  animatePitchCharts?: boolean
  /** 基本成績タブの本文先頭に差し込む追加コンテンツ */
  renderBasicTopContent?: (totalRow: SeasonStatsRow | null) => ReactNode
}

/** 暗いストライプのデータ行。親の text-white / body の color 継承が崩れても数値が読めるよう明示する */
const PILOT_TABLE_DATA_ROW: CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.03)",
  color: "#f5f5f5",
}
const PILOT_TABLE_DATA_ROW_TOP_LINE: CSSProperties = {
  ...PILOT_TABLE_DATA_ROW,
  borderTop: "1px solid #333",
}

function PilotTotalRecordBlock({
  totalRow,
  titleBase,
  sbPct,
  looseSpacing,
  headingStripeColor = "#FF4444",
}: {
  totalRow: SeasonStatsRow
  titleBase: string
  sbPct: string
  looseSpacing?: boolean
  headingStripeColor?: string
}) {
  const loose = Boolean(looseSpacing)
  return (
    <>
      <h2
        className={`${titleBase} ${loose ? "mb-5 pl-4" : "mb-3 pl-4"}`}
        style={{
          borderLeft: `6px solid ${headingStripeColor}`,
          fontWeight: 900,
        }}
      >
        通算成績
      </h2>
      <div className={`player-page-table-shell rounded overflow-hidden overflow-x-auto ${loose ? "mb-8" : "mb-3"}`}>
        <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed", width: "100%" }}>
          <tbody>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">OPS</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打率</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">安打</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">本塁打</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打点</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">試合</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打席</th>
              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打数</th>
            </tr>
            <tr style={PILOT_TABLE_DATA_ROW_TOP_LINE}>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">{formatSlashStatDisplay(totalRow.ops)}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{formatSlashStatDisplay(totalRow.avg)}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.h}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.hr}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.rbi}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.g}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.pa}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.ab}</td>
            </tr>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">単打</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">二塁打</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">三塁打</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">得点</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">出塁率</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">長打率</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">得点圏打率</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">四球</th>
            </tr>
            <tr style={PILOT_TABLE_DATA_ROW_TOP_LINE}>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">{totalRow.h1}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.h2}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.h3}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.r}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{formatSlashStatDisplay(totalRow.obp)}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{formatSlashStatDisplay(totalRow.slg)}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">
                {formatSeasonRispAvgDisplay(totalRow)}
              </td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.bb}</td>
            </tr>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">死球</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">三振</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">塁打</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">盗塁</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">盗塁成功率</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">犠打</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">犠飛</th>
              <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">併殺打</th>
            </tr>
            <tr style={PILOT_TABLE_DATA_ROW_TOP_LINE}>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">{totalRow.hbp}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.so}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.tb}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.sb}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{sbPct || "—"}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.sh}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.sf}</td>
              <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{totalRow.gidp}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

/** 個人ページ表示項目整理 ブロックA・D 準拠の今季成績 */
export default function SeasonStatsPilot({
  playerId,
  seasonDetailTab,
  layout = "mobile",
  looseSpacing,
  rosterFielderShell,
  rosterPrimaryPositionLabel,
  headingStripeColor = "#FF4444",
  pinLayoutShell = false,
  animatePitchCharts = true,
  renderBasicTopContent,
}: Props) {
  const isMobile = layout === "mobile"
  const titleBase = isMobile ? "text-[1.625rem]" : "text-[1.125rem]"
  const [stats, setStats] = useState<SeasonStatsRow[]>([])
  const [blocks, setBlocks] = useState<PilotBlocksData | null>(null)
  const [pitchTypeStats, setPitchTypeStats] = useState<PitchTypeStats[]>([])
  const [pitchTypeHandSplit, setPitchTypeHandSplit] = useState<PitchTypeHandSplitStats>({
    vsRight: [],
    vsLeft: [],
  })
  const [speedBandStats, setSpeedBandStats] = useState<SpeedBandStatsMap>({})
  const [loading, setLoading] = useState(true)
  const [isPilot, setIsPilot] = useState(false)
  const [battingTotalRowSource, setBattingTotalRowSource] = useState<BattingTotalRowSource>(null)
  const [battingVsHandReconciliation, setBattingVsHandReconciliation] =
    useState<BattingVsHandTotalReconciliation | null>(null)

  /** playerId 切替の 1 レンダー目で前選手の表が一瞬映るのを防ぐ（ペイント前にスピナーへ） */
  useLayoutEffect(() => {
    if (!playerId) {
      setStats([])
      setBlocks(null)
      setPitchTypeStats([])
      setPitchTypeHandSplit({ vsRight: [], vsLeft: [] })
      setSpeedBandStats({})
      setIsPilot(false)
      setBattingTotalRowSource(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setStats([])
    setBlocks(null)
    setPitchTypeStats([])
    setPitchTypeHandSplit({ vsRight: [], vsLeft: [] })
    setSpeedBandStats({})
    setIsPilot(false)
    setBattingTotalRowSource(null)
    setBattingVsHandReconciliation(null)
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(
      `/api/players/${encodeURIComponent(playerId)}/season-stats?year=${encodeURIComponent(DERIVED_SEASON_YEAR_DEFAULT)}`,
      {
        cache: "no-store",
      }
    )
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        return unwrapSeasonStatsApiJson(json)
      })
      .then((data) => {
        if (cancelled) return
        setStats(data.stats || [])
        setIsPilot(data.isPilot || false)
        setBlocks(data.blocks ?? null)
        setPitchTypeStats(data.pitchTypeStats ?? [])
        setPitchTypeHandSplit(data.pitchTypeHandSplit ?? { vsRight: [], vsLeft: [] })
        setSpeedBandStats(data.speedBandStats ?? {})
        setBattingTotalRowSource(data.battingTotalRowSource ?? null)
        setBattingVsHandReconciliation(data.battingVsHandReconciliation ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setStats([])
        setIsPilot(false)
        setBlocks(null)
        setPitchTypeStats([])
        setPitchTypeHandSplit({ vsRight: [], vsLeft: [] })
        setSpeedBandStats({})
        setBattingTotalRowSource(null)
        setBattingVsHandReconciliation(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [playerId])

  if (loading) {
    return (
      <div className="mb-8">
        <SectionLoadingSpinner />
      </div>
    )
  }

  /** Phase17 の月間・週間行が stats に含まれるときはプレースホルダー差し替えで捨てない（期間タブが空になるのを防ぐ） */
  const hasBattingPeriodRowsInStats = stats.some(
    (r) => r.split_type === "calendar_month" || r.split_type === "calendar_week"
  )
  // 派生行が 1 行でもあれば常にそれを表示する（!isPilot だけでプレースホルダーに差し替えると、API が isPilot を落とした瞬間に実数値が消える）
  const rosterShell =
    Boolean(rosterFielderShell) && stats.length === 0 && !hasBattingPeriodRowsInStats
  const effectiveStats = rosterShell
    ? ([createFielderPlaceholderTotalRow()] as SeasonStatsRow[])
    : stats
  const effectiveIsPilot = rosterShell ? true : isPilot

  // 以前は「パイロット選手以外は非表示」だったが、派生 JSON がある通常選手でも今季成績を表示する
  if (effectiveStats.length === 0) {
    return (
      <div className="mb-8 text-sm text-gray-400">
        今季データがありません（CSV または派生 JSON の未生成の可能性があります）。
      </div>
    )
  }

  const totalRow = effectiveStats.find((r) => r.split_type === "total" && r.split_value === "total")
  const sbPctRaw =
    totalRow?.sb_pct ||
    (totalRow && totalRow.sb + totalRow.cs > 0
      ? ((totalRow.sb / (totalRow.sb + totalRow.cs)) * 100).toFixed(1)
      : "")
  const sbPct = sbPctRaw ? (sbPctRaw.endsWith("%") ? sbPctRaw : `${sbPctRaw}%`) : ""
  /** ランキングページと同じ formatStat ルール（欠損は —） */
  const fmtRank = (metricLabel: string, v: string | undefined) =>
    formatRankingStatDisplay(metricLabel, v)
  const showPilotTab = (t: PilotSeasonDetailTab) => seasonDetailTab == null || seasonDetailTab === t
  const loose = Boolean(looseSpacing)
  const h2Section = pinLayoutShell
    ? `${titleBase} mb-4 pl-4 mt-0`
    : `${titleBase} ${loose ? "mb-5 pl-4 mt-10" : "mb-3 pl-4 mt-3"}`
  const h2BattingMetrics = pinLayoutShell
    ? `${titleBase} mb-4 pl-4 mt-0`
    : `${titleBase} ${loose ? "mb-5 pl-4 mt-8" : "mb-3 pl-4 mt-3"}`
  const mbBox = loose ? "mb-6" : "mb-3"
  const mbScroll = loose ? "mb-6" : "mb-3"
  const mbAfterChart = loose ? "mb-8 mt-6" : "mb-3 mt-3"
  const blockWrap = loose ? "mb-6" : "mb-4"
  const vsHandMap = new Map(
    effectiveStats.filter((r) => r.split_type === "vs_hand").map((r) => [r.split_value, r] as const)
  )
  const pitchTypeColorOrder = Array.from(
    new Set(
      [pitchTypeStats, pitchTypeHandSplit.vsRight, pitchTypeHandSplit.vsLeft]
        .flat()
        .map((row) => row.pitch_type)
    )
  )
  const pitchTypeHandCards = [
    { key: "L", title: "対左投手", rows: pitchTypeHandSplit.vsLeft },
    { key: "R", title: "対右投手", rows: pitchTypeHandSplit.vsRight },
  ] as const

  const centerStatsForPitcherHand = (key: "R" | "L") => {
    const row = vsHandMap.get(key)
    if (!row) return undefined
    return {
      primaryLabel: "打率",
      primaryValue: formatSlashStatDisplay(row.avg),
      secondaryLabel: "K%",
      secondaryValue: fmtRank("K%", row.k_pct),
    }
  }

  return (
    <div className={`mb-12${pinLayoutShell ? "" : loose ? " mt-10" : ""}`}>
      {battingTotalRowSource === "batting_lines_fallback" && (
        <div
          className={`rounded border border-amber-500/35 bg-amber-950/35 px-3 py-2 text-sm text-amber-100/95 ${loose ? "mb-8" : "mb-4"}`}
          role="status"
        >
          一球速報が未取り込みの試合を含むため、通算は<strong className="font-semibold">出場成績</strong>
          から集計しています。球種・コース・詳細スプリットは一球連携後に揃います。
        </div>
      )}
      {/* total 行が無いと従来は以下全体が非表示になり Phase17 のみのとき真っ白になる。通算・打撃指標だけ total に依存する。 */}
      <div className={blockWrap}>
        {showPilotTab("basic") && (
          <div className="season-basic-overview-flow">
            {renderBasicTopContent ? (
              <div className="season-basic-overview-item">
                {renderBasicTopContent(totalRow)}
              </div>
            ) : null}
            {totalRow ? (
              <>
                <div className="season-basic-overview-item">
          <PilotTotalRecordBlock
            totalRow={totalRow}
            titleBase={titleBase}
            sbPct={sbPct}
            looseSpacing={loose}
            headingStripeColor={headingStripeColor}
          />
                </div>

                <div className="season-basic-overview-item">
          {/* 打撃指標（セイバーメトリクス） */}
          <h2
            className={h2BattingMetrics}
            style={{
              borderLeft: `6px solid ${headingStripeColor}`,
              fontWeight: 900,
            }}
          >
            打撃指標
          </h2>
          <div className={`player-page-table-shell rounded overflow-hidden overflow-x-auto ${mbBox}`}>
            <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed", width: "100%" }}>
              <tbody>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">NOI</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">GPA</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RC</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">XR</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BABIP</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB/K</th>
                </tr>
                <tr style={PILOT_TABLE_DATA_ROW_TOP_LINE}>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">{fmtRank("NOI", totalRow.noi)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("GPA", totalRow.gpa)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("RC", totalRow.rc)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("XR", totalRow.xr)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("BABIP", totalRow.babip)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("BB/K", totalRow.bbk)}</td>
                </tr>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">IsoD</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IsoP</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB%</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K%</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">SecA</th>
                  <th className="px-1 py-1.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">TA</th>
                </tr>
                <tr style={PILOT_TABLE_DATA_ROW_TOP_LINE}>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">{fmtRank("IsoD", totalRow.isod)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("IsoP", totalRow.isop)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("BB%", totalRow.bb_pct)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("K%", totalRow.k_pct)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("SecA", totalRow.seca)}</td>
                  <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">{fmtRank("TA", totalRow.ta)}</td>
                </tr>
              </tbody>
            </table>
          </div>
                </div>

              </>
            ) : null}
          </div>
        )}

          {/* 対左右別の対戦成績（チーム別と同デザイン） */}
          {showPilotTab("basic") && (() => {
            const vsHandMap = new Map(
              effectiveStats.filter((r) => r.split_type === "vs_hand").map((r) => [r.split_value, r])
            )
            const getRow = (key: "R" | "L" | "unknown") => vsHandMap.get(key) ?? null

            if (vsHandMap.size === 0) {
              return (
                <div className="mb-6 text-sm text-gray-400">
                  対左右別の対戦成績は未取得です（打席ごとの相手投手情報が必要なため、試合データの取り込み状況により空になります）。
                </div>
              )
            }

            const VS_HAND_ORDER = [
              { label: "対右", key: "R" as const },
              { label: "対左", key: "L" as const },
              ...(vsHandMap.has("unknown") ? [{ label: "対不明", key: "unknown" as const }] : []),
            ]

            const fmtCountDiff = (n: number) => (n === 0 ? "±0" : n > 0 ? `+${n}` : `${n}`)
            const rec = battingVsHandReconciliation
            const fmtPct0 = (x: number | null) =>
              x == null || !Number.isFinite(x) ? "—" : `${Math.round(x * 100)}%`

            return (
              <>
                {rec && (
                  <div
                    className={`rounded border border-slate-500/40 bg-slate-950/55 px-3 py-2 text-sm text-slate-200/95 ${loose ? "mb-5" : "mb-3"}`}
                    role="status"
                  >
                    対左右別は「相手投手の左右が判定できた打席」だけ集計されます。判定できた打席は全体の{" "}
                    <strong className="font-semibold">{fmtPct0(rec.coveredPaPct)}</strong>
                    （未判定: 打席 {fmtCountDiff(rec.delta.pa)}、打数 {fmtCountDiff(rec.delta.ab)}、安打{" "}
                    {fmtCountDiff(rec.delta.h)}）。
                  </div>
                )}
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  対左右別の対戦成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "48px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                          条件
                        </th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">K％</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VS_HAND_ORDER.map((item) => {
                        const row = getRow(item.key)
                        const na = "—"
                        return (
                          <tr
                            key={item.label}
                            style={PILOT_TABLE_DATA_ROW}
                          >
                            <td className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{item.label}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? row.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? fmtRank("K%", row.k_pct) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* チーム別の対戦成績（12球団固定表示） */}
          {showPilotTab("basic") && (() => {
            const TEAM_ORDER = [
              { label: "日本ハム" },
              { label: "楽天" },
              { label: "西武" },
              { label: "ロッテ" },
              { label: "オリックス" },
              { label: "ソフトバンク" },
              { label: "巨人" },
              { label: "ヤクルト" },
              { label: "横浜" },
              { label: "中日" },
              { label: "阪神" },
              { label: "広島" },
            ] as const
            const teamStatsMap = new Map(
              effectiveStats
                .filter((r) => r.split_type === "vs_team")
                .map((r) => [r.split_value, r])
            )
            const findStats = (label: string) =>
              Array.from(teamStatsMap.entries()).find(([k]) => playerVsTeamNamesMatch(label, k))?.[1] ?? null

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  チーム別の対戦成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
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
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                          チーム
                        </th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TEAM_ORDER.map((team) => {
                        const row = findStats(team.label)
                        const na = "—"
                        return (
                          <tr
                            key={team.label}
                            style={PILOT_TABLE_DATA_ROW}
                          >
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              <div className="flex items-center gap-1 min-h-[1.25rem]">
                                <div className="w-1 h-4 flex-shrink-0" style={{ backgroundColor: rankingTeamStripeColor(team.label) }} />
                                <span>{team.label}</span>
                              </div>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? row.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  パ・リーグ: 日本ハム・楽天・西武・ロッテ・オリックス・ソフトバンク　／　セ・リーグ: 巨人・ヤクルト・横浜・中日・阪神・広島
                </p>
              </>
            )
          })()}

          {/* 月間成績（Phase 17: calendar_month + 3・4月併合） */}
          {showPilotTab("basic") && (() => {
            const Y = DERIVED_SEASON_YEAR_DEFAULT
            const mRow = (mm: string) =>
              effectiveStats.find((r) => r.split_type === "calendar_month" && r.split_value === `${Y}-${mm}`)
            const marApr = mergeSeasonStatsRows(
              [mRow("03"), mRow("04")].filter((x): x is SeasonStatsRow => x != null),
              "calendar_month_display",
              "mar-apr",
              "3・4月"
            )
            const MONTH_ITEMS: { key: string; label: string; row: SeasonStatsRow | null }[] = [
              { key: "3・4月", label: "3・4月", row: marApr },
              { key: "5月", label: "5月", row: mRow("05") ?? null },
              { key: "6月", label: "6月", row: mRow("06") ?? null },
              { key: "7月", label: "7月", row: mRow("07") ?? null },
              { key: "8月", label: "8月", row: mRow("08") ?? null },
              { key: "9月", label: "9月", row: mRow("09") ?? null },
              { key: "10月", label: "10月", row: mRow("10") ?? null },
              { key: "11月", label: "11月", row: mRow("11") ?? null },
            ]
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  月間成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "56px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">月名</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTH_ITEMS.map((item) => {
                        const row = item.row
                        const hasData = row != null && row.pa > 0
                        return (
                          <tr key={item.key} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              {item.label}
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* 週間成績（Phase 17: calendar_week） */}
          {showPilotTab("basic") && (() => {
            const na = "—"
            const weekRows = effectiveStats
              .filter((r) => r.split_type === "calendar_week" && r.pa > 0)
              .sort((a, b) => b.split_value.localeCompare(a.split_value))
            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  週間成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "72px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">週間</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekRows.length === 0 ? (
                        <tr style={PILOT_TABLE_DATA_ROW}>
                          <td
                            className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                            colSpan={8}
                          >
                            {na}
                          </td>
                        </tr>
                      ) : (
                        weekRows.map((row) => (
                          <tr key={row.split_value} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              {row.split_label}
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{formatSlashStatDisplay(row.ops)}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{formatSlashStatDisplay(row.avg)}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.hr}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.rbi}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.obp}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ab}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.h}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-1">週は火曜始まり・日曜終わり。失策は取得対象外のため—</p>
              </>
            )
          })()}

          {/* 球種別の打撃成績（チーム別と同デザイン）。未連携時は API が pitchTypeStats: [] のため見出し＋「—」行のみ */}
          {showPilotTab("pitch") && (
            <>
              <h2
                className={h2Section}
                style={{
                  borderLeft: `6px solid ${headingStripeColor}`,
                  fontWeight: 900,
                }}
              >
                球種別の打撃成績
              </h2>
              {pitchTypeColorOrder.length > 0 ? (
                <>
                  <div className="season-pitch-type-chart-list flex flex-row flex-wrap items-start justify-center gap-2 w-full">
                    {pitchTypeHandCards.map((item) =>
                      item.rows.length > 0 ? (
                        <div key={`chart-${item.key}`} className="season-pitch-chart-panel w-[11rem] max-w-full shrink-0">
                          <div className="flex w-full justify-center">
                            <PitchTypePieChart
                              title={item.title}
                              rows={item.rows.map((r) => ({
                                pitch_type: r.pitch_type,
                                pitches: r.pitches,
                                pct: r.pct,
                              }))}
                              centerStats={centerStatsForPitcherHand(item.key)}
                              pitchTypeColorOrder={pitchTypeColorOrder}
                              compact
                              sizeScale={0.85}
                              isAnimationActive={animatePitchCharts}
                            />
                          </div>
                        </div>
                      ) : null)}
                  </div>
                  <PitchTypeChartLegend
                    pitchTypes={pitchTypeColorOrder}
                    pitchTypeColorOrder={pitchTypeColorOrder}
                    className={loose ? "mb-5" : "mb-3"}
                  />
                  <div className={`season-pitch-type-table-list flex flex-row flex-wrap items-start gap-4 ${mbAfterChart}`}>
                    {pitchTypeHandCards.map((item) => (
                      <div key={item.key} className="min-w-0 flex-1 basis-[430px]">
                        <div
                          className="mb-2 inline-block rounded-sm bg-[#FFFF44] px-3 py-1 text-[13px] font-black text-black"
                        >
                          {item.title}
                        </div>
                        <div className="player-page-table-shell rounded overflow-x-auto overflow-y-hidden">
                          <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                            <colgroup>
                              <col style={{ width: "95px" }} />
                              <col style={{ width: "45px" }} />
                              <col style={{ width: "72px" }} />
                              <col style={{ width: "51px" }} />
                              <col style={{ width: "50px" }} />
                              <col style={{ width: "45px" }} />
                              <col style={{ width: "45px" }} />
                            </colgroup>
                            <thead>
                              <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                                <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                  球種
                                </th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">割合</th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 whitespace-nowrap">
                                  平均球速<span className="latin">(km/h)</span>
                                </th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">空振り%</th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">OPS</th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                                <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.rows.length > 0 ? (
                                item.rows.map((row) => (
                                  <tr key={`${item.key}-${row.pitch_type}`} style={PILOT_TABLE_DATA_ROW}>
                                    <td className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                                      <span>{row.pitch_type}</span>
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.pct.toFixed(1)}%</td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 whitespace-nowrap">
                                      {row.avg_speed != null ? (
                                        <>
                                          {row.avg_speed.toFixed(1)}
                                          <span className="latin text-[11px] opacity-90"> km/h</span>
                                        </>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whiff_pct}</td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{formatSlashStatDisplay(row.ops)}</td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{formatSlashStatDisplay(row.avg)}</td>
                                    <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.hr}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr style={PILOT_TABLE_DATA_ROW}>
                                  <td colSpan={7} className="px-3 py-3 text-center text-sm border-b border-gray-500">
                                    —
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={`text-sm text-gray-400 ${mbAfterChart}`}>
                  球種別の打撃成績は未取得です（投球詳細データが必要です）。
                </div>
              )}
            </>
          )}

          {/* 球速別の打撃成績（ストレート限定・打順別と同デザイン）。球種データが無いときはデモ用 pilotSpeedData を出さず全「—」 */}
          {showPilotTab("pitch") && (() => {
            const getSpeedRow = (key: string) => speedBandStats[key] ?? null
            const na = "—"
            const hasAnySpeedBand = STRAIGHT_SPEED_BAND_KEYS.some((k) => getSpeedRow(k) != null)

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  球速別の打撃成績（ストレート限定）
                </h2>
                {pitchTypeStats.length > 0 && !hasAnySpeedBand && (
                  <p className={`text-sm text-gray-400 ${loose ? "mb-4" : "mb-2"}`}>
                    ストレート球の球速データを表示できませんでした。しばらくしてから、もう一度お試しください。
                  </p>
                )}
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
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
                      <col style={{ width: "69px" }} />
                      <col style={{ width: "40px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "40px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                          球速
                        </th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">ISOP</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">投球割合</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">空振り率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STRAIGHT_SPEED_BANDS.map((item) => {
                        const row = getSpeedRow(item.key)
                        const hasData =
                          row != null &&
                          (row.pitch_share_pct !== "—" ||
                            row.avg !== "—" ||
                            row.h2 > 0 ||
                            row.hr > 0)
                        return (
                          <tr
                            key={item.key}
                            style={PILOT_TABLE_DATA_ROW}
                          >
                            <td
                              className="px-1 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              <span>{item.labelJa}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[13px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.isop) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.pitch_share_pct : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.whiff_pct : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* 球場別の対戦成績（チーム別と同デザイン） */}
          {showPilotTab("situation") && (() => {
            const VENUE_ORDER = STADIUM_VENUE_UI_ROWS_BATTING
            const stadiumRows = effectiveStats.filter((r) => r.split_type === "stadium")
            const stadiumMap = new Map(stadiumRows.map((r) => [r.split_value, r]))
            const getVenueStats = (item: { display: string; dataKeys: string[] }): SeasonStatsRow | null => {
              for (const key of item.dataKeys) {
                const row = stadiumMap.get(key)
                if (row) return row
              }
              return (
                stadiumRows.find((r) =>
                  item.dataKeys.some((dk) => r.split_value.includes(dk) || dk.includes(r.split_value))
                ) ?? null
              )
            }

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  球場別の対戦成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
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
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">球場</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VENUE_ORDER.map((item) => {
                        const row = getVenueStats(item)
                        const na = "—"
                        return (
                          <tr key={item.display} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <div className="flex items-center gap-1 min-h-[1.25rem]">
                                <div className="w-1 h-4 flex-shrink-0" style={{ backgroundColor: rankingTeamStripeColor(item.teamLabel) }} />
                                <span>{formatPlayerPageStadiumDisplay(item.display)}</span>
                              </div>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? row.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* 巡目別の打撃成績（打順別と同デザイン・先発時） */}
          {showPilotTab("situation") && (() => {
            const PA_ORDER_ITEMS = [
              { key: "1", label: "1巡目" },
              { key: "2", label: "2巡目" },
              { key: "3", label: "3巡目" },
              { key: "4", label: "4巡目" },
              { key: "5", label: "5巡目～" },
            ] as const
            const getPaOrderRow = (key: string): { pa: number; ab: number; h: number; hr: number; rbi: number; so: number; bb: number; ibb: number; hbp: number; sh: number; sf: number; avg: string; obp: string; ops: string } | null => {
              const row = effectiveStats.find((r) => r.split_type === "pa_round" && r.split_value === key)
              if (!row || row.pa < 1) return null
              return {
                pa: row.pa,
                ab: row.ab,
                h: row.h,
                hr: row.hr,
                rbi: row.rbi,
                so: row.so,
                bb: row.bb,
                ibb: row.ibb,
                hbp: row.hbp,
                sh: row.sh,
                sf: row.sf,
                avg: row.avg,
                obp: row.obp,
                ops: row.ops,
              }
            }
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  巡目別の打撃成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
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
                      <col style={{ width: "61px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">打席数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PA_ORDER_ITEMS.map((item) => {
                        const row = getPaOrderRow(item.key)
                        const hasData = row != null
                        return (
                          <tr key={item.key} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{item.label}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* ホーム&ビジターの対戦成績（対左右別と同デザイン） */}
          {showPilotTab("situation") && (() => {
            const homeAwayMap = new Map(
              effectiveStats
                .filter((r) => r.split_type === "home_away")
                .map((r) => [r.split_value, r])
            )
            const getHomeAwayRow = (key: string) => homeAwayMap.get(key) ?? null

            const HOME_VISITOR_ORDER = [
              { label: "ホーム", key: "home" },
              { label: "ビジター", key: "visitor" },
            ]

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  ホーム&ビジターの対戦成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "61px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">条件</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HOME_VISITOR_ORDER.map((item) => {
                        const row = getHomeAwayRow(item.key)
                        const na = "—"
                        return (
                          <tr key={item.label} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{item.label}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? formatSlashStatDisplay(row.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? row.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row ? String(row.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* スタメン時守備位置別の打撃成績（打順別と同デザイン） */}
          {showPilotTab("situation") && (() => {
            const totalRow = effectiveStats.find((r) => r.split_type === "total" && r.split_value === "total")
            const starterFieldMap = new Map(
              effectiveStats
                .filter((r) => r.split_type === "starter_field")
                .map((r) => [r.split_value, r])
            )
            const hasStarterFieldSplits = starterFieldMap.size > 0
            const stubFieldKey = rosterPositionToFieldStubRowKey(rosterPrimaryPositionLabel)
            const POSITION_ITEMS = STARTER_FIELD_TABLE_KEYS.map((key) => ({
              key,
              label: key,
            }))
            const getPositionRow = (key: string) => {
              const derived = starterFieldMap.get(key)
              if (derived && derived.pa > 0) return derived
              if (
                !hasStarterFieldSplits &&
                stubFieldKey &&
                key === stubFieldKey &&
                totalRow &&
                totalRow.pa > 0
              ) {
                return totalRow
              }
              return null
            }
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  スタメン時守備位置別の打撃成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "64px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">守備位置</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {POSITION_ITEMS.map((item) => {
                        const row = getPositionRow(item.key)
                        const hasData = row && row.pa > 0
                        return (
                          <tr key={item.key} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{item.label}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* 打順別の打撃成績（球種別と同デザイン） */}
          {showPilotTab("situation") && (() => {
            const batOrderMap = new Map(
              effectiveStats
                .filter((r) => r.split_type === "bat_order")
                .map((r) => [r.split_value, r])
            )
            const getBatOrderRow = (n: number) => batOrderMap.get(`bat_order_${n}`) ?? null

            const BAT_ORDER_ITEMS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  打順別の打撃成績（スタメン1〜9番）
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "36px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">打順</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BAT_ORDER_ITEMS.map((n) => {
                        const row = getBatOrderRow(n)
                        const hasData = row && row.pa > 0
                        return (
                          <tr key={n} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{n}番</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* カウント別の打撃成績（打順別と同デザイン） */}
          {showPilotTab("situation") && (() => {
            const COUNT_ITEMS = [
              "0-0",
              "1-0",
              "2-0",
              "3-0",
              "0-1",
              "1-1",
              "2-1",
              "3-1",
              "0-2",
              "1-2",
              "2-2",
              "3-2",
            ] as const
            const getCountRow = (key: string) => {
              const row = effectiveStats.find((r) => r.split_type === "pitch_count" && r.split_value === key)
              if (!row || row.pa < 1) return null
              return row
            }
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  カウント別の打撃成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "54px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">条件</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COUNT_ITEMS.map((key) => {
                        const row = getCountRow(key)
                        const hasData = row != null && row.pa > 0
                        return (
                          <tr key={key} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{key}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* 状況別の打撃成績（打順別と同デザイン・ランナー別） */}
          {showPilotTab("situation") && (() => {
            const totalRow = effectiveStats.find((r) => r.split_type === "total" && r.split_value === "total")
            const byBaseState = blocks?.blocks?.F?.by_base_state ?? {}
            const totalPa = totalRow?.pa ?? 0
            const nonePa = byBaseState["無死走者なし"] ?? 0
            const RUNNER_ITEMS = [
              { key: "無し", label: "無し", matchKeys: ["無死走者なし"] },
              { key: "1塁", label: "1塁", matchKeys: [] },
              { key: "2塁", label: "2塁", matchKeys: [] },
              { key: "3塁", label: "3塁", matchKeys: [] },
              { key: "1・2塁", label: "1・2塁", matchKeys: [] },
              { key: "1・3塁", label: "1・3塁", matchKeys: [] },
              { key: "2・3塁", label: "2・3塁", matchKeys: [] },
              { key: "満塁", label: "満塁", matchKeys: [] },
              { key: "非得点圏", label: "非得点圏", matchKeys: [] },
              { key: "得点圏", label: "得点圏", matchKeys: [] },
            ] as const
            const baseSitValue = (k: string): string => {
              const map: Record<string, string> = {
                無し: "none",
                "1塁": "r1",
                "2塁": "r2",
                "3塁": "r3",
                "1・2塁": "r12",
                "1・3塁": "r13",
                "2・3塁": "r23",
                満塁: "loaded",
                得点圏: "risp",
                非得点圏: "no_risp",
              }
              return map[k] ?? ""
            }
            const getRunnerRow = (item: {
              key: string
              matchKeys: readonly string[]
            }): SeasonStatsRow | null => {
              const derived = effectiveStats.find(
                (r) => r.split_type === "base_sit" && r.split_value === baseSitValue(item.key)
              )
              if (derived && derived.pa > 0) return derived
              if (item.key === "無し" && nonePa === totalPa && totalPa > 0 && totalRow) return totalRow
              const byRispStats = blocks?.blocks?.F?.by_risp_stats
              if (item.key === "得点圏" && byRispStats?.risp) {
                const s = byRispStats.risp
                return {
                  split_type: "pilot_risp",
                  split_value: "risp",
                  split_label: "得点圏",
                  g: s.g,
                  pa: s.pa,
                  ab: s.ab,
                  r: s.r,
                  h: s.h,
                  h1: Math.max(0, s.h - s.h2 - s.h3 - s.hr),
                  h2: s.h2,
                  h3: s.h3,
                  hr: s.hr,
                  tb: s.tb,
                  rbi: s.rbi,
                  so: s.so,
                  bb: s.bb,
                  ibb: s.ibb,
                  hbp: s.hbp,
                  sh: s.sh,
                  sf: s.sf,
                  sb: s.sb,
                  cs: s.cs,
                  e: 0,
                  gidp: 0,
                  avg: s.avg,
                  obp: s.obp,
                  slg: s.slg,
                  ops: s.ops,
                  risp_avg: "",
                  risp_ab: 0,
                  risp_h: 0,
                  sb_pct: "",
                  isop: "",
                  isod: "",
                  babip: "",
                  bb_pct: "",
                  k_pct: "",
                  bbk: "",
                  gpa: "",
                  rc: "",
                  xr: "",
                  seca: "",
                  ta: "",
                  noi: "",
                }
              }
              if (item.key === "非得点圏" && byRispStats?.no_risp) {
                const s = byRispStats.no_risp
                return {
                  split_type: "pilot_no_risp",
                  split_value: "no_risp",
                  split_label: "非得点圏",
                  g: s.g,
                  pa: s.pa,
                  ab: s.ab,
                  r: s.r,
                  h: s.h,
                  h1: Math.max(0, s.h - s.h2 - s.h3 - s.hr),
                  h2: s.h2,
                  h3: s.h3,
                  hr: s.hr,
                  tb: s.tb,
                  rbi: s.rbi,
                  so: s.so,
                  bb: s.bb,
                  ibb: s.ibb,
                  hbp: s.hbp,
                  sh: s.sh,
                  sf: s.sf,
                  sb: s.sb,
                  cs: s.cs,
                  e: 0,
                  gidp: 0,
                  avg: s.avg,
                  obp: s.obp,
                  slg: s.slg,
                  ops: s.ops,
                  risp_avg: "",
                  risp_ab: 0,
                  risp_h: 0,
                  sb_pct: "",
                  isop: "",
                  isod: "",
                  babip: "",
                  bb_pct: "",
                  k_pct: "",
                  bbk: "",
                  gpa: "",
                  rc: "",
                  xr: "",
                  seca: "",
                  ta: "",
                  noi: "",
                }
              }
              return null
            }
            const na = "—"

            return (
              <>
                <h2
                  className={h2Section}
                  style={{
                    borderLeft: `6px solid ${headingStripeColor}`,
                    fontWeight: 900,
                  }}
                >
                  状況別の打撃成績
                </h2>
                <div className={`player-page-table-shell rounded overflow-x-auto overflow-y-hidden ${mbScroll}`}>
                  <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #555", width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "52px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">条件</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">OPS</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">本塁打</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打点</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">出塁率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">安打</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RUNNER_ITEMS.map((item) => {
                        const row = getRunnerRow(item)
                        const hasData = row != null && row.pa > 0
                        return (
                          <tr key={item.key} style={PILOT_TABLE_DATA_ROW}>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]" style={{ backgroundColor: "#1a1a1a" }}>
                              <span>{item.label}</span>
                            </td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.ops) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? formatSlashStatDisplay(row!.avg) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.hr) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.rbi) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? row!.obp : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.ab) : na}</td>
                            <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{hasData ? String(row!.h) : na}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>

    </div>
  )
}
