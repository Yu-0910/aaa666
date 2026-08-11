"use client"

import type { ReactNode } from "react"
import type { PitcherSeasonPocPitchTypesSplitRow } from "@/lib/pitcherSeasonPocTypes"

const PALETTE = ["#3575ef", "#1fad53", "#ea900c", "#a149f0", "#e53b3b", "#05a8c4", "#dfa707"] as const

/** 左ラベル列 + gap-1（行レイアウトと一致） */
export const PITCH_TYPE_BAR_AREA_LEFT = "calc(46px + 0.25rem)"
const BAR_AREA_LEFT = PITCH_TYPE_BAR_AREA_LEFT

/** 横軸 0〜100% の縦グリッド（25% 刻み・全行共通の背景レイヤー） */
const PCT_GRID_LINES = [0, 25, 50, 75, 100] as const
const PCT_GRID_COLOR = "#d0d0d0"
const PCT_AXIS_LABEL_COLOR = "#9ca3af"
const TRACK_BG = "#111"
/** 軸ラベルと被らないよう、グリッド下端を少し上げる（px） */
const GRID_LINE_BOTTOM_INSET_PX = 4

type BarPart = {
  key: string
  label: string
  pct: number
  color: string
}

/** 12 行ぶんの棒エリアに一本で通る縦グリッド */
function UnifiedPercentGridBackground() {
  return (
    <div
      className="pointer-events-none absolute top-0 right-0 bottom-0 z-0"
      style={{ left: BAR_AREA_LEFT, backgroundColor: TRACK_BG }}
      aria-hidden
    >
      {PCT_GRID_LINES.map((pct) => (
        <div
          key={pct}
          className="absolute top-0"
          style={{
            width: 1,
            bottom: GRID_LINE_BOTTOM_INSET_PX,
            ...(pct === 100 ? { right: 0 } : { left: `${pct}%` }),
            backgroundColor: PCT_GRID_COLOR,
          }}
        />
      ))}
    </div>
  )
}

function PercentAxisLabels() {
  return (
    <div className="mt-1 flex items-start gap-1">
      <div className="w-[46px] shrink-0" aria-hidden />
      <div className="relative min-w-0 flex-1 h-3.5">
        {PCT_GRID_LINES.map((pct) => (
          <span
            key={pct}
            className="absolute top-0 text-[10px] font-normal tabular-nums leading-none"
            style={{
              color: PCT_AXIS_LABEL_COLOR,
              ...(pct === 0
                ? { left: 0 }
                : pct === 100
                  ? { right: 0 }
                  : { left: `${pct}%`, transform: "translateX(-50%)" }),
            }}
          >
            {pct}%
          </span>
        ))}
      </div>
    </div>
  )
}

function PitchTypeStackedBarTrack({
  parts,
  className = "h-7",
}: {
  parts: BarPart[]
  className?: string
}) {
  return (
    <div className={`relative z-[1] overflow-hidden border-y border-[#555] bg-transparent ${className}`}>
      <div className="flex h-full w-full">
        {parts.map((p) => (
          <div
            key={p.key}
            title={`${p.label}: ${p.pct.toFixed(1)}%`}
            className="h-full"
            style={{
              width: `${p.pct.toFixed(1)}%`,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export type PitchTypeSplitStackedBarSectionProps = {
  splits: PitcherSeasonPocPitchTypesSplitRow[]
  /** 左ラベル列の key 順（JSON に無い key は空バー） */
  orderedKeys: readonly string[]
  renderRowLabel?: (row: PitcherSeasonPocPitchTypesSplitRow | null, key: string) => ReactNode
  /** 行を上から順にフェードイン（サイドパネル展開時） */
  staggerRowReveal?: boolean
  /** staggerRowReveal の遅延基準（開くたびにインクリメントして再再生） */
  revealGeneration?: number
  /** ベースグラフと同色（対左右派生）。省略時は当該 splits から自動割当 */
  colorByType?: ReadonlyMap<string, string>
  /** colorByType 指定時の凡例順（省略時は自 splits から算出） */
  typeOrder?: readonly string[]
  /** 左ラベル列（0-0 等）のクラス。省略時は text-[12px] */
  rowLabelClassName?: string
  /** 棒グラフ本体の高さクラス。省略時は h-7 */
  barTrackClassName?: string
  /** 各行の余白クラス。省略時は mb-3 */
  rowWrapperClassName?: string
  /** 凡例を表示するか。省略時は表示 */
  showLegend?: boolean
}

export function PitchTypeColorLegend({
  typeOrder,
  colorByType,
}: {
  typeOrder: readonly string[]
  colorByType: ReadonlyMap<string, string>
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
      {typeOrder.length > 0 ? (
        typeOrder.map((label) => (
          <div key={label} className="flex items-center gap-1 whitespace-nowrap">
            <span
              className="inline-block w-2 h-2"
              style={{ backgroundColor: colorByType.get(label) ?? PALETTE[0] }}
            />
            <span className="text-gray-300">{label}</span>
          </div>
        ))
      ) : (
        <span>—</span>
      )}
    </div>
  )
}

/** 球種別の色割当（投球数の多い順にパレットを割り当て） */
export function buildPitchTypeColorMap(splits: PitcherSeasonPocPitchTypesSplitRow[]) {
  const allTypes = new Map<string, number>()
  for (const split of splits) {
    for (const row of split.rows) {
      allTypes.set(row.pitch_type, (allTypes.get(row.pitch_type) ?? 0) + row.pitches)
    }
  }
  const typeOrder = [...allTypes.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  const colorByType = new Map(typeOrder.map((t, i) => [t, PALETTE[i % PALETTE.length]!] as const))
  return { typeOrder, colorByType }
}

export function PitchTypeSplitStackedBarSection({
  splits,
  orderedKeys,
  renderRowLabel,
  staggerRowReveal = false,
  revealGeneration = 0,
  colorByType: colorByTypeProp,
  typeOrder: typeOrderProp,
  rowLabelClassName = "pitch-type-split-row-label text-[12px] text-gray-200 font-black tabular-nums leading-tight",
  barTrackClassName,
  rowWrapperClassName = "mb-3",
  showLegend = true,
}: PitchTypeSplitStackedBarSectionProps) {
  if (splits.length === 0) return null

  const byKey = new Map(splits.map((s) => [s.key, s] as const))
  const localMap = buildPitchTypeColorMap(splits)
  const colorByType = colorByTypeProp ?? localMap.colorByType
  const baseTypeOrder = typeOrderProp ?? localMap.typeOrder
  const typesInChart = new Set(splits.flatMap((s) => s.rows.map((r) => r.pitch_type)))
  const legendTypeOrder = colorByTypeProp
    ? baseTypeOrder.filter((t) => typesInChart.has(t))
    : baseTypeOrder

  return (
    <>
      <div className="relative">
        <UnifiedPercentGridBackground />

        {orderedKeys.map((key, rowIdx) => {
          const row = byKey.get(key) ?? null
          const parts: BarPart[] =
            row && row.pitches_total > 0
              ? row.rows
                  .slice()
                  .sort((a, b) => b.pct - a.pct)
                  .map((r) => ({
                    key: `${key}-${r.pitch_type}`,
                    label: r.pitch_type,
                    pct: Math.max(0, Math.min(100, r.pct)),
                    color: colorByType.get(r.pitch_type) ?? PALETTE[0],
                  }))
              : []

          return (
            <div
              key={`${revealGeneration}-${key}`}
              className={`${rowWrapperClassName}${staggerRowReveal ? " pitch-type-side-row-emerge" : ""}`}
              style={
                staggerRowReveal
                  ? { animationDelay: `${Math.min(rowIdx, 11) * 34 + 60}ms` }
                  : undefined
              }
            >
              <div className="flex items-center gap-1">
                <div className={`w-[46px] shrink-0 text-center ${rowLabelClassName}`}>
                  {renderRowLabel ? renderRowLabel(row, key) : (row?.label ?? key)}
                </div>
                <div className="min-w-0 flex-1">
                  <PitchTypeStackedBarTrack parts={parts} className={barTrackClassName} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <PercentAxisLabels />

      {showLegend ? <PitchTypeColorLegend typeOrder={legendTypeOrder} colorByType={colorByType} /> : null}
    </>
  )
}
