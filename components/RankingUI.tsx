/**
 * Pure UI Component - ランキング表示専用
 * 
 * 【重要】このコンポーネントは表示専用です
 * - データの取得・変換・フィルタリングは一切行いません
 * - props を受け取って描画するだけのPure UIです
 * - 指標の数が1でも20でも同じ構造で描画します（崩れないことが最優先）
 */

"use client"

import { Fragment } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import type { RankingViewModel, RankingRow } from '@/lib/ranking/types'
import { formatRomanNameForRanking } from '@/lib/ranking/formatRomanNameForRanking'
import { rankingTeamStripeColor } from '@/lib/ranking/teamStripeColor'
import { formatStat } from '@/lib/formatStat'
import { playerPageHref } from '@/lib/playerPageHref'
import { usesRanking2025CompactTableUi } from '@/lib/ranking/rankingUiVariant'

interface RankingUIProps {
  viewModel: RankingViewModel
  sortedRows: RankingRow[]
  sortKey: string
  order: 'asc' | 'desc'
  onSortChange: (metricKey: string) => void
  /** ランキングベースパス（既定: `/ranking`）。投手は `/ranking/pitching` */
  rankingPathBase?: string
  /** 指標が未選択時の見出しフォールバック */
  metricLabelFallback?: string
  /** 年度セレクトの候補。未指定時は 2026〜1950 */
  yearOptions?: number[]
  /** メイン見出し直下の補足（例: 投手規定の説明） */
  titleSubNote?: string
  /** 週間ランキング: ヘッダー右の週セレクト（年度セレクトの代わり） */
  weekSelector?: {
    weekKey: string
    options: Array<{ weekKey: string; weekLabel: string }>
    onWeekChange: (weekKey: string) => void
  }
  /** タイトル行の週ラベル（例: 5/12〜5/17） */
  weekLabelInTitle?: string
}

// 左ブロック（順＋フレーム＋選手）を1層にまとめ、隙間を防ぐ（問題29・二層構造の理想に合わせる）
const RANK_WIDTH = 30
const PLAYER_WIDTH = 90
const PLAYER_WIDTH_2025 = PLAYER_WIDTH * 0.9 // 9割
const FRAME_WIDTH = 2 // 順列と選手列の間のグレーフレーム
/** 指標列の最小幅（w-full だと本番で全列が画面幅に押し潰され横スクロール不能になる） */
const METRIC_COL_MIN_WIDTH = 60
const METRIC_COL_MIN_WIDTH_2025 = METRIC_COL_MIN_WIDTH * 0.85 // 8.5割
/** 選手名ブロックの縦サイズ（px） */
const PLAYER_NAME_BLOCK_HEIGHT = 32
const PLAYER_NAME_BLOCK_HEIGHT_2025 = 32.3

function rankingTableMinWidthPx(leftBlockWidth: number, metricColMinWidth: number, metricCount: number): number {
  return leftBlockWidth + metricCount * metricColMinWidth
}

export default function RankingUI({
  viewModel,
  sortedRows,
  sortKey,
  order,
  onSortChange,
  rankingPathBase = '/ranking',
  metricLabelFallback = '打撃成績',
  yearOptions,
  titleSubNote,
  weekSelector,
  weekLabelInTitle,
}: RankingUIProps) {
  const { season, league, metrics } = viewModel
  const router = useRouter()
  const compactTableUi = usesRanking2025CompactTableUi(season)
  const playerWidth = compactTableUi ? PLAYER_WIDTH_2025 : PLAYER_WIDTH
  const leftBlockWidth = RANK_WIDTH + FRAME_WIDTH + playerWidth
  const playerNameBlockHeight = compactTableUi ? PLAYER_NAME_BLOCK_HEIGHT_2025 : PLAYER_NAME_BLOCK_HEIGHT
  const metricColMinWidth = compactTableUi ? METRIC_COL_MIN_WIDTH_2025 : METRIC_COL_MIN_WIDTH
  const metricValueTextClass = compactTableUi ? 'text-[16.83px]' : 'text-lg'
  const gpaMetricIdx = metrics.findIndex((m) => m.key === 'gpa' || m.label === 'GPA')
  const metricBgMaxIdx = gpaMetricIdx >= 0 ? gpaMetricIdx : metrics.length - 1

  // 表示中の指標名を取得（2024年以前と同様に metrics をそのまま使用）
  const activeMetric = metrics.find(m => m.key === sortKey)
  const metricLabel = activeMetric?.label || metricLabelFallback

  // タイトルを動的に生成（例：「パ・リーグ　OPSランキング (2025年)」）
  const leagueName =
    league === 'CL'
      ? 'セ・リーグ'
      : league === 'PL'
        ? 'パ・リーグ'
        : league === 'PRE_spring'
          ? '春季リーグ'
          : league === 'PRE_fall'
            ? '秋季リーグ'
            : league
  const weekRangeInTitle = weekLabelInTitle?.trim() ? ` (${weekLabelInTitle.trim()})` : ''
  const displayTitle = weekSelector
    ? `${leagueName}　週間${metricLabel}ランキング${weekRangeInTitle}`
    : `${leagueName}　${metricLabel}ランキング (${season}年)`

  const yearSelectOptions = yearOptions ?? Array.from({ length: 77 }, (_, i) => 2026 - i)
  const tableMinWidthPx = rankingTableMinWidthPx(leftBlockWidth, metricColMinWidth, metrics.length)

  const handleYearChange = (newYear: number) => {
    router.push(
      `${rankingPathBase}/${newYear}/${league}?sort=${encodeURIComponent(sortKey)}&order=${order}`
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]" style={{ zIndex: 300 }}>
        {/* Header */}
        <div className="container mx-auto px-4 py-1 border-b border-[#333] flex items-center justify-between">
          {/* Left: Back Button */}
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 p-1 hover:opacity-80 transition-opacity text-[#ffff44]"
            aria-label="戻る"
          >
            <span className="text-sm">←</span>
          </button>

          {/* Center: Logo */}
          <Link href={SITE_TOP_HREF} className="absolute left-1/2 transform -translate-x-1/2">
            <img src="/logo.png" alt="Logo" className="w-7 h-7 cursor-pointer hover:opacity-80 transition-opacity" />
          </Link>

          {weekSelector ? (
            <select
              value={weekSelector.weekKey}
              onChange={(e) => weekSelector.onWeekChange(e.target.value)}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors max-w-[7.5rem]"
              aria-label="週を選択"
            >
              {weekSelector.options.map((w) => (
                <option key={w.weekKey} value={w.weekKey}>
                  {w.weekLabel}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={season}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors"
            >
              {yearSelectOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-2 py-3">
        {/* Title */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-0.5 h-5 bg-[#039850]" />
          <h1 className="text-base font-bold text-white">
            {displayTitle}
          </h1>
        </div>
        {titleSubNote ? (
          <p className="text-[10px] text-gray-500 mb-2 leading-snug max-w-[920px]">{titleSubNote}</p>
        ) : null}

        {/* ランキングテーブル */}
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
              }}
            >
              <colgroup>
                <col style={{ width: `${leftBlockWidth}px` }} />
                {metrics.map((metric) => (
                  <col key={metric.key} style={{ width: `${metricColMinWidth}px` }} />
                ))}
              </colgroup>
              <thead>
                {/* 層1: 順＋グレーフレーム＋選手名を1セルで一塊に（隙間防止） */}
                <tr className="bg-[#2a2a2a]">
                  <th
                    className="sticky border-r-2 border-[#555]"
                    style={{
                      position: 'sticky',
                      top: 0,
                      left: 0,
                      zIndex: 100,
                      width: `${leftBlockWidth}px`,
                      maxWidth: `${leftBlockWidth}px`,
                      boxSizing: 'border-box',
                      padding: 0,
                      verticalAlign: 'middle',
                    }}
                  >
                    <div className="flex flex-nowrap items-stretch w-full" style={{ width: leftBlockWidth }}>
                      <div className="px-2 py-3 text-[10px] font-bold bg-[#ffff44] text-black flex-shrink-0" style={{ width: RANK_WIDTH, boxSizing: 'border-box' }}>順</div>
                      <div className="flex-shrink-0 bg-[#555]" style={{ width: FRAME_WIDTH }} aria-hidden />
                      <div className="px-2 py-3 text-[10px] font-bold bg-[#ffff44] text-black flex-shrink-0" style={{ width: playerWidth, boxSizing: 'border-box' }}>選手名</div>
                    </div>
                  </th>
                  {metrics.map((metric, metricIdx) => {
                    const isActive = sortKey === metric.key
                    return (
                      <th
                        key={metric.key}
                        data-active={isActive}
                        className={`px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#ffff44] text-black ${metricIdx === 0 ? 'pl-0 ml-0 -ml-[2px]' : ''}`}
                        style={{
                          width: `${metricColMinWidth}px`,
                          minWidth: `${metricColMinWidth}px`,
                          backgroundColor: '#ffff44',
                          color: '#000000',
                          paddingLeft: metricIdx === 0 ? 0 : undefined,
                          marginLeft: metricIdx === 0 ? '-2px' : undefined,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (sortKey === metric.key) return
                            onSortChange(metric.key)
                          }}
                          className="w-full cursor-pointer hover:underline relative z-10 pointer-events-auto flex items-center justify-center gap-1"
                          style={{
                            textAlign: 'center',
                            width: '100%',
                            color: '#000000',
                            backgroundColor: 'transparent',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                          }}
                        >
                          <span className="underline">{metric.label}</span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const hasRomanName = row.romanName && row.romanName.trim()
                  const shouldShowHeader = idx > 0 && idx % 15 === 0
                  
                  return (
                    <Fragment key={`row-${row.playerId}-${idx}`}>
                      {/* 15行ごとにヘッダー行を表示 */}
                      {shouldShowHeader && (
                        <tr key={`header-${idx}`} className="bg-[#4a4a4a] text-white">
                          {/* 層1: 順＋グレーフレーム＋選手名を1セルで一塊に */}
                          <th
                            className="sticky border-r-2 border-[#555]"
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 100,
                              width: `${leftBlockWidth}px`,
                              maxWidth: `${leftBlockWidth}px`,
                              boxSizing: 'border-box',
                              padding: 0,
                              verticalAlign: 'middle',
                            }}
                          >
                            <div className="flex flex-nowrap items-stretch w-full" style={{ width: leftBlockWidth }}>
                              <div className="px-2 py-3 text-[10px] font-bold bg-[#4a4a4a] text-white flex-shrink-0" style={{ width: RANK_WIDTH, boxSizing: 'border-box' }}>順</div>
                              <div className="flex-shrink-0 bg-[#555]" style={{ width: FRAME_WIDTH }} aria-hidden />
                              <div className="px-2 py-3 text-[10px] font-bold bg-[#4a4a4a] text-white flex-shrink-0" style={{ width: playerWidth, boxSizing: 'border-box' }}>選手名</div>
                            </div>
                          </th>
                          {metrics.map((metric, metricIdx) => {
                            const isActive = sortKey === metric.key
                            return (
                              <th
                                key={metric.key}
                                data-active={isActive}
                                className={`px-2 py-3 text-[10px] font-bold border-r border-[#333] bg-[#4a4a4a] text-white ${metricIdx === 0 ? 'pl-0 ml-0 -ml-[2px]' : ''}`}
                                style={{
                                  width: `${metricColMinWidth}px`,
                                  minWidth: `${metricColMinWidth}px`,
                                  backgroundColor: '#4a4a4a',
                                  color: '#ffffff',
                                  paddingLeft: metricIdx === 0 ? 0 : undefined,
                                  marginLeft: metricIdx === 0 ? '-2px' : undefined,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (sortKey === metric.key) return
                                    onSortChange(metric.key)
                                  }}
                                  className="w-full cursor-pointer hover:underline relative z-10 pointer-events-auto flex items-center justify-center gap-1"
                                  style={{
                                    textAlign: 'center',
                                    width: '100%',
                                    color: '#ffffff',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    margin: 0,
                                  }}
                                >
                                  <span className="underline">{metric.label}</span>
                                </button>
                              </th>
                            )
                          })}
                        </tr>
                      )}
                      <tr
                        key={`${row.playerId}-${idx}`}
                        className="hover:bg-[#2a2a2a] transition-colors border-b border-[#333]"
                        style={{ backgroundColor: row.rank % 2 === 0 ? '#292929' : '#1f1f1f' }}
                      >
                      {/* 層1: 順位＋グレーフレーム＋選手名を1セルで一塊に */}
                      <td
                        className="sticky border-r-2 border-[#555]"
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 40,
                          width: `${leftBlockWidth}px`,
                          maxWidth: `${leftBlockWidth}px`,
                          boxSizing: 'border-box',
                          padding: 0,
                          verticalAlign: 'middle',
                        }}
                      >
                        <div className="flex flex-nowrap items-stretch w-full" style={{ width: leftBlockWidth }}>
                          <div
                            className="text-center tabular-nums font-normal text-white flex-shrink-0 flex items-center justify-center"
                            style={{
                              width: RANK_WIDTH,
                              minHeight: 32,
                              backgroundColor: row.rank % 2 === 0 ? '#292929' : '#1f1f1f',
                              padding: '2px 4px',
                              boxSizing: 'border-box',
                            }}
                          >
                            <span className="bebas tabular-nums text-lg font-thin tracking-[0.02em] text-white/85">{row.rank}</span>
                          </div>
                          <div className="flex-shrink-0 bg-[#555]" style={{ width: FRAME_WIDTH }} aria-hidden />
                          <div
                            className={`overflow-hidden flex-shrink-0 flex items-center ${compactTableUi ? 'self-center' : ''}`}
                            style={{
                              width: playerWidth,
                              minHeight: playerNameBlockHeight,
                              ...(compactTableUi
                                ? { height: playerNameBlockHeight, maxHeight: playerNameBlockHeight }
                                : {}),
                              backgroundColor: row.rank % 2 === 0 ? '#292929' : '#1f1f1f',
                              padding: compactTableUi ? '1.9px 2px' : '2px 2px',
                              boxSizing: 'border-box',
                            }}
                          >
                            <div className="flex items-center gap-0.5 w-full min-w-0">
                              <div
                                className="w-1 flex-shrink-0"
                                style={{
                                  height: playerNameBlockHeight,
                                  backgroundColor: rankingTeamStripeColor(row.team),
                                }}
                              />
                              <div
                                className="flex-1 min-w-0 flex flex-col justify-center leading-[1.05]"
                                style={{ height: playerNameBlockHeight }}
                              >
                                <Link
                                  href={playerPageHref({
                                    npbPlayerId: row.npbPlayerId,
                                    playerId: row.playerId,
                                    name: row.name,
                                    romanName:
                                      hasRomanName && row.romanName
                                        ? formatRomanNameForRanking(row.romanName)
                                        : undefined,
                                  })}
                                  className="block truncate"
                                >
                                  <span className="text-white hover:text-[#ffff44] text-[13px] font-semibold truncate">
                                    {row.name.replace(/\s+/g, '')}
                                  </span>
                                </Link>
                                {hasRomanName && row.romanName && (
                                  <span className="text-[10px] text-gray-400 latin truncate line-clamp-1">
                                    {formatRomanNameForRanking(row.romanName)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* 層2: 指標の値のみ */}
                      {metrics.map((metric, metricIdx) => {
                        const value = row[metric.key]
                        const formattedValue = value !== null && value !== undefined && !isNaN(Number(value))
                          ? formatStat(metric.label, value)
                          : '-'
                        const isActive = sortKey === metric.key
                        const isEvenRank = row.rank % 2 === 0
                        const isWithinGpaRange = metricIdx <= metricBgMaxIdx
                        // アクティブ列は従来どおり強調。非アクティブ列は偶数順位かつ（順〜GPA）範囲のみ背景を塗る。
                        const cellBgColor = isActive
                          ? '#3a3a3a'
                          : isEvenRank && isWithinGpaRange
                            ? '#292929'
                            : 'transparent'
                        
                        return (
                          <td
                            key={metric.key}
                            className={`px-1.5 py-0.5 text-center tabular-nums font-normal border-r border-[#444] text-white ${
                              isActive ? 'bg-[#3a3a3a]' : ''
                            } ${metricIdx === 0 ? 'pl-0 ml-0 -ml-[2px]' : ''}`}
                            style={{
                              width: `${metricColMinWidth}px`,
                              minWidth: `${metricColMinWidth}px`,
                              backgroundColor: cellBgColor,
                              paddingLeft: metricIdx === 0 ? 0 : undefined,
                              marginLeft: metricIdx === 0 ? '-2px' : undefined,
                            }}
                          >
                            <span className={`bebas tabular-nums ${metricValueTextClass} font-thin tracking-[0.02em] text-white/85`}>
                              {formattedValue}
                            </span>
                          </td>
                        )
                      })}
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      
      {/* 開発時のみデバッグ情報を表示 */}
      {process.env.NODE_ENV === 'development' && viewModel.debug && (
        <div className="container mx-auto px-4 py-2 border-t border-[#333] text-xs text-gray-500">
          <div>DataSource: {viewModel.debug.csvPath || 'N/A'}</div>
          <div>Duplicates: {viewModel.debug.duplicatePlayerIdCount} ids / {viewModel.debug.duplicateRowCount} rows</div>
        </div>
      )}
    </div>
  )
}

