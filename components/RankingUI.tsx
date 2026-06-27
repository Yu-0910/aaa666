/**
 * Pure UI Component - ランキング表示専用
 * 
 * 【重要】このコンポーネントは表示専用です
 * - データの取得・変換・フィルタリングは一切行いません
 * - props を受け取って描画するだけのPure UIです
 * - 指標の数が1でも20でも同じ構造で描画します（崩れないことが最優先）
 */

"use client"

import { Fragment, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import type { MetricDefinition, RankingViewModel, RankingRow } from '@/lib/ranking/types'
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
  /** 見出しの上に出す関連リンク群 */
  headerNavGroups?: Array<{
    ariaLabel: string
    links: Array<{ href: string; label: string; active?: boolean }>
  }>
  /** 週間ランキング: ヘッダー右の週セレクト（年度セレクトの代わり） */
  weekSelector?: {
    weekKey: string
    options: Array<{ weekKey: string; weekLabel: string }>
    onWeekChange: (weekKey: string) => void
  }
  /** タイトル行の週ラベル（例: 5/12〜5/17） */
  weekLabelInTitle?: string
  /** チームページ等: 外側シェルに埋め込み（ヘッダー・年度セレクトを省略） */
  embedInShell?: boolean
  /** embedInShell 時のタイトル先頭（例: 球団表示名） */
  titleScopeName?: string
  /** embedInShell 時の年度変更（TeamPageShell のセレクトと連動する場合） */
  onYearChange?: (year: number) => void
  /** 規定到達ブロック末尾の順位（黄線をその行の直下に表示） */
  qualifyingDividerAfterRank?: number | null
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
/** 指標ヘッダー1行固定（順・選手名の背景と高さを揃える） */
const HEADER_ROW_HEIGHT = 38

function rankingTableMinWidthPx(leftBlockWidth: number, metricColMinWidth: number, metricCount: number): number {
  return leftBlockWidth + metricCount * metricColMinWidth
}

type RankingTableHeaderRowProps = {
  variant: 'primary' | 'repeat'
  leftBlockWidth: number
  playerWidth: number
  metricColMinWidth: number
  metrics: MetricDefinition[]
  sortKey: string
  onSortChange: (metricKey: string) => void
}

function RankingTableHeaderRow({
  variant,
  leftBlockWidth,
  playerWidth,
  metricColMinWidth,
  metrics,
  sortKey,
  onSortChange,
}: RankingTableHeaderRowProps) {
  const isPrimary = variant === 'primary'
  const labelBg = isPrimary ? '#ffff44' : '#4a4a4a'
  const labelText = isPrimary ? '#000000' : '#ffffff'

  return (
    <tr
      className={isPrimary ? 'bg-[#2a2a2a]' : 'bg-[#4a4a4a] text-white'}
      style={{ height: HEADER_ROW_HEIGHT }}
    >
      <th
        className="sticky border-r-2 border-[#555] p-0"
        style={{
          position: 'sticky',
          top: isPrimary ? 0 : undefined,
          left: 0,
          zIndex: 100,
          width: `${leftBlockWidth}px`,
          maxWidth: `${leftBlockWidth}px`,
          height: HEADER_ROW_HEIGHT,
          boxSizing: 'border-box',
          verticalAlign: 'middle',
        }}
      >
        <div
          className="flex flex-nowrap items-stretch w-full h-full"
          style={{ width: leftBlockWidth, height: HEADER_ROW_HEIGHT }}
        >
          <div
            className="flex flex-shrink-0 items-center justify-center text-[10px] font-bold leading-none"
            style={{
              width: RANK_WIDTH,
              height: HEADER_ROW_HEIGHT,
              boxSizing: 'border-box',
              backgroundColor: labelBg,
              color: labelText,
            }}
          >
            順
          </div>
          <div
            className="flex-shrink-0 bg-[#555] h-full"
            style={{ width: FRAME_WIDTH }}
            aria-hidden
          />
          <div
            className="flex flex-shrink-0 items-center justify-center px-1 text-[10px] font-bold leading-none"
            style={{
              width: playerWidth,
              height: HEADER_ROW_HEIGHT,
              boxSizing: 'border-box',
              backgroundColor: labelBg,
              color: labelText,
            }}
          >
            選手名
          </div>
        </div>
      </th>
      {metrics.map((metric, metricIdx) => {
        const isActive = sortKey === metric.key
        return (
          <th
            key={metric.key}
            data-active={isActive}
            className={`p-0 text-[10px] font-bold leading-none border-r border-[#333] ${
              metricIdx === 0 ? 'pl-0 ml-0 -ml-[2px]' : ''
            }`}
            style={{
              width: `${metricColMinWidth}px`,
              minWidth: `${metricColMinWidth}px`,
              height: HEADER_ROW_HEIGHT,
              backgroundColor: labelBg,
              color: labelText,
              paddingLeft: metricIdx === 0 ? 0 : undefined,
              marginLeft: metricIdx === 0 ? '-2px' : undefined,
              position: isPrimary ? 'sticky' : undefined,
              top: isPrimary ? 0 : undefined,
              zIndex: isPrimary ? 50 : undefined,
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (sortKey === metric.key) return
                onSortChange(metric.key)
              }}
              title={metric.label}
              className="relative flex h-full w-full cursor-pointer items-center justify-center whitespace-nowrap px-0.5"
              style={{
                height: HEADER_ROW_HEIGHT,
                textAlign: 'center',
                color: labelText,
                backgroundColor: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              <span className="leading-tight">{metric.label}</span>
              {isActive ? (
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center leading-none"
                  aria-hidden
                >
                  <span
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderBottom: `5px solid ${isPrimary ? '#000000' : '#ffffff'}`,
                    }}
                  />
                </span>
              ) : null}
            </button>
          </th>
        )
      })}
    </tr>
  )
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
  headerNavGroups,
  weekSelector,
  weekLabelInTitle,
  embedInShell = false,
  titleScopeName,
  onYearChange,
  qualifyingDividerAfterRank = null,
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
  const scopeName = titleScopeName?.trim() || leagueName
  const displayTitle = weekSelector
    ? `${scopeName}　週間${metricLabel}ランキング${weekRangeInTitle}`
    : `${scopeName}　${metricLabel}ランキング (${season}年)`

  const yearSelectOptions = yearOptions ?? Array.from({ length: 77 }, (_, i) => 2026 - i)
  const tableMinWidthPx = rankingTableMinWidthPx(leftBlockWidth, metricColMinWidth, metrics.length)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const scrollSyncLock = useRef(false)

  const syncRankingTableScroll = (source: "table" | "bottom") => {
    if (scrollSyncLock.current) return
    const table = tableScrollRef.current
    const bottom = bottomScrollRef.current
    if (!table || !bottom) return
    scrollSyncLock.current = true
    if (source === "table") {
      bottom.scrollLeft = table.scrollLeft
    } else {
      table.scrollLeft = bottom.scrollLeft
    }
    scrollSyncLock.current = false
  }

  const handleYearChange = (newYear: number) => {
    if (onYearChange) {
      onYearChange(newYear)
      return
    }
    router.push(
      `${rankingPathBase}/${newYear}/${league}?sort=${encodeURIComponent(sortKey)}&order=${order}`,
    )
  }

  const titleBlock = (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-0.5 h-5 bg-[#039850]" />
        <h1 className="text-base font-bold text-white">{displayTitle}</h1>
      </div>
      {titleSubNote ? (
        <p className="text-[10px] text-gray-500 mb-2 leading-snug max-w-[920px]">{titleSubNote}</p>
      ) : null}
    </>
  )

  const headerNavBlock =
    headerNavGroups && headerNavGroups.length > 0 ? (
      <div className="mb-2 flex flex-col gap-1.5" aria-label="関連ページ">
        {headerNavGroups.map((group) => (
          <nav key={group.ariaLabel} className="flex flex-wrap gap-1.5 text-[11px]" aria-label={group.ariaLabel}>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center rounded border px-2 py-0.5 transition-colors ${
                  link.active
                    ? "border-[#ffff44] bg-[#1f1f1f] text-[#ffff44]"
                    : "border-[#444] bg-[#141414] text-gray-400 hover:border-[#666] hover:text-[#ffff44]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
    ) : null

  const tableBlock = (
    <>
        {/* ランキングテーブル */}
        <div className="bg-[#1a1a1a] border border-[#333]">
          <div
            ref={tableScrollRef}
            onScroll={() => syncRankingTableScroll("table")}
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
                <RankingTableHeaderRow
                  variant="primary"
                  leftBlockWidth={leftBlockWidth}
                  playerWidth={playerWidth}
                  metricColMinWidth={metricColMinWidth}
                  metrics={metrics}
                  sortKey={sortKey}
                  onSortChange={onSortChange}
                />
              </thead>
              <tbody>
                {(sortedRows ?? []).map((row, idx) => {
                  const hasRomanName = row.romanName && row.romanName.trim()
                  const shouldShowHeader = idx > 0 && idx % 15 === 0
                  
                  return (
                    <Fragment key={`row-${row.playerId}-${idx}`}>
                      {/* 15行ごとにヘッダー行を表示 */}
                      {shouldShowHeader && (
                        <RankingTableHeaderRow
                          key={`header-${idx}`}
                          variant="repeat"
                          leftBlockWidth={leftBlockWidth}
                          playerWidth={playerWidth}
                          metricColMinWidth={metricColMinWidth}
                          metrics={metrics}
                          sortKey={sortKey}
                          onSortChange={onSortChange}
                        />
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
                            <span className="bebas tabular-nums text-lg font-normal tracking-[-0.01em] text-white">{row.rank}</span>
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
                            <span className={`bebas tabular-nums ${metricValueTextClass} font-normal tracking-[-0.01em] text-white`}>
                              {formattedValue}
                            </span>
                          </td>
                        )
                      })}
                      </tr>
                      {qualifyingDividerAfterRank != null &&
                        row.rank === qualifyingDividerAfterRank && (
                          <tr key={`qual-divider-${row.playerId}-${idx}`} aria-hidden>
                            <td
                              colSpan={metrics.length + 1}
                              className="p-0 leading-none"
                              style={{ height: 0, border: "none" }}
                            >
                              <div
                                className="h-[3px] w-full"
                                style={{ backgroundColor: "#ffff44" }}
                              />
                            </td>
                          </tr>
                        )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div
            ref={bottomScrollRef}
            onScroll={() => syncRankingTableScroll("bottom")}
            className="overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x max-w-full border-t border-[#444] bg-[#141414]"
            style={{ WebkitOverflowScrolling: "touch", height: 22 }}
            aria-label="表の横スクロール"
          >
            <div style={{ width: `${tableMinWidthPx}px`, height: 1 }} aria-hidden />
          </div>
        </div>
    </>
  )

  const debugBlock =
    process.env.NODE_ENV === "development" && viewModel.debug ? (
      <div className="container mx-auto px-4 py-2 border-t border-[#333] text-xs text-gray-500">
        <div>DataSource: {viewModel.debug.csvPath || "N/A"}</div>
        <div>
          Duplicates: {viewModel.debug.duplicatePlayerIdCount} ids / {viewModel.debug.duplicateRowCount} rows
        </div>
      </div>
    ) : null

  if (embedInShell) {
    return (
      <>
        {tableBlock}
        {debugBlock}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]"
        style={{ zIndex: 300 }}
      >
        <div className="container mx-auto px-4 py-1 border-b border-[#333] flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-1 p-1 hover:opacity-80 transition-opacity text-[#ffff44]"
            aria-label="戻る"
          >
            <span className="text-sm">←</span>
          </button>

          <Link href={SITE_TOP_HREF} className="absolute left-1/2 transform -translate-x-1/2">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-7 h-7 cursor-pointer hover:opacity-80 transition-opacity"
            />
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
        {headerNavBlock}
        {titleBlock}
        {tableBlock}
      </main>
      {debugBlock}
    </div>
  )
}

