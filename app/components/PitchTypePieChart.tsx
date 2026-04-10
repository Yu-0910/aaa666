"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

type Row = {
  pitch_type: string
  pitches: number
  pct: number
}

type Props = {
  rows: Row[]
}

const FONT_FAMILY = '"Inter", sans-serif'

const COLORS = [
  "#FF4444",
  "#FFFF44",
  "#44CC88",
  "#4488FF",
  "#CC88FF",
  "#88DDFF",
  "#FFAA44",
  "#88FF88",
]

const RADIAN = Math.PI / 180

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(-angle * RADIAN) * radius,
    y: cy + Math.sin(-angle * RADIAN) * radius,
  }
}

/** 円グラフの各セクション内に数値を表示 */
function renderInnerLabel(props: {
  cx?: number
  cy?: number
  midAngle?: number
  outerRadius?: number
  value?: number
}) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 100, value = 0 } = props
  const pos = polarToCartesian(cx, cy, outerRadius * 0.6, midAngle)
  return (
    <text
      x={pos.x}
      y={pos.y}
      textAnchor="middle"
      alignmentBaseline="middle"
      fill="#000"
      style={{ fontFamily: FONT_FAMILY, fontVariantNumeric: "tabular-nums" }}
      className="recharts-pie-label-text text-xs font-bold"
    >
      {`${Math.floor(value)}%`}
    </text>
  )
}

export default function PitchTypePieChart({ rows }: Props) {
  const data = rows.map((r) => ({ name: r.pitch_type, value: r.pct }))

  return (
    <div
      className="mt-2 mb-4 flex justify-center latin"
      style={{ minHeight: "280px", fontFamily: FONT_FAMILY }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={renderInnerLabel}
            labelLine={false}
          >
            {rows.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
                stroke="#1a1a1a"
                strokeWidth={1}
              />
            ))}
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
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: "8px", fontFamily: FONT_FAMILY }}
            formatter={(value) => (
              <span className="text-sm text-gray-300 latin">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
