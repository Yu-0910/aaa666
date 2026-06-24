"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

type Row = {
  pitch_type: string
  pitches: number
  pct: number
}

export type PitchTypeDonutCenterStats = {
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
  "#FF4444",
  "#FFFF44",
  "#44CC88",
  "#4488FF",
  "#CC88FF",
  "#88DDFF",
  "#FFAA44",
  "#88FF88",
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

function donutTitleStyle(compact: boolean): React.CSSProperties {
  const baseFont = compact ? TITLE_FONT_PX.compact : TITLE_FONT_PX.full
  const fontSize = Math.round(baseFont * TITLE_SCALE)
  const padY = Math.max(1, Math.round(2 * TITLE_SCALE))
  const padX = Math.max(4, Math.round(8 * TITLE_SCALE))
  return {
    fontSize: `${fontSize}px`,
    padding: `${padY}px ${padX}px`,
    backgroundColor: "#FFFF44",
    borderRadius: "2px",
    letterSpacing: "0.04em",
  }
}

/** 球種％ラベル（ドーナツ・巡目別横棒など共通） */
export function pitchTypePctLabelStyle(compact = true): React.CSSProperties {
  const fontSize = Math.round(chartPx(compact, 12, 13.5) * PCT_LABEL_SCALE)
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
function renderDonutPctLabel(compact: boolean) {
  const labelStyle = pitchTypePctLabelStyle(compact)
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

function donutCenterValueStyle(compact: boolean): React.CSSProperties {
  return {
    marginTop: chartPx(compact, 2, 3),
    fontSize: `${chartPx(compact, 15, 17)}px`,
    fontFamily: BEBAS,
    letterSpacing: "0.03em",
  }
}

function DonutCenterPanel({
  centerStats,
  innerRadius,
  compact,
}: {
  centerStats?: PitchTypeDonutCenterStats
  innerRadius: number
  compact: boolean
}) {
  const hasStats = Boolean(centerStats?.avgAgainst || centerStats?.kBbPct)
  if (!hasStats) return null

  const valueStyle = donutCenterValueStyle(compact)
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
              padding: compact ? `0 ${chartPx(true, 6, 8)}px` : `0 ${chartPx(false, 6, 8)}px`,
              gap: chartPx(compact, 3, 4),
            }}
          >
            {centerStats?.avgAgainst ? (
              <div className="text-center">
                <div
                  className="font-noto text-[#9ca3af] leading-none"
                  style={{ fontSize: `${chartPx(compact, 7, 8)}px`, fontWeight: 700 }}
                >
                  被打率
                </div>
                <div className="tabular-nums leading-none text-white" style={valueStyle}>
                  {centerStats.avgAgainst}
                </div>
              </div>
            ) : null}

            {centerStats?.avgAgainst && centerStats?.kBbPct ? (
              <div
                className="mx-auto w-[70%]"
                style={{
                  height: 1,
                  background:
                    "linear-gradient(90deg, transparent, #555 20%, #555 80%, transparent)",
                }}
              />
            ) : null}

            {centerStats?.kBbPct ? (
              <div className="text-center">
                <div
                  className="font-noto text-[#9ca3af] leading-none"
                  style={{ fontSize: `${chartPx(compact, 7, 8)}px`, fontWeight: 700 }}
                >
                  K-BB%
                </div>
                <div className="tabular-nums leading-none text-white" style={valueStyle}>
                  {centerStats.kBbPct}
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
}: {
  pitchType: string
  colorOrder: string[]
}) {
  const ci = colorIndexForPitchType(pitchType, colorOrder)
  return (
    <span
      className="inline-flex items-center gap-1.5 text-gray-300"
      style={{ fontSize: "0.7rem" }}
    >
      <span
        className="inline-block h-3 w-3 shrink-0 border border-[#1a1a1a]"
        style={{ backgroundColor: COLORS[ci % COLORS.length] }}
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
}: {
  pitchTypes: string[]
  pitchTypeColorOrder?: string[]
  className?: string
}) {
  const colorOrder = pitchTypeColorOrder ?? pitchTypes
  if (!pitchTypes.length) return null
  const firstRow = pitchTypes.slice(0, LEGEND_FIRST_ROW_MAX)
  const secondRow = pitchTypes.slice(LEGEND_FIRST_ROW_MAX)
  const rowClass = "flex flex-wrap justify-center gap-x-4 gap-y-2"
  return (
    <div
      className={`flex flex-col items-center gap-y-2 latin ${className}`}
      style={{ fontFamily: FONT_FAMILY }}
    >
      <div className={rowClass}>
        {firstRow.map((pt) => (
          <PitchTypeChartLegendItem key={pt} pitchType={pt} colorOrder={colorOrder} />
        ))}
      </div>
      {secondRow.length > 0 ? (
        <div className={rowClass}>
          {secondRow.map((pt) => (
            <PitchTypeChartLegendItem key={pt} pitchType={pt} colorOrder={colorOrder} />
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
  isAnimationActive = true,
}: Props) {
  const chartRows = [...rows].sort((a, b) => b.pct - a.pct)
  const data = chartRows.map((r) => ({ name: r.pitch_type, value: r.pct }))
  const colorOrder =
    pitchTypeColorOrder ?? rows.map((r) => r.pitch_type)
  const chartHeight = chartPx(compact, 200, 260)
  const outerRadius = chartPx(compact, 72, 96)
  const innerRadius = Math.round(outerRadius * (centerStats ? 0.54 : 0.48))

  if (!data.length) return null

  return (
    <div
      className={`flex flex-col items-center latin ${compact ? "flex-1 min-w-0" : "mt-2 mb-4"}`}
      style={{ fontFamily: FONT_FAMILY }}
    >
      {title ? (
        <div
          className="mb-1 text-center font-black leading-none text-black"
          style={donutTitleStyle(compact)}
        >
          {title}
        </div>
      ) : null}
      <div className="relative w-full flex justify-center" style={{ height: chartHeight }}>
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
            label={renderDonutPctLabel(compact)}
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
      />
      </div>
    </div>
  )
}
