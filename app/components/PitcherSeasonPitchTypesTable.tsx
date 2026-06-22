"use client"

import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import type { PitcherSeasonPitchTypeRow } from "@/lib/yahooGame/pitcherSeasonPitchTypes"

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(1)}%`
}

function fmtSpeed(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toFixed(1)
}

function fmtAvgHr(row: PitcherSeasonPitchTypeRow): string {
  const avg = formatSlashStatDisplay(row.avg)
  if (avg === "—") return "—"
  return `${avg} (${row.hr})`
}

type Props = {
  rows: PitcherSeasonPitchTypeRow[]
  loading?: boolean
}

/** 球速列幅（50px × 1.15） */
const SPEED_COL_WIDTH_PX = Math.round(Math.round(45 * 1.1) * 1.15)
/** 投球割合列幅（flex 時の想定 114px × 0.8 × 0.95 × 0.95 × 0.5） */
const PCT_COL_WIDTH_PX = Math.round(114 * 0.8 * 0.95 * 0.95 * 0.5)

/** Yahoo 個人ページ「投球データ」形式のシーズン球種別表 */
export default function PitcherSeasonPitchTypesTable({
  rows,
  loading,
}: Props) {
  if (loading) {
    return <p className="text-sm text-gray-400 mb-8">投球データを読み込み中…</p>
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-gray-400 mb-8">
        シーズン通算の球種データがありません（canonical に pitchEvents が必要です）。
      </p>
    )
  }

  return (
      <div className="overflow-x-auto overflow-y-hidden mb-12">
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
            <col style={{ width: "88px" }} />
            <col style={{ width: `${SPEED_COL_WIDTH_PX}px` }} />
            <col style={{ width: `${SPEED_COL_WIDTH_PX}px` }} />
            <col style={{ width: `${PCT_COL_WIDTH_PX}px` }} />
            <col style={{ width: `${PCT_COL_WIDTH_PX}px` }} />
            <col style={{ width: `${PCT_COL_WIDTH_PX}px` }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "72px" }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              <th
                rowSpan={2}
                className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
              >
                球種
              </th>
              <th
                colSpan={2}
                className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500"
              >
                球速(km/h)
              </th>
              <th
                colSpan={3}
                className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500"
              >
                投球割合
              </th>
              <th
                rowSpan={2}
                className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500"
              >
                Whiff%
              </th>
              <th
                rowSpan={2}
                className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500"
              >
                被打率
                <br />
                <span className="font-normal text-[9px]">(被本塁打)</span>
              </th>
            </tr>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              <th className="px-0.5 py-0.5 text-center font-bold text-[9px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                最高
              </th>
              <th className="px-0.5 py-0.5 text-center font-bold text-[9px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                平均
              </th>
              <th className="px-0.5 py-0.5 text-center font-bold text-[9px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                全体
              </th>
              <th className="px-0.5 py-0.5 text-center font-bold text-[9px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                対左
              </th>
              <th className="px-0.5 py-0.5 text-center font-bold text-[9px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                対右
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pitch_type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <td
                  className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                  style={{ backgroundColor: "#1a1a1a" }}
                >
                  {row.pitch_type}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {fmtSpeed(row.max_speed_kmh)}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {fmtSpeed(row.avg_speed_kmh)}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {fmtPct(row.pct)}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {fmtPct(row.pct_vs_left)}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {fmtPct(row.pct_vs_right)}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                  {row.whiff_pct}
                </td>
                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 whitespace-nowrap">
                  {fmtAvgHr(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  )
}
