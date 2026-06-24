"use client"

import dynamic from "next/dynamic"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { PitcherSeasonPitchTypesApiResponse } from "@/app/api/players/[playerId]/season-pitch-types/route"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import type {
  PitcherSeasonPocPaAgg,
  PitcherSeasonPocPayload,
  PitcherSeasonPitchingApiResponse,
} from "@/lib/pitcherSeasonPocTypes"
import { pitcherPocHandCells } from "@/lib/pitcherSeasonPocUi"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })
const PitchTypeChartLegend = dynamic(
  () => import("@/app/components/PitchTypePieChart").then((m) => ({ default: m.PitchTypeChartLegend })),
  { ssr: false },
)

/** デスクトップ向け円グラフ縮小（モバイルでは CSS zoom を使わない） */
const PROBABLES_PITCH_CHART_ZOOM = 0.7 * 0.7 * 1.2 * 0.9
/** 凡例スケールの基準幅（11rem×2 + gap-8） */
const PROBABLES_CHARTS_ROW_REF_PX = 11 * 16 * 2 + 32
/** モバイルは全幅、sm 以上は基準最大幅 */
const PROBABLES_PITCH_DIALOG_CLASS =
  "w-full max-w-[calc(100%-2rem)] gap-0 border border-[#555] bg-black p-3 text-white shadow-md overflow-visible sm:max-w-[min(96vw,56rem)]"

function probablesSideTooltipTriggerClass(): string {
  return "flex h-[14px] min-w-[14px] items-center justify-center border border-gray-500 px-0.5 text-[9px] font-semibold text-gray-400 hover:border-gray-300 hover:text-gray-200 transition-colors leading-none shrink-0"
}

function useMinWidthSm(): boolean {
  const [matches, setMatches] = useState(false)
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)")
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return matches
}

/** モバイル: グラフ行の実幅に合わせて凡例などを縮小 */
function useOverlayLegendScale(
  chartsRowRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  isDesktop: boolean,
): number {
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    if (!active || isDesktop) {
      setScale(1)
      return
    }
    const row = chartsRowRef.current
    if (!row) return

    const update = () => {
      const width = row.clientWidth
      if (width <= 0) return
      const next = Math.min(1, width / PROBABLES_CHARTS_ROW_REF_PX)
      setScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(row)
    return () => ro.disconnect()
  }, [active, isDesktop, chartsRowRef])

  return scale
}

function donutCenterStats(agg: PitcherSeasonPocPaAgg | undefined) {
  if (!agg || agg.bf <= 0) return undefined
  const cells = pitcherPocHandCells(agg)
  return { avgAgainst: cells[5], kBbPct: cells[2] }
}

export function ProbablesPitchDataOverlay({
  pitcherPublicId,
  season,
}: {
  pitcherPublicId: string | null
  season: number
  opponentStripeSide: "left" | "right"
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pitchTypes, setPitchTypes] = useState<PitcherSeasonPitchTypesPayload | null>(null)
  const [pocPayload, setPocPayload] = useState<PitcherSeasonPocPayload | null>(null)
  const [fetched, setFetched] = useState(false)

  const loadData = useCallback(async () => {
    if (fetched || !pitcherPublicId) return
    setLoading(true)
    try {
      const base = `/api/players/${encodeURIComponent(pitcherPublicId)}`
      const yearQ = `year=${encodeURIComponent(String(season))}`
      const [typesRes, pitchingRes] = await Promise.all([
        fetch(`${base}/season-pitch-types?${yearQ}`, { cache: "no-store" }),
        fetch(`${base}/season-pitching?${yearQ}`, { cache: "no-store" }),
      ])
      const typesJson = typesRes.ok
        ? ((await typesRes.json()) as PitcherSeasonPitchTypesApiResponse)
        : null
      const pitchingJson = pitchingRes.ok
        ? ((await pitchingRes.json()) as PitcherSeasonPitchingApiResponse)
        : null
      setPitchTypes(typesJson?.hasData && typesJson.payload ? typesJson.payload : null)
      setPocPayload(pitchingJson?.hasData && pitchingJson.payload ? pitchingJson.payload : null)
    } catch {
      setPitchTypes(null)
      setPocPayload(null)
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }, [fetched, pitcherPublicId, season])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      if (pitcherPublicId) void loadData()
      else setFetched(true)
    }
  }

  const seasonRows = pitchTypes?.rows ?? []
  const colorOrder = seasonRows.map((r) => r.pitch_type)
  const toChart = (pctKey: "pct_vs_left" | "pct_vs_right") =>
    seasonRows
      .map((r) => ({
        pitch_type: r.pitch_type,
        pitches: r.pitches,
        pct: r[pctKey] ?? 0,
      }))
      .filter((r) => r.pct > 0)
  const leftRows = toChart("pct_vs_left")
  const rightRows = toChart("pct_vs_right")
  const vsHand = pocPayload?.splits?.vsHand
  const showCharts = seasonRows.length > 0 && (leftRows.length > 0 || rightRows.length > 0)
  const isDesktop = useMinWidthSm()
  const chartsRowRef = useRef<HTMLDivElement>(null)
  const legendScale = useOverlayLegendScale(chartsRowRef, open && showCharts && !loading, isDesktop)
  const chartZoomStyle = isDesktop ? { zoom: PROBABLES_PITCH_CHART_ZOOM } : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className={probablesSideTooltipTriggerClass()} aria-label="投球データ">
          球
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton className={PROBABLES_PITCH_DIALOG_CLASS}>
        <DialogTitle className="sr-only">投球データ</DialogTitle>
        {loading && !fetched && pitcherPublicId ? (
          <div className="flex justify-center py-4">
            <Spinner className="size-6 text-[#FFFF44]" />
          </div>
        ) : showCharts ? (
          <div className="w-full">
            <div className="mx-auto w-fit origin-top-left" style={chartZoomStyle}>
              <div
                ref={chartsRowRef}
                className="flex w-full flex-row flex-nowrap items-start justify-center gap-2 sm:w-fit sm:gap-8"
              >
                {leftRows.length > 0 ? (
                  <div className="min-w-0 max-w-[9rem] flex-1 shrink sm:w-[11rem] sm:flex-none">
                    <PitchTypePieChart
                      title="対左"
                      rows={leftRows}
                      centerStats={vsHand ? donutCenterStats(vsHand.vsL) : undefined}
                      pitchTypeColorOrder={colorOrder}
                      compact
                      isAnimationActive={open}
                    />
                  </div>
                ) : null}
                {rightRows.length > 0 ? (
                  <div className="min-w-0 max-w-[9rem] flex-1 shrink sm:w-[11rem] sm:flex-none">
                    <PitchTypePieChart
                      title="対右"
                      rows={rightRows}
                      centerStats={vsHand ? donutCenterStats(vsHand.vsR) : undefined}
                      pitchTypeColorOrder={colorOrder}
                      compact
                      isAnimationActive={open}
                    />
                  </div>
                ) : null}
              </div>
              <PitchTypeChartLegend
                pitchTypes={colorOrder}
                pitchTypeColorOrder={colorOrder}
                scale={legendScale}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
