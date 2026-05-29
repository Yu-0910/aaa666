"use client"

import type { CSSProperties } from "react"
import {
  BATTING_STAT_COLUMNS,
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  type CareerDisplayRow,
} from "@/lib/playerCareerMergedDisplay"

/** 列幅（背景の横幅）・文字・余白・行高を 7 割 */
const CONTENT_SCALE = 0.7
const s = (px: number) => Math.round(px * CONTENT_SCALE * 10) / 10

const YEAR_WIDTH = s(48)
const AGE_WIDTH = s(40)
const FRAME_WIDTH = Math.max(1, Math.round(s(2)))
const METRIC_COL_WIDTH = s(54)
const SALARY_COL_WIDTH = s(66)
const LEFT_BLOCK_WIDTH = YEAR_WIDTH + FRAME_WIDTH + AGE_WIDTH

const FONT_HEADER = s(10)
/** 表内の数値（年度・年齢・指標・年俸）はベースサイズの 8 割 */
const NUMERIC_FONT_SCALE = 0.8
const nf = (px: number) => Math.round(px * NUMERIC_FONT_SCALE * 10) / 10
const FONT_BODY = nf(18)
const FONT_YEAR_TOTAL = nf(14)
const PAD_HEADER_X = s(8)
const PAD_HEADER_Y = s(12)
const ROW_MIN_H = s(32)
const YEAR_AGE_NUDGE_Y = s(1.5)
/** OPS〜年俸: 背景中心に対して少し下に見えるため下へ */
const METRIC_VALUE_NUDGE_Y = 2

type Props = {
  rows: CareerDisplayRow[]
  birthRaw: string
}

function rowBg(idx: number, isTotal: boolean): string {
  if (isTotal) return "#333333"
  return idx % 2 === 0 ? "#292929" : "#1f1f1f"
}

const headerLabelStyle: CSSProperties = {
  fontSize: FONT_HEADER,
  paddingLeft: PAD_HEADER_X,
  paddingRight: PAD_HEADER_X,
  paddingTop: PAD_HEADER_Y,
  paddingBottom: PAD_HEADER_Y,
  lineHeight: 1.2,
}

const bodyValueStyle: CSSProperties = {
  fontSize: FONT_BODY,
  lineHeight: 1,
  margin: 0,
}

/** セル内 flex 中央 */
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

const TOTAL_ROW_BORDER_TOP = "2px solid #ffff44"

export default function CareerBattingTableRankingStyle({ rows, birthRaw }: Props) {
  const tableMinWidthPx =
    LEFT_BLOCK_WIDTH + BATTING_STAT_COLUMNS.length * METRIC_COL_WIDTH + SALARY_COL_WIDTH

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
            <col style={{ width: `${LEFT_BLOCK_WIDTH}px` }} />
            {BATTING_STAT_COLUMNS.map((col) => (
              <col key={col.key} style={{ width: `${METRIC_COL_WIDTH}px` }} />
            ))}
            <col style={{ width: `${SALARY_COL_WIDTH}px` }} />
          </colgroup>
          <thead>
            <tr className="bg-[#2a2a2a]">
              <th
                className="sticky border-r-2 border-[#555] p-0"
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 100,
                  width: LEFT_BLOCK_WIDTH,
                  maxWidth: LEFT_BLOCK_WIDTH,
                }}
              >
                <div className="flex flex-nowrap items-stretch" style={{ width: LEFT_BLOCK_WIDTH }}>
                  <div
                    className="font-bold bg-[#ffff44] text-black flex-shrink-0 text-center"
                    style={{ width: YEAR_WIDTH, boxSizing: "border-box", ...headerLabelStyle }}
                  >
                    年度
                  </div>
                  <div className="flex-shrink-0 bg-[#555]" style={{ width: FRAME_WIDTH }} aria-hidden />
                  <div
                    className="font-bold bg-[#ffff44] text-black flex-shrink-0 text-center"
                    style={{ width: AGE_WIDTH, boxSizing: "border-box", ...headerLabelStyle }}
                  >
                    年齢
                  </div>
                </div>
              </th>
              {BATTING_STAT_COLUMNS.map((col, metricIdx) => (
                <th
                  key={col.key}
                  className={`font-bold border-r border-[#333] bg-[#ffff44] text-black text-center ${metricIdx === 0 ? "pl-0 -ml-[2px]" : ""}`}
                  style={{
                    width: METRIC_COL_WIDTH,
                    minWidth: METRIC_COL_WIDTH,
                    ...headerLabelStyle,
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th
                className="font-bold border-r border-[#333] bg-[#ffff44] text-black text-center whitespace-nowrap"
                style={{
                  width: SALARY_COL_WIDTH,
                  minWidth: SALARY_COL_WIDTH,
                  ...headerLabelStyle,
                  whiteSpace: "nowrap",
                }}
              >
                年俸（万）
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((stat, idx) => {
              const isTotal = Boolean(stat.is_total) || stat.year === "通算"
              const bg = rowBg(idx, isTotal)
              const totalRowTop = isTotal ? { borderTop: TOTAL_ROW_BORDER_TOP } : undefined
              return (
                <tr
                  key={`career-bat-${idx}`}
                  className="border-b border-[#333] hover:bg-[#2a2a2a] transition-colors"
                  style={{ backgroundColor: bg, height: ROW_MIN_H }}
                >
                  <td
                    className="sticky border-r-2 border-[#555] p-0"
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 40,
                      width: LEFT_BLOCK_WIDTH,
                      maxWidth: LEFT_BLOCK_WIDTH,
                      backgroundColor: bg,
                      ...bodyTdStyle,
                      ...totalRowTop,
                    }}
                  >
                    {isTotal ? (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: LEFT_BLOCK_WIDTH,
                          height: ROW_MIN_H,
                          backgroundColor: bg,
                          boxSizing: "border-box",
                        }}
                      >
                        <span
                          className="bebas tabular-nums tracking-[0.02em] text-[#ffff44] font-bold"
                          style={{
                            ...bodyValueStyle,
                            fontSize: FONT_YEAR_TOTAL,
                            transform: `translateY(${YEAR_AGE_NUDGE_Y}px)`,
                          }}
                        >
                          通算
                        </span>
                      </div>
                    ) : (
                      <div
                        className="flex flex-nowrap items-center"
                        style={{ width: LEFT_BLOCK_WIDTH, height: ROW_MIN_H }}
                      >
                        <div
                          className="flex-shrink-0"
                          style={{
                            width: YEAR_WIDTH,
                            height: ROW_MIN_H,
                            backgroundColor: bg,
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={cellCenterBox}>
                            <span
                              className="bebas tabular-nums tracking-[0.02em] text-white font-thin"
                              style={{
                                ...bodyValueStyle,
                                fontSize: FONT_BODY,
                                transform: `translateY(${YEAR_AGE_NUDGE_Y}px)`,
                              }}
                            >
                              {careerYearLabel(stat)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="flex-shrink-0 bg-[#555] self-stretch"
                          style={{ width: FRAME_WIDTH }}
                          aria-hidden
                        />
                        <div
                          className="flex-shrink-0 text-white"
                          style={{
                            width: AGE_WIDTH,
                            height: ROW_MIN_H,
                            backgroundColor: bg,
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={cellCenterBox}>
                            <span
                              className="bebas tabular-nums tracking-[0.02em] font-thin"
                              style={{
                                ...bodyValueStyle,
                                transform: `translateY(${YEAR_AGE_NUDGE_Y}px)`,
                              }}
                            >
                              {careerAgeAtYear(birthRaw, stat)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  {BATTING_STAT_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="text-center border-r border-[#444] text-white"
                      style={{
                        width: METRIC_COL_WIDTH,
                        minWidth: METRIC_COL_WIDTH,
                        ...bodyTdStyle,
                        ...totalRowTop,
                      }}
                    >
                      <div style={cellCenterBox}>
                        <span
                          className="bebas tabular-nums tracking-[0.02em] font-thin text-white/90"
                          style={{
                            ...bodyValueStyle,
                            transform: `translateY(${METRIC_VALUE_NUDGE_Y}px)`,
                          }}
                        >
                          {formatCareerCell(col, stat)}
                        </span>
                      </div>
                    </td>
                  ))}
                  <td
                    className="text-center border-r border-[#444] text-white"
                    style={{
                      width: SALARY_COL_WIDTH,
                      minWidth: SALARY_COL_WIDTH,
                      ...bodyTdStyle,
                      ...totalRowTop,
                    }}
                  >
                    <div style={cellCenterBox}>
                      <span
                        className="bebas tabular-nums tracking-[0.02em] font-thin text-white/90"
                        style={{
                          ...bodyValueStyle,
                          transform: `translateY(${METRIC_VALUE_NUDGE_Y}px)`,
                        }}
                      >
                        {formatSalaryManFromRow(stat)}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
