"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  buildPitchTypeColorMap,
  PITCH_TYPE_BAR_AREA_LEFT,
  PitchTypeSplitStackedBarSection,
} from "@/app/components/PitchTypeSplitStackedBarSection"
import { ORDERED_PITCH_COUNT_KEYS } from "@/lib/yahooGame/pitchCountSim"
import type { PitcherSeasonPocPayload, PitcherSeasonPocPitchTypesSplitRow } from "@/lib/pitcherSeasonPocTypes"
import type { PitcherSeasonPitchTypeRow } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import {
  PA_ROUND_ORDERED_KEYS,
  resolvePaRoundPitchTypeSplits,
} from "@/lib/pitcherSeasonPocUi"

export type PitchTypeVsHandPanelOpenState = {
  leftOpen: boolean
  rightOpen: boolean
}

export type PitchTypeVsHandPanelsOpenState = {
  paRound: PitchTypeVsHandPanelOpenState
  count: PitchTypeVsHandPanelOpenState
}

export const EMPTY_PITCH_TYPE_VS_HAND_PANELS: PitchTypeVsHandPanelsOpenState = {
  paRound: { leftOpen: false, rightOpen: false },
  count: { leftOpen: false, rightOpen: false },
}

type Props = {
  tb: string
  sectionStripeColor: string
  pitcherSeasonPocPayload: PitcherSeasonPocPayload | null
  seasonRows: PitcherSeasonPitchTypeRow[] | null | undefined
  gameRows: { pitch_type: string; pct: number }[]
  countSplits: PitcherSeasonPocPitchTypesSplitRow[] | null | undefined
  /** 対左右球種データあり: 左＝対左、右＝対右を折りたたみ表示（巡目別・カウント別とも） */
  sidePanelPilot?: boolean
  vsHandPanels?: PitchTypeVsHandPanelsOpenState
  onVsHandPanelToggle?: (section: "paRound" | "count", side: "left" | "right") => void
  /** 初回の球種情報表示時のみ展開・行アニメーションを再生 */
  chartRevealAnimate?: boolean
}

function PaRoundRowLabel({ keyName }: { keyName: string }) {
  if (keyName === "5") {
    return (
      <>
        5巡目
        <br />
        ～
      </>
    )
  }
  return <>{`${keyName}巡目`}</>
}

function PitchTypeSectionHeading({
  tb,
  sectionStripeColor,
  title,
  trailing,
  showStripe = true,
  highlight = false,
}: {
  tb: string
  sectionStripeColor: string
  title: string
  trailing?: ReactNode
  /** 対左右の展開見出しなど、球団帯を付けないとき false */
  showStripe?: boolean
  /** 対右・対左の展開見出しを黄色背景で強調 */
  highlight?: boolean
}) {
  return (
    <div className="mb-4 mt-8 flex items-start justify-between gap-3">
      <h2
        className={`${tb} min-w-0 flex-1 ${showStripe ? "pl-4" : "pl-0"}`}
        style={{
          borderLeft: showStripe ? `6px solid ${sectionStripeColor}` : undefined,
          fontWeight: 900,
          ...(highlight
            ? {
                display: "inline-flex",
                flex: "0 0 auto",
                backgroundColor: "#FFFF44",
                color: "#000000",
                padding: "0.15rem 0.55rem",
                borderRadius: "2px",
              }
            : {}),
        }}
      >
        {title}
      </h2>
      {trailing}
    </div>
  )
}

export function PitchTypeSidePanelToggle({
  leftOpen,
  rightOpen,
  onLeftToggle,
  onRightToggle,
  leftDisabled,
  rightDisabled,
  ariaLabel,
  leftTitle,
  rightTitle,
}: {
  leftOpen: boolean
  rightOpen: boolean
  onLeftToggle: () => void
  onRightToggle: () => void
  leftDisabled?: boolean
  rightDisabled?: boolean
  ariaLabel: string
  leftTitle: string
  rightTitle: string
}) {
  return (
    <div
      className="relative isolate z-20 flex min-h-9 shrink-0 items-stretch overflow-hidden"
      style={{
        border: "1px solid #888",
        backgroundColor: "#1a1a1a",
        minWidth: "5.25rem",
        boxShadow: "0 0 0 1px rgba(255,255,68,0.15)",
      }}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        disabled={leftDisabled}
        onClick={onLeftToggle}
        className="relative z-10 m-0 flex min-h-8 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap rounded-none border-0 bg-transparent px-2 py-1 text-[11px] font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:text-gray-600"
        style={{
          backgroundColor: leftOpen ? "#FFFF44" : "transparent",
          color: leftOpen ? "#000000" : leftDisabled ? "#6b7280" : "#9ca3af",
        }}
        aria-pressed={leftOpen}
        title={leftTitle}
      >
        左
      </button>
      <button
        type="button"
        disabled={rightDisabled}
        onClick={onRightToggle}
        className="relative z-10 m-0 flex min-h-8 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap rounded-none border-0 bg-transparent px-2 py-1 text-[11px] font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:text-gray-600"
        style={{
          backgroundColor: rightOpen ? "#FFFF44" : "transparent",
          color: rightOpen ? "#000000" : rightDisabled ? "#6b7280" : "#9ca3af",
        }}
        aria-pressed={rightOpen}
        title={rightTitle}
      >
        右
      </button>
    </div>
  )
}

function PitchTypeSidePanelReveal({
  open,
  sectionStripeColor,
  revealGeneration,
  animate,
  children,
}: {
  open: boolean
  sectionStripeColor: string
  revealGeneration: number
  animate: boolean
  children: ReactNode
}) {
  return (
    <div
      className={
        animate
          ? "pitch-type-side-panel-reveal-grid grid transition-[grid-template-rows] duration-[440ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          : "grid"
      }
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className="pointer-events-none -mt-1 mb-2 flex h-3 items-end"
          style={{ marginLeft: PITCH_TYPE_BAR_AREA_LEFT }}
          aria-hidden
        >
          <div
            className="h-full w-0.5 rounded-full opacity-80"
            style={{
              background: `linear-gradient(to bottom, ${sectionStripeColor}, rgba(255,255,255,0.08))`,
            }}
          />
          <div
            className="mb-0.5 h-px flex-1 opacity-60"
            style={{
              background: `linear-gradient(to right, ${sectionStripeColor}55, transparent 72%)`,
            }}
          />
        </div>
        <div
          key={animate ? `panel-emerge-${revealGeneration}` : "panel-static"}
          className={open && animate ? "pitch-type-side-panel-emerge" : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function useRevealGeneration(open: boolean) {
  const [generation, setGeneration] = useState(0)
  const prevOpen = useRef<boolean | null>(null)

  useEffect(() => {
    if (open && prevOpen.current === false) {
      setGeneration((g) => g + 1)
    }
    prevOpen.current = open
  }, [open])

  return generation
}

function hasPitchTypeSplits(rows: PitcherSeasonPocPitchTypesSplitRow[] | null | undefined): boolean {
  return rows != null && rows.length > 0 && rows.some((r) => r.pitches_total > 0)
}

function resolveCountPitchTypeSplits(
  payload: PitcherSeasonPocPayload | null | undefined,
  field: "byCountPitchTypesVsL" | "byCountPitchTypesVsR",
): PitcherSeasonPocPitchTypesSplitRow[] | null {
  const rows = payload?.splits?.[field]
  return hasPitchTypeSplits(rows) ? rows! : null
}

type PitchTypeColorMap = ReturnType<typeof buildPitchTypeColorMap>

export function PaRoundPitchTypeChart({
  splits,
  staggerRowReveal,
  revealGeneration,
  baseColorMap,
  renderRowLabel,
  rowLabelClassName,
  barTrackClassName,
  rowWrapperClassName,
  showLegend,
  chartClassName,
  chartStyle,
}: {
  splits: PitcherSeasonPocPitchTypesSplitRow[] | null
  staggerRowReveal?: boolean
  revealGeneration?: number
  /** 対左右派生: ベース（巡目別）グラフの球種色 */
  baseColorMap?: PitchTypeColorMap | null
  renderRowLabel?: (row: PitcherSeasonPocPitchTypesSplitRow | null, key: string) => ReactNode
  rowLabelClassName?: string
  barTrackClassName?: string
  rowWrapperClassName?: string
  showLegend?: boolean
  chartClassName?: string
  chartStyle?: CSSProperties
}) {
  if (splits == null) {
    return <span className="text-sm text-gray-400">—</span>
  }
  return (
    <PitchTypeSplitStackedBarSection
      splits={splits}
      orderedKeys={PA_ROUND_ORDERED_KEYS}
      renderRowLabel={renderRowLabel ?? ((_, key) => <PaRoundRowLabel keyName={key} />)}
      staggerRowReveal={staggerRowReveal}
      revealGeneration={revealGeneration}
      colorByType={baseColorMap?.colorByType}
      typeOrder={baseColorMap?.typeOrder}
      rowLabelClassName={rowLabelClassName}
      barTrackClassName={barTrackClassName}
      rowWrapperClassName={rowWrapperClassName}
      showLegend={showLegend}
      chartClassName={chartClassName}
      chartStyle={chartStyle}
    />
  )
}

export function CountPitchTypeChart({
  splits,
  staggerRowReveal,
  revealGeneration,
  baseColorMap,
  rowLabelClassName = "pitch-type-split-row-label text-[13px] text-gray-200 font-black tabular-nums leading-tight",
}: {
  splits: PitcherSeasonPocPitchTypesSplitRow[] | null
  staggerRowReveal?: boolean
  revealGeneration?: number
  /** 対左右派生: ベース（カウント別）グラフの球種色 */
  baseColorMap?: PitchTypeColorMap | null
  rowLabelClassName?: string
}) {
  if (splits == null) {
    return <span className="text-sm text-gray-400">—</span>
  }
  return (
    <PitchTypeSplitStackedBarSection
      splits={splits}
      orderedKeys={ORDERED_PITCH_COUNT_KEYS}
      staggerRowReveal={staggerRowReveal}
      revealGeneration={revealGeneration}
      colorByType={baseColorMap?.colorByType}
      typeOrder={baseColorMap?.typeOrder}
      rowLabelClassName={rowLabelClassName}
    />
  )
}

/** ベース表示＋対左右折りたたみ（巡目別・カウント別で共通） */
export function PitchTypeVsHandSplitBlock({
  tb,
  sectionStripeColor,
  title,
  titleVsL,
  titleVsR,
  sidePanelPilot,
  hasVsLSplits,
  hasVsRSplits,
  hintText,
  toggleAriaLabel,
  leftTitle,
  rightTitle,
  leftOpen,
  rightOpen,
  onLeftToggle,
  onRightToggle,
  renderBaseChart,
  renderVsLChart,
  renderVsRChart,
  chartRevealAnimate,
  showBaseTitle = true,
}: {
  tb: string
  sectionStripeColor: string
  title: string
  titleVsL: string
  titleVsR: string
  sidePanelPilot: boolean
  hasVsLSplits: boolean
  hasVsRSplits: boolean
  hintText: string
  toggleAriaLabel: string
  leftTitle: string
  rightTitle: string
  leftOpen: boolean
  rightOpen: boolean
  onLeftToggle: () => void
  onRightToggle: () => void
  renderBaseChart: () => ReactNode
  renderVsLChart: (stagger: boolean, generation: number) => ReactNode
  renderVsRChart: (stagger: boolean, generation: number) => ReactNode
  chartRevealAnimate: boolean
  /** false のときベース見出し（title）を描画しない（グラフのみ） */
  showBaseTitle?: boolean
}) {
  const leftRevealGeneration = useRevealGeneration(leftOpen && chartRevealAnimate)
  const rightRevealGeneration = useRevealGeneration(rightOpen && chartRevealAnimate)
  const sidePanelOpen = leftOpen || rightOpen

  if (!sidePanelPilot) {
    return (
      <>
        {showBaseTitle ? (
          <PitchTypeSectionHeading tb={tb} sectionStripeColor={sectionStripeColor} title={title} />
        ) : null}
        <div className={showBaseTitle ? "mb-12" : sidePanelOpen ? "mb-2" : "mb-8"}>
          {renderBaseChart()}
        </div>
      </>
    )
  }

  return (
    <>
      {showBaseTitle ? (
        <PitchTypeSectionHeading
          tb={tb}
          sectionStripeColor={sectionStripeColor}
          title={title}
          trailing={
            <PitchTypeSidePanelToggle
              leftOpen={leftOpen && hasVsLSplits}
              rightOpen={rightOpen && hasVsRSplits}
              onLeftToggle={onLeftToggle}
              onRightToggle={onRightToggle}
              leftDisabled={!hasVsLSplits}
              rightDisabled={!hasVsRSplits}
              ariaLabel={toggleAriaLabel}
              leftTitle={leftTitle}
              rightTitle={rightTitle}
            />
          }
        />
      ) : null}
      <div className={sidePanelOpen ? "mb-2" : showBaseTitle ? "mb-12" : "mb-8"}>
        {renderBaseChart()}
      </div>

      {hasVsLSplits || hasVsRSplits ? (
        <p
          className={`-mt-6 mb-2 overflow-hidden text-[11px] text-gray-500 ${
            chartRevealAnimate
              ? "transition-all duration-300 ease-out motion-reduce:transition-none"
              : ""
          } ${sidePanelOpen ? "max-h-0 opacity-0" : "max-h-8 opacity-100"}`}
        >
          {hintText}
        </p>
      ) : null}

      {hasVsRSplits ? (
        <PitchTypeSidePanelReveal
          open={rightOpen}
          sectionStripeColor={sectionStripeColor}
          revealGeneration={rightRevealGeneration}
          animate={chartRevealAnimate}
        >
          <PitchTypeSectionHeading
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            title={titleVsR}
            showStripe={false}
            highlight
          />
          <div className={leftOpen ? "mb-2" : "mb-12"}>
            {renderVsRChart(chartRevealAnimate && sidePanelPilot && rightOpen, rightRevealGeneration)}
          </div>
        </PitchTypeSidePanelReveal>
      ) : null}

      {hasVsLSplits ? (
        <PitchTypeSidePanelReveal
          open={leftOpen}
          sectionStripeColor={sectionStripeColor}
          revealGeneration={leftRevealGeneration}
          animate={chartRevealAnimate}
        >
          <PitchTypeSectionHeading
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            title={titleVsL}
            showStripe={false}
            highlight
          />
          <div className="mb-12">
            {renderVsLChart(chartRevealAnimate && sidePanelPilot && leftOpen, leftRevealGeneration)}
          </div>
        </PitchTypeSidePanelReveal>
      ) : null}
    </>
  )
}

export function PitchTypeSplitViewsSection({
  tb,
  sectionStripeColor,
  pitcherSeasonPocPayload,
  seasonRows,
  gameRows,
  countSplits,
  sidePanelPilot = false,
  vsHandPanels = EMPTY_PITCH_TYPE_VS_HAND_PANELS,
  onVsHandPanelToggle,
  chartRevealAnimate = true,
}: Props) {
  const gameFallback = gameRows.length > 0 ? gameRows : null
  const paRoundSplits = resolvePaRoundPitchTypeSplits(
    pitcherSeasonPocPayload,
    seasonRows,
    gameFallback,
    "byPaRoundPitchTypes",
  )
  const paRoundVsLSplits = resolvePaRoundPitchTypeSplits(
    pitcherSeasonPocPayload,
    seasonRows,
    gameFallback,
    "byPaRoundPitchTypesVsL",
  )
  const paRoundVsRSplits = resolvePaRoundPitchTypeSplits(
    pitcherSeasonPocPayload,
    seasonRows,
    gameFallback,
    "byPaRoundPitchTypesVsR",
  )
  const countVsLSplits = resolveCountPitchTypeSplits(pitcherSeasonPocPayload, "byCountPitchTypesVsL")
  const countVsRSplits = resolveCountPitchTypeSplits(pitcherSeasonPocPayload, "byCountPitchTypesVsR")

  const hasCountSplits = hasPitchTypeSplits(countSplits)
  const hasPaRoundVsL = paRoundVsLSplits != null
  const hasPaRoundVsR = paRoundVsRSplits != null
  const hasCountVsL = countVsLSplits != null
  const hasCountVsR = countVsRSplits != null

  const paRoundColorMap = paRoundSplits?.length ? buildPitchTypeColorMap(paRoundSplits) : null
  const countColorMap =
    countSplits?.length && hasPitchTypeSplits(countSplits)
      ? buildPitchTypeColorMap(countSplits)
      : null

  return (
    <>
      <PitchTypeVsHandSplitBlock
        tb={tb}
        sectionStripeColor={sectionStripeColor}
        title="巡目別の球種一覧"
        titleVsL="対左"
        titleVsR="対右"
        sidePanelPilot={sidePanelPilot}
        hasVsLSplits={hasPaRoundVsL}
        hasVsRSplits={hasPaRoundVsR}
        leftOpen={vsHandPanels.paRound.leftOpen}
        rightOpen={vsHandPanels.paRound.rightOpen}
        onLeftToggle={() => onVsHandPanelToggle?.("paRound", "left")}
        onRightToggle={() => onVsHandPanelToggle?.("paRound", "right")}
        hintText="左・右を押すと対左／対右の巡目別球種一覧を表示します"
        toggleAriaLabel="巡目別球種の対左右表示切替"
        leftTitle="巡目別の球種一覧（対左打者）を表示"
        rightTitle="巡目別の球種一覧（対右打者）を表示"
        renderBaseChart={() => <PaRoundPitchTypeChart splits={paRoundSplits} />}
        renderVsLChart={(stagger, generation) => (
          <PaRoundPitchTypeChart
            splits={paRoundVsLSplits}
            staggerRowReveal={stagger}
            revealGeneration={generation}
            baseColorMap={paRoundColorMap}
            rowLabelClassName="pitch-type-split-row-label text-[10px] text-gray-200 font-black tabular-nums leading-tight"
            barTrackClassName="h-6"
            rowWrapperClassName="mb-[10px]"
            chartClassName="pitch-type-pa-round-vs-hand-chart"
            chartStyle={{ width: "125%", maxWidth: "none" }}
          />
        )}
        renderVsRChart={(stagger, generation) => (
          <PaRoundPitchTypeChart
            splits={paRoundVsRSplits}
            staggerRowReveal={stagger}
            revealGeneration={generation}
            baseColorMap={paRoundColorMap}
            rowLabelClassName="pitch-type-split-row-label text-[10px] text-gray-200 font-black tabular-nums leading-tight"
            barTrackClassName="h-6"
            rowWrapperClassName="mb-[10px]"
            chartClassName="pitch-type-pa-round-vs-hand-chart"
            chartStyle={{ width: "125%", maxWidth: "none" }}
          />
        )}
        chartRevealAnimate={chartRevealAnimate}
      />

      {hasCountSplits ? (
        <PitchTypeVsHandSplitBlock
          tb={tb}
          sectionStripeColor={sectionStripeColor}
          title="カウント別の球種一覧"
          titleVsL="対左"
          titleVsR="対右"
          sidePanelPilot={sidePanelPilot}
          hasVsLSplits={hasCountVsL}
          hasVsRSplits={hasCountVsR}
          leftOpen={vsHandPanels.count.leftOpen}
          rightOpen={vsHandPanels.count.rightOpen}
          onLeftToggle={() => onVsHandPanelToggle?.("count", "left")}
          onRightToggle={() => onVsHandPanelToggle?.("count", "right")}
          hintText="左・右を押すと対左／対右のカウント別球種一覧を表示します"
          toggleAriaLabel="カウント別球種の対左右表示切替"
          leftTitle="カウント別の球種一覧（対左打者）を表示"
          rightTitle="カウント別の球種一覧（対右打者）を表示"
          renderBaseChart={() => <CountPitchTypeChart splits={countSplits ?? null} />}
          renderVsLChart={(stagger, generation) => (
            <CountPitchTypeChart
              splits={countVsLSplits}
              staggerRowReveal={stagger}
              revealGeneration={generation}
              baseColorMap={countColorMap}
            />
          )}
          renderVsRChart={(stagger, generation) => (
            <CountPitchTypeChart
              splits={countVsRSplits}
              staggerRowReveal={stagger}
              revealGeneration={generation}
              baseColorMap={countColorMap}
            />
          )}
          chartRevealAnimate={chartRevealAnimate}
        />
      ) : null}
    </>
  )
}
