"use client"

import { useMemo } from "react"
import type { CSSProperties } from "react"
import {
  BATTING_STAT_COLUMNS,
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  type CareerColumnDef,
  type CareerDisplayRow,
} from "@/lib/playerCareerMergedDisplay"

const BASE_CONTENT_SCALE = 0.7
const FONT_SIZE_SCALE = 1.15
const METRIC_VALUE_CLASS = "bebas tabular-nums font-normal tracking-[-0.01em] text-white"
const TOTAL_ROW_BORDER_TOP = "2px solid #ffff44"

function buildCareerRankingTableMetrics(scaleMultiplier: number) {
  const CONTENT_SCALE = BASE_CONTENT_SCALE * scaleMultiplier
  const s = (px: number) => Math.round(px * CONTENT_SCALE * 10) / 10
  const sf = (px: number) => Math.round(px * FONT_SIZE_SCALE * 10) / 10

  const YEAR_WIDTH = s(48)
  const AGE_WIDTH = s(40)
  const FRAME_WIDTH = Math.max(1, Math.round(s(2)))
  const METRIC_COL_WIDTH = s(54)
  const SALARY_COL_WIDTH = s(66)
  const LEFT_BLOCK_WIDTH = YEAR_WIDTH + FRAME_WIDTH + AGE_WIDTH
  const FONT_HEADER = s(10)
  const FONT_METRIC = sf(s(16.83))
  const FONT_YEAR_AGE = sf(s(18))
  const FONT_YEAR_TOTAL = sf(s(14))
  const PAD_HEADER_X = s(8)
  const PAD_HEADER_Y = s(12)
  const ROW_MIN_H = s(32)
  const YEAR_AGE_NUDGE_Y = s(1.5)
  const METRIC_VALUE_NUDGE_Y = Math.round(2 * scaleMultiplier * 10) / 10

  const headerLabelStyle: CSSProperties = {
    fontSize: FONT_HEADER,
    paddingLeft: PAD_HEADER_X,
    paddingRight: PAD_HEADER_X,
    paddingTop: PAD_HEADER_Y,
    paddingBottom: PAD_HEADER_Y,
    lineHeight: 1.2,
  }

  const yearAgeValueStyle: CSSProperties = {
    fontSize: FONT_YEAR_AGE,
    lineHeight: 1,
    margin: 0,
  }

  const totalLabelStyle: CSSProperties = {
    fontSize: FONT_YEAR_TOTAL,
    lineHeight: 1,
    margin: 0,
  }

  const metricValueStyle: CSSProperties = {
    fontSize: FONT_METRIC,
    lineHeight: 1,
    margin: 0,
  }

  const cellCenterBox: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: ROW_MIN_H,
    boxSizing: "border-box",
  }

  const bodyTdStyle: CSSProperties = {
    height: ROW_MIN_H,
    padding: 0,
    verticalAlign: "middle",
  }

  return {
    YEAR_WIDTH,
    AGE_WIDTH,
    FRAME_WIDTH,
    METRIC_COL_WIDTH,
    SALARY_COL_WIDTH,
    LEFT_BLOCK_WIDTH,
    ROW_MIN_H,
    YEAR_AGE_NUDGE_Y,
    METRIC_VALUE_NUDGE_Y,
    headerLabelStyle,
    yearAgeValueStyle,
    totalLabelStyle,
    metricValueStyle,
    cellCenterBox,
    bodyTdStyle,
  }
}

type Props = {
  rows: CareerDisplayRow[]
  birthRaw: string
  /** 省略時は打撃36指標（通算の打撃成績と同一） */
  columns?: CareerColumnDef[]
  rowKeyPrefix?: string
  /** 2026名簿外は年俸列を非表示 */
  showSalaryColumn?: boolean
  /** 表・文字・数値の一括スケール（既定 1） */
  scaleMultiplier?: number
}

function rowBg(idx: number, isTotal: boolean): string {
  if (isTotal) return "#333333"
  return idx % 2 === 0 ? "#292929" : "#1f1f1f"
}

export default function CareerBattingTableRankingStyle({
  rows,
  birthRaw,
  columns = BATTING_STAT_COLUMNS,
  rowKeyPrefix = "career-bat",
  showSalaryColumn = true,
  scaleMultiplier = 1,
}: Props) {
  const m = useMemo(
    () => buildCareerRankingTableMetrics(scaleMultiplier),
    [scaleMultiplier],
  )

  const tableMinWidthPx =
    m.LEFT_BLOCK_WIDTH +
    columns.length * m.METRIC_COL_WIDTH +
    (showSalaryColumn ? m.SALARY_COL_WIDTH : 0)

  return (
    <div className="mb-4 bg-[#1a1a1a] border border-[#333]">
      <div
        className="overflow-x-auto overscroll-x-contain touch-pan-x max-w-full"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <table
          className="border-collapse border-spacing-0 max-w-none"
          style={{
            tableLayout: "fixed",
            width: `${tableMinWidthPx}px`,
            minWidth: `${tableMinWidthPx}px`,
          }}
        >
          <colgroup>
            <col style={{ width: `${m.LEFT_BLOCK_WIDTH}px` }} />
            {columns.map((col) => (
              <col key={col.key} style={{ width: `${m.METRIC_COL_WIDTH}px` }} />
            ))}
            {showSalaryColumn ? <col style={{ width: `${m.SALARY_COL_WIDTH}px` }} /> : null}
          </colgroup>
          <thead>
            <tr className="bg-[#2a2a2a]">
              <th
                className="sticky border-r-2 border-[#555] p-0"
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 100,
                  width: m.LEFT_BLOCK_WIDTH,
                  maxWidth: m.LEFT_BLOCK_WIDTH,
                }}
              >
                <div className="flex flex-nowrap items-stretch" style={{ width: m.LEFT_BLOCK_WIDTH }}>
                  <div
                    className="font-bold bg-[#ffff44] text-black flex-shrink-0 text-center"
                    style={{ width: m.YEAR_WIDTH, boxSizing: "border-box", ...m.headerLabelStyle }}
                  >
                    年度
                  </div>
                  <div className="flex-shrink-0 bg-[#555]" style={{ width: m.FRAME_WIDTH }} aria-hidden />
                  <div
                    className="font-bold bg-[#ffff44] text-black flex-shrink-0 text-center"
                    style={{ width: m.AGE_WIDTH, boxSizing: "border-box", ...m.headerLabelStyle }}
                  >
                    年齢
                  </div>
                </div>
              </th>
              {columns.map((col, metricIdx) => (
                <th
                  key={col.key}
                  className={`font-bold border-r border-[#333] bg-[#ffff44] text-black text-center ${metricIdx === 0 ? "pl-0 -ml-[2px]" : ""}`}
                  style={{
                    width: m.METRIC_COL_WIDTH,
                    minWidth: m.METRIC_COL_WIDTH,
                    ...m.headerLabelStyle,
                  }}
                >
                  {col.label}
                </th>
              ))}
              {showSalaryColumn ? (
                <th
                  className="font-bold border-r border-[#333] bg-[#ffff44] text-black text-center whitespace-nowrap"
                  style={{
                    width: m.SALARY_COL_WIDTH,
                    minWidth: m.SALARY_COL_WIDTH,
                    ...m.headerLabelStyle,
                    whiteSpace: "nowrap",
                  }}
                >
                  年俸（万）
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((stat, idx) => {
              const isTotal = Boolean(stat.is_total) || stat.year === "通算"
              const bg = rowBg(idx, isTotal)
              const totalRowTop = isTotal ? { borderTop: TOTAL_ROW_BORDER_TOP } : undefined
              return (
                <tr
                  key={`${rowKeyPrefix}-${idx}`}
                  className="border-b border-[#333] hover:bg-[#2a2a2a] transition-colors"
                  style={{ backgroundColor: bg, height: m.ROW_MIN_H }}
                >
                  <td
                    className="sticky border-r-2 border-[#555] p-0"
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 40,
                      width: m.LEFT_BLOCK_WIDTH,
                      maxWidth: m.LEFT_BLOCK_WIDTH,
                      backgroundColor: bg,
                      ...m.bodyTdStyle,
                      ...totalRowTop,
                    }}
                  >
                    {isTotal ? (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: m.LEFT_BLOCK_WIDTH,
                          height: m.ROW_MIN_H,
                          backgroundColor: bg,
                          boxSizing: "border-box",
                        }}
                      >
                        <span
                          className="bebas tabular-nums tracking-[0.02em] text-[#ffff44] font-bold"
                          style={{
                            ...m.totalLabelStyle,
                            transform: `translateY(${m.YEAR_AGE_NUDGE_Y}px)`,
                          }}
                        >
                          通算
                        </span>
                      </div>
                    ) : (
                      <div
                        className="flex flex-nowrap items-center"
                        style={{ width: m.LEFT_BLOCK_WIDTH, height: m.ROW_MIN_H }}
                      >
                        <div
                          className="flex-shrink-0"
                          style={{
                            width: m.YEAR_WIDTH,
                            height: m.ROW_MIN_H,
                            backgroundColor: bg,
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={m.cellCenterBox}>
                            <span
                              className={METRIC_VALUE_CLASS}
                              style={{
                                ...m.yearAgeValueStyle,
                                transform: `translateY(${m.YEAR_AGE_NUDGE_Y}px)`,
                              }}
                            >
                              {careerYearLabel(stat)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="flex-shrink-0 bg-[#555] self-stretch"
                          style={{ width: m.FRAME_WIDTH }}
                          aria-hidden
                        />
                        <div
                          className="flex-shrink-0 text-white"
                          style={{
                            width: m.AGE_WIDTH,
                            height: m.ROW_MIN_H,
                            backgroundColor: bg,
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={m.cellCenterBox}>
                            <span
                              className={METRIC_VALUE_CLASS}
                              style={{
                                ...m.yearAgeValueStyle,
                                transform: `translateY(${m.YEAR_AGE_NUDGE_Y}px)`,
                              }}
                            >
                              {careerAgeAtYear(birthRaw, stat)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="text-center border-r border-[#444] text-white"
                      style={{
                        width: m.METRIC_COL_WIDTH,
                        minWidth: m.METRIC_COL_WIDTH,
                        ...m.bodyTdStyle,
                        ...totalRowTop,
                      }}
                    >
                      <div style={m.cellCenterBox}>
                        <span
                          className={METRIC_VALUE_CLASS}
                          style={{
                            ...m.metricValueStyle,
                            transform: `translateY(${m.METRIC_VALUE_NUDGE_Y}px)`,
                          }}
                        >
                          {formatCareerCell(col, stat)}
                        </span>
                      </div>
                    </td>
                  ))}
                  {showSalaryColumn ? (
                    <td
                      className="text-center border-r border-[#444] text-white"
                      style={{
                        width: m.SALARY_COL_WIDTH,
                        minWidth: m.SALARY_COL_WIDTH,
                        ...m.bodyTdStyle,
                        ...totalRowTop,
                      }}
                    >
                      <div style={m.cellCenterBox}>
                        <span
                          className={METRIC_VALUE_CLASS}
                          style={{
                            ...m.metricValueStyle,
                            transform: `translateY(${m.METRIC_VALUE_NUDGE_Y}px)`,
                          }}
                        >
                          {formatSalaryManFromRow(stat)}
                        </span>
                      </div>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
