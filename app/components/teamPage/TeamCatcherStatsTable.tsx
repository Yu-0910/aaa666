"use client"

import Link from "next/link"
import {
  TEAM_CATCHER_COLUMNS,
  type TeamCatcherSortKey,
} from "@/lib/teamPage/teamCatcherColumns"
import { formatTeamCatcherCell } from "@/lib/teamPage/teamCatcherDisplay"
import type { TeamCatcherStatsRow } from "@/lib/teamPage/teamCatcherRoster"
import { playerPageHref } from "@/lib/playerPageHref"
import { formatRomanNameForRanking } from "@/lib/ranking/formatRomanNameForRanking"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { usesRanking2025CompactTableUi } from "@/lib/ranking/rankingUiVariant"

const RANK_WIDTH = 30
const PLAYER_WIDTH = 90
const PLAYER_WIDTH_2025 = PLAYER_WIDTH * 0.9
const FRAME_WIDTH = 2
const METRIC_COL_MIN_WIDTH = 64
/** 長い指標名（被出塁率・盗塁阻止率など）が折り返さない幅 */
const METRIC_COL_MIN_WIDTH_2025 = 62
/** 指標列の横幅スケール（打撃ランキングの compact 列幅 8.5割と同趣旨） */
const METRIC_COL_HORIZONTAL_SCALE = 0.85
const PLAYER_NAME_BLOCK_HEIGHT = 32
const PLAYER_NAME_BLOCK_HEIGHT_2025 = 32.3
/** 指標ヘッダー1行固定（順・選手名の黄背景と高さを揃える） */
const HEADER_ROW_HEIGHT = 38

type Props = {
  rows: TeamCatcherStatsRow[]
  sortKey: TeamCatcherSortKey
  year: string
  onSortChange: (key: TeamCatcherSortKey) => void
}

function tableMinWidth(leftBlockWidth: number, metricColMinWidth: number, metricCount: number): number {
  return leftBlockWidth + metricCount * metricColMinWidth
}

export default function TeamCatcherStatsTable({
  rows,
  sortKey,
  year,
  onSortChange,
}: Props) {
  const compactTableUi = usesRanking2025CompactTableUi(year)
  const playerWidth = compactTableUi ? PLAYER_WIDTH_2025 : PLAYER_WIDTH
  const leftBlockWidth = RANK_WIDTH + FRAME_WIDTH + playerWidth
  const playerNameBlockHeight = compactTableUi ? PLAYER_NAME_BLOCK_HEIGHT_2025 : PLAYER_NAME_BLOCK_HEIGHT
  const metricColMinWidth = Math.round(
    (compactTableUi ? METRIC_COL_MIN_WIDTH_2025 : METRIC_COL_MIN_WIDTH) *
      METRIC_COL_HORIZONTAL_SCALE,
  )
  const metricValueTextClass = compactTableUi ? "text-[16.83px]" : "text-lg"
  const metricCellPx = compactTableUi ? "px-1" : "px-1.5"
  const metricColumns = TEAM_CATCHER_COLUMNS.filter((c) => c.key !== "rank" && c.key !== "player")
  const tableMinWidthPx = tableMinWidth(leftBlockWidth, metricColMinWidth, metricColumns.length)

  return (
    <div className="bg-[#1a1a1a] border border-[#333]">
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
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <colgroup>
            <col style={{ width: `${leftBlockWidth}px` }} />
            {metricColumns.map((col) => (
              <col key={col.key} style={{ width: `${metricColMinWidth}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-[#2a2a2a]" style={{ height: HEADER_ROW_HEIGHT }}>
              <th
                className="sticky border-r-2 border-[#555] p-0"
                style={{
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 100,
                  width: `${leftBlockWidth}px`,
                  maxWidth: `${leftBlockWidth}px`,
                  height: HEADER_ROW_HEIGHT,
                  boxSizing: "border-box",
                  verticalAlign: "middle",
                }}
              >
                <div
                  className="flex flex-nowrap items-stretch w-full h-full"
                  style={{ width: leftBlockWidth, height: HEADER_ROW_HEIGHT }}
                >
                  <div
                    className="flex flex-shrink-0 items-center justify-center text-[10px] font-bold leading-none bg-[#ffff44] text-black"
                    style={{ width: RANK_WIDTH, height: HEADER_ROW_HEIGHT, boxSizing: "border-box" }}
                  >
                    順
                  </div>
                  <div
                    className="flex-shrink-0 bg-[#555] h-full"
                    style={{ width: FRAME_WIDTH }}
                    aria-hidden
                  />
                  <div
                    className="flex flex-shrink-0 items-center justify-center px-1 text-[10px] font-bold leading-none bg-[#ffff44] text-black"
                    style={{ width: playerWidth, height: HEADER_ROW_HEIGHT, boxSizing: "border-box" }}
                  >
                    選手名
                  </div>
                </div>
              </th>
              {metricColumns.map((col, metricIdx) => {
                const isActive = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    className={`p-0 text-[10px] font-bold leading-none border-r border-[#333] bg-[#ffff44] text-black ${
                      metricIdx === 0 ? "pl-0 ml-0 -ml-[2px]" : ""
                    }`}
                    style={{
                      width: `${metricColMinWidth}px`,
                      minWidth: `${metricColMinWidth}px`,
                      height: HEADER_ROW_HEIGHT,
                      position: "sticky",
                      top: 0,
                      zIndex: 50,
                      boxSizing: "border-box",
                    }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(col.key as TeamCatcherSortKey)}
                        title={col.label}
                        className="relative flex h-full w-full cursor-pointer items-center justify-center whitespace-nowrap px-0.5"
                        style={{
                          height: HEADER_ROW_HEIGHT,
                          color: "#000000",
                          backgroundColor: "transparent",
                          border: "none",
                          padding: 0,
                          margin: 0,
                        }}
                      >
                        <span>{col.label}</span>
                        {isActive ? (
                          <span
                            className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center leading-none"
                            aria-hidden
                          >
                            <span
                              style={{
                                width: 0,
                                height: 0,
                                borderLeft: "4px solid transparent",
                                borderRight: "4px solid transparent",
                                borderBottom: "5px solid #000000",
                              }}
                            />
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span className="flex h-full items-center justify-center whitespace-nowrap px-0.5">
                        {col.label}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const hasRomanName = row.romanName && row.romanName.trim()
              const stripe = rankingTeamStripeColor(row.teamCode)
              const isEvenRank = (row.rank ?? idx + 1) % 2 === 0
              const rowBg = isEvenRank ? "#292929" : "#1f1f1f"

              return (
                <tr
                  key={row.npbPlayerId}
                  className="hover:bg-[#2a2a2a] transition-colors border-b border-[#333]"
                  style={{ backgroundColor: rowBg }}
                >
                  <td
                    className="sticky border-r-2 border-[#555]"
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 40,
                      width: `${leftBlockWidth}px`,
                      maxWidth: `${leftBlockWidth}px`,
                      boxSizing: "border-box",
                      padding: 0,
                      verticalAlign: "middle",
                    }}
                  >
                    <div className="flex flex-nowrap items-stretch w-full" style={{ width: leftBlockWidth }}>
                      <div
                        className="text-center tabular-nums font-normal text-white flex-shrink-0 flex items-center justify-center"
                        style={{
                          width: RANK_WIDTH,
                          minHeight: 32,
                          backgroundColor: rowBg,
                          padding: "2px 4px",
                          boxSizing: "border-box",
                        }}
                      >
                        <span className="bebas tabular-nums text-lg font-thin tracking-[0.02em] text-white/85">
                          {row.rank ?? "—"}
                        </span>
                      </div>
                      <div className="flex-shrink-0 bg-[#555]" style={{ width: FRAME_WIDTH }} aria-hidden />
                      <div
                        className={`overflow-hidden flex-shrink-0 flex items-center ${compactTableUi ? "self-center" : ""}`}
                        style={{
                          width: playerWidth,
                          minHeight: playerNameBlockHeight,
                          ...(compactTableUi
                            ? { height: playerNameBlockHeight, maxHeight: playerNameBlockHeight }
                            : {}),
                          backgroundColor: rowBg,
                          padding: compactTableUi ? "1.9px 2px" : "2px 2px",
                          boxSizing: "border-box",
                        }}
                      >
                        <div className="flex items-center gap-0.5 w-full min-w-0">
                          <div
                            className="w-1 flex-shrink-0"
                            style={{
                              height: playerNameBlockHeight,
                              backgroundColor: stripe,
                            }}
                          />
                          <div
                            className="flex-1 min-w-0 flex flex-col justify-center leading-[1.05]"
                            style={{ height: playerNameBlockHeight }}
                          >
                            <Link
                              href={playerPageHref({
                                npbPlayerId: row.npbPlayerId,
                                name: row.nameJa,
                                romanName: hasRomanName && row.romanName ? row.romanName : undefined,
                              })}
                              className="block truncate"
                            >
                              <span className="text-white hover:text-[#ffff44] text-[13px] font-semibold truncate">
                                {row.nameJa.replace(/\s+/g, "")}
                              </span>
                            </Link>
                            {hasRomanName && row.romanName && (
                              <span className="text-[10px] text-gray-400 latin truncate line-clamp-1">
                                {formatRomanNameForRanking(row.romanName, { nameJa: row.nameJa })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  {metricColumns.map((col, metricIdx) => {
                    const isActive = sortKey === col.key
                    const cellBgColor = isActive ? "#3a3a3a" : "transparent"
                    return (
                      <td
                        key={col.key}
                        className={`${metricCellPx} py-0.5 text-center tabular-nums font-normal border-r border-[#444] text-white ${
                          isActive ? "bg-[#3a3a3a]" : ""
                        } ${metricIdx === 0 ? "pl-0 ml-0 -ml-[2px]" : ""}`}
                        style={{
                          width: `${metricColMinWidth}px`,
                          minWidth: `${metricColMinWidth}px`,
                          backgroundColor: cellBgColor,
                        }}
                      >
                        <span
                          className={`bebas tabular-nums ${metricValueTextClass} font-thin tracking-[0.02em] text-white/85`}
                        >
                          {formatTeamCatcherCell(row, col.key as TeamCatcherSortKey)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
