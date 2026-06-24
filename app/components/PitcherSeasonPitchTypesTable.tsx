"use client"

import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import { TOP_PAGE_BEBAS_NUMERIC_CLASS } from "@/app/components/top/topPageConstants"
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
  /** 予想投手「球」ポップオーバー向け（横スクロール・8割サイズ） */
  compactOverlay?: boolean
}

/** 球速列幅（50px × 1.15） */
const SPEED_COL_WIDTH_PX = Math.round(Math.round(45 * 1.1) * 1.15)
/** 投球割合列幅（flex 時の想定 114px × 0.8 × 0.95 × 0.95 × 0.5） */
const PCT_COL_WIDTH_PX = Math.round(114 * 0.8 * 0.95 * 0.95 * 0.5)
const OVERLAY_TABLE_SCALE = 1.2 * 0.9
const OVERLAY_TABLE_VERTICAL_SCALE = 1.1
const OVERLAY_NUMERIC_FONT_SCALE = 1.2
const OVERLAY_NUMERIC_NUDGE_DOWN_PX = 2
const OVERLAY_TABLE_NUDGE_UP_PX = 10
const OVERLAY_NARROW_COL_SCALE = 0.9
const overlayColWidth = (px: number) => Math.round(px * OVERLAY_TABLE_SCALE)

/** ツールチップ表: 球速・Whiff・被打率を9割にし、削減分を投球割合3列へ */
function overlayCompactColumnWidths() {
  const pitchTypeColWidth = overlayColWidth(88)
  const speedBase = overlayColWidth(SPEED_COL_WIDTH_PX)
  const pctBase = overlayColWidth(PCT_COL_WIDTH_PX)
  const whiffBase = overlayColWidth(56)
  const avgBase = overlayColWidth(72)
  const speedColWidth = Math.round(speedBase * OVERLAY_NARROW_COL_SCALE)
  const whiffColWidth = Math.round(whiffBase * OVERLAY_NARROW_COL_SCALE)
  const avgColWidth = Math.round(avgBase * OVERLAY_NARROW_COL_SCALE)
  const savedWidth =
    (speedBase - speedColWidth) * 2 + (whiffBase - whiffColWidth) + (avgBase - avgColWidth)
  const pctColWidth = pctBase + Math.floor(savedWidth / 3)
  return { pitchTypeColWidth, speedColWidth, pctColWidth, whiffColWidth, avgColWidth }
}

/** Yahoo 個人ページ「投球データ」形式のシーズン球種別表 */
export default function PitcherSeasonPitchTypesTable({
  rows,
  loading,
  compactOverlay = false,
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

  const wrapperClass = compactOverlay
    ? "overflow-visible mb-0 w-fit max-w-full"
    : "overflow-x-auto overflow-y-hidden mb-12"
  const cellTextClass = "text-[14px]"
  const numericCellClass = compactOverlay
    ? `px-0.5 pb-1 text-center ${TOP_PAGE_BEBAS_NUMERIC_CLASS} border-l border-b border-gray-500`
    : `px-0.5 py-1 text-center latin font-black tabular-nums ${cellTextClass} border-l border-b border-gray-500`
  const numericCellStyle = compactOverlay
    ? {
        fontSize: `calc(14px * ${OVERLAY_NUMERIC_FONT_SCALE})`,
        paddingTop: `calc(0.25rem + ${OVERLAY_NUMERIC_NUDGE_DOWN_PX}px)`,
      }
    : undefined
  const headerMainClass = "text-[10px]"
  const headerSubClass = "text-[9px]"
  const overlayCols = compactOverlay ? overlayCompactColumnWidths() : null
  const pitchTypeColWidth = overlayCols?.pitchTypeColWidth ?? 88
  const speedColWidth = overlayCols?.speedColWidth ?? SPEED_COL_WIDTH_PX
  const pctColWidth = overlayCols?.pctColWidth ?? PCT_COL_WIDTH_PX
  const whiffColWidth = overlayCols?.whiffColWidth ?? 56
  const avgColWidth = overlayCols?.avgColWidth ?? 72
  const pitchTypeStickyClass = compactOverlay
    ? ""
    : "sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
  const tableStyle = compactOverlay
    ? {
        fontVariantNumeric: "tabular-nums" as const,
        borderCollapse: "separate" as const,
        borderSpacing: 0,
        border: "1px solid #555",
        width: "max-content",
        tableLayout: "fixed" as const,
      }
    : {
        fontVariantNumeric: "tabular-nums" as const,
        borderCollapse: "separate" as const,
        borderSpacing: 0,
        border: "1px solid #555",
        width: "100%",
        tableLayout: "fixed" as const,
      }

  const table = (
    <table className="text-xs relative z-0" style={tableStyle}>
      <colgroup>
        <col style={{ width: `${pitchTypeColWidth}px` }} />
        <col style={{ width: `${speedColWidth}px` }} />
        <col style={{ width: `${speedColWidth}px` }} />
        <col style={{ width: `${pctColWidth}px` }} />
        <col style={{ width: `${pctColWidth}px` }} />
        <col style={{ width: `${pctColWidth}px` }} />
        <col style={{ width: `${whiffColWidth}px` }} />
        <col style={{ width: `${avgColWidth}px` }} />
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
          <th
            rowSpan={2}
            className={`px-1 py-1 text-center font-bold ${headerMainClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 bg-[#FFFF44] ${pitchTypeStickyClass}`}
          >
            球種
          </th>
          <th
            colSpan={2}
            className={`px-0.5 py-1 text-center font-bold ${headerMainClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}
          >
            球速(km/h)
          </th>
          <th
            colSpan={3}
            className={`px-0.5 py-1 text-center font-bold ${headerMainClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}
          >
            投球割合
          </th>
          <th
            rowSpan={2}
            className={`px-0.5 py-1 text-center font-bold ${headerMainClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}
          >
            Whiff%
          </th>
          <th
            rowSpan={2}
            className={`px-0.5 py-1 text-center font-bold ${headerMainClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}
          >
            被打率
            <br />
            <span className={`font-normal ${headerSubClass}`}>(被本塁打)</span>
          </th>
        </tr>
        <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
          <th className={`px-0.5 py-0.5 text-center font-bold ${headerSubClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}>
            最高
          </th>
          <th className={`px-0.5 py-0.5 text-center font-bold ${headerSubClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}>
            平均
          </th>
          <th className={`px-0.5 py-0.5 text-center font-bold ${headerSubClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}>
            全体
          </th>
          <th className={`px-0.5 py-0.5 text-center font-bold ${headerSubClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}>
            対左
          </th>
          <th className={`px-0.5 py-0.5 text-center font-bold ${headerSubClass} latin tabular-nums whitespace-nowrap border-l border-b border-gray-500`}>
            対右
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.pitch_type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
            <td
              className={`px-1 py-1 text-left latin font-black tabular-nums ${cellTextClass} border-l border-b border-gray-500 first:border-l-0 whitespace-nowrap ${pitchTypeStickyClass}`}
              style={{ backgroundColor: "#1a1a1a" }}
            >
              {row.pitch_type}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {fmtSpeed(row.max_speed_kmh)}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {fmtSpeed(row.avg_speed_kmh)}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {fmtPct(row.pct)}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {fmtPct(row.pct_vs_left)}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {fmtPct(row.pct_vs_right)}
            </td>
            <td className={numericCellClass} style={numericCellStyle}>
              {row.whiff_pct}
            </td>
            <td className={`${numericCellClass} whitespace-nowrap`} style={numericCellStyle}>
              {fmtAvgHr(row)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div
      className={wrapperClass}
      style={
        compactOverlay
          ? {
              transform: `scaleY(${OVERLAY_TABLE_VERTICAL_SCALE})`,
              transformOrigin: "top center",
              marginTop: `-${OVERLAY_TABLE_NUDGE_UP_PX}px`,
            }
          : undefined
      }
    >
      {table}
    </div>
  )
}
