"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

type Row = {
  pitch_type: string
  pitches: number
  pct: number
}

export type PitchTypeDonutCenterStats = {
  primaryLabel?: string
  primaryValue?: string
  secondaryLabel?: string
  secondaryValue?: string
  avgAgainst?: string
  kBbPct?: string
}

type Props = {
  rows: Row[]
  /** 見出し（例: 対左 / 対右） */
  title?: string
  /** ドーナツ中央の被打率・K-BB% */
  centerStats?: PitchTypeDonutCenterStats
  /** 複数グラフで球種色を揃えるときの球種順（省略時は rows の並び） */
  pitchTypeColorOrder?: string[]
  /** 横並び用のコンパクト表示 */
  compact?: boolean
  /** 表示倍率（1＝基準）。球ツールチップ等で全体を縮小 */
  sizeScale?: number
  /** 被打率・K-BB% ラベル／数値の表示倍率（1＝基準） */
  labelScale?: number
  /** Recharts の描画アニメーション */
  isAnimationActive?: boolean
}

const FONT_FAMILY = '"Inter", sans-serif'
/** ドーナツグラフ全体の表示スケール */
const CHART_SCALE = 1.25

function chartPx(compact: boolean, compactPx: number, fullPx: number): number {
  return Math.round((compact ? compactPx : fullPx) * CHART_SCALE)
}

export const PITCH_TYPE_CHART_COLORS = [
  "#E03E4C",
  "#E0A70A",
  "#28BB65",
  "#3472D8",
  "#944BD9",
  "#1EBAD1",
  "#E08C17",
  "#41C371",
] as const

const COLORS = PITCH_TYPE_CHART_COLORS

const RADIAN = Math.PI / 180
const BEBAS = 'var(--font-bebas-neue), "Bebas Neue", sans-serif'

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(-angle * RADIAN) * radius,
    y: cy + Math.sin(-angle * RADIAN) * radius,
  }
}

/** ドーナツ各セクション内の％ラベル倍率（chartPx 後に適用） */
const PCT_LABEL_SCALE = 1.15
/** この割合以下のセクションには％ラベルを表示しない */
const PCT_LABEL_MIN = 3
/** ドーナツの配置起点（0時方向＝グラフ上部）・時計回り */
const PIE_START_ANGLE = 90
const PIE_END_ANGLE = PIE_START_ANGLE - 360
/**
 * 対左・対右見出し（CHART_SCALE とは独立）。
 * compact 時 1.0 ≒ 11px。0.1 刻みだと丸めで数 px しか変わらないことがある。
 */
const TITLE_FONT_PX = { compact: 11, full: 13 } as const
const TITLE_SCALE = 1.6

function donutTitleStyle(compact: boolean, sizeScale = 1): React.CSSProperties {
  const baseFont = compact ? TITLE_FONT_PX.compact : TITLE_FONT_PX.full
  const fontSize = Math.round(baseFont * TITLE_SCALE * sizeScale)
  const padY = Math.max(1, Math.round(2 * TITLE_SCALE * sizeScale))
  const padX = Math.max(4, Math.round(8 * TITLE_SCALE * sizeScale))
  return {
    fontSize: `${fontSize}px`,
    padding: `${padY}px ${padX}px`,
    backgroundColor: "#FFFF44",
    borderRadius: "2px",
    letterSpacing: "0.04em",
  }
}

/** 球種％ラベル（ドーナツ・巡目別横棒など共通） */
export function pitchTypePctLabelStyle(compact = true, textScale = 1): React.CSSProperties {
  const fontSize = Math.round(chartPx(compact, 12, 13.5) * PCT_LABEL_SCALE * textScale)
  return {
    fontFamily: BEBAS,
    fontVariantNumeric: "tabular-nums",
    fontSize,
    fontWeight: 400,
    letterSpacing: "0.03em",
    color: "#000",
  }
}

/** ドーナツ各セクション内の％（従来 text-xs より小さく） */
function renderDonutPctLabel(compact: boolean, textScale = 1) {
  const labelStyle = pitchTypePctLabelStyle(compact, textScale)
  return function render(props: {
    cx?: number
    cy?: number
    midAngle?: number
    innerRadius?: number
    outerRadius?: number
    value?: number
  }) {
    const {
      cx = 0,
      cy = 0,
      midAngle = 0,
      innerRadius = 0,
      outerRadius = 100,
      value = 0,
    } = props
    if (value <= PCT_LABEL_MIN) return null
    const labelRadius = innerRadius + (outerRadius - innerRadius) * 0.5
    const pos = polarToCartesian(cx, cy, labelRadius, midAngle)
    return (
      <text
        x={pos.x}
        y={pos.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#000"
        style={labelStyle}
      >
        {`${Math.floor(value)}%`}
      </text>
    )
  }
}

function donutCenterValueStyle(compact: boolean, labelScale = 1): React.CSSProperties {
  return {
    marginTop: Math.round(chartPx(compact, 2, 3) * labelScale),
    fontSize: `${Math.round(chartPx(compact, 15, 17) * labelScale)}px`,
    fontFamily: BEBAS,
    letterSpacing: "0.03em",
  }
}

function DonutCenterPanel({
  centerStats,
  innerRadius,
  compact,
  labelScale = 1,
}: {
  centerStats?: PitchTypeDonutCenterStats
  innerRadius: number
  compact: boolean
  labelScale?: number
}) {
  const primaryLabel = centerStats?.primaryLabel ?? (centerStats?.avgAgainst ? "被打率" : undefined)
  const primaryValue = centerStats?.primaryValue ?? centerStats?.avgAgainst
  const secondaryLabel = centerStats?.secondaryLabel ?? (centerStats?.kBbPct ? "K-BB%" : undefined)
  const secondaryValue = centerStats?.secondaryValue ?? centerStats?.kBbPct
  const hasStats = Boolean(primaryValue || secondaryValue)
  if (!hasStats) return null

  const valueStyle = donutCenterValueStyle(compact, labelScale)
  const labelFontPx = Math.max(6, Math.round(chartPx(compact, 7, 8) * labelScale))
  const avgAgainstNudgePx = Math.round(chartPx(compact, 2, 3) * labelScale)
  const discSize = Math.round(innerRadius * (compact ? 1.75 : 1.85))

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <div
        className="flex flex-col items-center justify-center rounded-full border border-[#555] bg-[#0a0a0a]"
        style={{
          width: discSize,
          height: discSize,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {hasStats ? (
          <div
            className="flex w-full flex-col items-stretch"
            style={{
              padding: compact
                ? `0 ${Math.round(chartPx(true, 6, 8) * labelScale)}px`
                : `0 ${Math.round(chartPx(false, 6, 8) * labelScale)}px`,
              gap: Math.round(chartPx(compact, 3, 4) * labelScale),
            }}
          >
            {primaryValue ? (
              <div className="text-center" style={{ marginTop: avgAgainstNudgePx }}>
                <div
                  className="font-noto text-[#9ca3af] leading-none"
                  style={{ fontSize: `${labelFontPx}px`, fontWeight: 700 }}
                >
                  {primaryLabel}
                </div>
                <div className="tabular-nums leading-none text-white" style={valueStyle}>
                  {primaryValue}
                </div>
              </div>
            ) : null}

            {primaryValue && secondaryValue ? (
              <div
                className="mx-auto w-[70%]"
                style={{
                  height: 1,
                  background:
                    "linear-gradient(90deg, transparent, #555 20%, #555 80%, transparent)",
                }}
              />
            ) : null}

            {secondaryValue ? (
              <div className="text-center">
                <div
                  className="font-noto text-[#9ca3af] leading-none"
                  style={{ fontSize: `${labelFontPx}px`, fontWeight: 700 }}
                >
                  {secondaryLabel}
                </div>
                <div className="tabular-nums leading-none text-white" style={valueStyle}>
                  {secondaryValue}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function colorIndexForPitchType(
  pitchType: string,
  order: string[],
): number {
  const i = order.indexOf(pitchType)
  return i >= 0 ? i : order.length
}

/** 凡例1行目の最大球種数（6球種目以降は2行目） */
const LEGEND_FIRST_ROW_MAX = 5

function PitchTypeChartLegendItem({
  pitchType,
  colorOrder,
  scale = 1,
}: {
  pitchType: string
  colorOrder: string[]
  scale?: number
}) {
  const ci = colorIndexForPitchType(pitchType, colorOrder)
  const fontPx = Math.max(8, Math.round(11.2 * scale))
  const swatchPx = Math.max(8, Math.round(12 * scale))
  return (
    <span
      className="inline-flex items-center text-gray-300"
      style={{ fontSize: `${fontPx}px`, gap: `${Math.round(6 * scale)}px` }}
    >
      <span
        className="inline-block shrink-0 border border-[#1a1a1a]"
        style={{
          width: swatchPx,
          height: swatchPx,
          backgroundColor: COLORS[ci % COLORS.length],
        }}
        aria-hidden
      />
      {pitchType}
    </span>
  )
}

/** 球種と色の対応（投球データの対左右グラフ下など） */
export function PitchTypeChartLegend({
  pitchTypes,
  pitchTypeColorOrder,
  className = "mb-4",
  scale = 1,
}: {
  pitchTypes: string[]
  pitchTypeColorOrder?: string[]
  className?: string
  /** 親コンテナ幅に応じた表示倍率（1＝基準） */
  scale?: number
}) {
  const colorOrder = pitchTypeColorOrder ?? pitchTypes
  if (!pitchTypes.length) return null
  const firstRow = pitchTypes.slice(0, LEGEND_FIRST_ROW_MAX)
  const secondRow = pitchTypes.slice(LEGEND_FIRST_ROW_MAX)
  const rowGapX = Math.round(16 * scale)
  const rowGapY = Math.round(8 * scale)
  const rowStyle = { gap: `${rowGapY}px ${rowGapX}px` }
  const sectionGap = Math.round(8 * scale)
  return (
    <div
      className={`flex flex-col items-center latin ${className}`}
      style={{ fontFamily: FONT_FAMILY, gap: `${sectionGap}px` }}
    >
      <div className="flex flex-wrap justify-center" style={rowStyle}>
        {firstRow.map((pt) => (
          <PitchTypeChartLegendItem key={pt} pitchType={pt} colorOrder={colorOrder} scale={scale} />
        ))}
      </div>
      {secondRow.length > 0 ? (
        <div className="flex flex-wrap justify-center" style={rowStyle}>
          {secondRow.map((pt) => (
            <PitchTypeChartLegendItem key={pt} pitchType={pt} colorOrder={colorOrder} scale={scale} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function PitchTypePieChart({
  rows,
  title,
  centerStats,
  pitchTypeColorOrder,
  compact = false,
  sizeScale = 1,
  labelScale = 1,
  isAnimationActive = true,
}: Props) {
  const chartBoxRef = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useLayoutEffect(() => {
    if (!compact) return
    const el = chartBoxRef.current
    if (!el) return
    const update = () => setBoxWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  const chartRows = [...rows].sort((a, b) => b.pct - a.pct)
  const data = chartRows.map((r) => ({ name: r.pitch_type, value: r.pct }))
  const colorOrder =
    pitchTypeColorOrder ?? rows.map((r) => r.pitch_type)
  const designHeight = Math.round(chartPx(compact, 200, 260) * sizeScale)
  const designOuter = Math.round(chartPx(compact, 72, 96) * sizeScale)
  const chartSide =
    compact && boxWidth > 0 ? boxWidth : designHeight
  const chartHeight = compact ? chartSide : designHeight
  const outerRadius =
    compact && chartSide > 0
      ? Math.floor(chartSide * 0.4)
      : designOuter
  const innerRadius = Math.round(outerRadius * (centerStats ? 0.54 : 0.48))
  const chartFitScale =
    compact && designHeight > 0 && chartSide > 0 ? chartSide / designHeight : 1
  const insideTextScale = labelScale * chartFitScale

  if (!data.length) return null

  return (
    <div
      className={`flex flex-col items-center latin ${compact ? "flex-1 min-w-0" : "mt-2 mb-4"}`}
      style={{ fontFamily: FONT_FAMILY }}
    >
      {title ? (
        <div
          className="mb-1 text-center font-black leading-none text-black"
          style={donutTitleStyle(compact, sizeScale)}
        >
          {title}
        </div>
      ) : null}
      <div
        ref={chartBoxRef}
        className="relative flex w-full justify-center"
        style={{ height: chartHeight, aspectRatio: compact ? "1 / 1" : undefined }}
      >
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={PIE_START_ANGLE}
            endAngle={PIE_END_ANGLE}
            clockwise
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={renderDonutPctLabel(compact, insideTextScale)}
            labelLine={false}
            isAnimationActive={isAnimationActive}
          >
            {chartRows.map((row) => {
              const ci = colorIndexForPitchType(row.pitch_type, colorOrder)
              return (
              <Cell
                key={row.pitch_type}
                fill={COLORS[ci % COLORS.length]}
                stroke="#1a1a1a"
                strokeWidth={1}
              />
            )})}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${Math.floor(value)}%`, "割合"]}
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #555",
              borderRadius: "4px",
              color: "#e5e5e5",
              fontFamily: FONT_FAMILY,
            }}
            labelStyle={{ color: "#FFFF44", fontFamily: FONT_FAMILY }}
          />
          {!compact ? (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: "8px", fontFamily: FONT_FAMILY }}
              formatter={(value) => (
                <span className="text-sm text-gray-300 latin">{value}</span>
              )}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
      <DonutCenterPanel
        centerStats={centerStats}
        innerRadius={innerRadius}
        compact={compact}
        labelScale={insideTextScale}
      />
      </div>
    </div>
  )
}
