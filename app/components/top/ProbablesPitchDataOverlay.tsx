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

/** 円グラフの表示倍率（基準から積み上げ。直近は1.2倍、全体は9割） */
const PROBABLES_PITCH_CHART_ZOOM = 0.7 * 0.7 * 1.2 * 0.9
/** ダイアログ横の最大幅（96vw / 56rem 基準の7割） */
const PROBABLES_PITCH_DIALOG_CLASS =
  "w-full max-w-[min(67.2vw,39.2rem)] gap-0 border border-[#555] bg-black p-3 text-white shadow-md overflow-hidden sm:max-w-[min(67.2vw,39.2rem)]"

/** ダイアログ幅に収まるよう、ベース zoom に掛ける追加倍率を算出 */
function useContainerFitZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
) {
  const [fitFactor, setFitFactor] = useState(1)
  const fitFactorRef = useRef(1)
  fitFactorRef.current = fitFactor

  useLayoutEffect(() => {
    if (!active) {
      fitFactorRef.current = 1
      setFitFactor(1)
      return
    }
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const update = () => {
      const available = container.clientWidth
      const scaled = content.scrollWidth
      const unscaled = scaled / fitFactorRef.current
      if (available <= 0 || unscaled <= 0) return
      const next = Math.min(1, available / unscaled)
      if (Math.abs(fitFactorRef.current - next) < 0.005) return
      fitFactorRef.current = next
      setFitFactor(next)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    ro.observe(content)
    return () => ro.disconnect()
  }, [active, containerRef, contentRef])

  return fitFactor
}

function probablesSideTooltipTriggerClass(): string {
  return "flex h-[14px] min-w-[14px] items-center justify-center border border-gray-500 px-0.5 text-[9px] font-semibold text-gray-400 hover:border-gray-300 hover:text-gray-200 transition-colors leading-none shrink-0"
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
  const hasContent = showCharts
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const fitFactor = useContainerFitZoom(containerRef, contentRef, open && hasContent && !loading)

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
        ) : (
          <div ref={containerRef} className="w-full max-w-full overflow-hidden">
            <div
              ref={contentRef}
              className="flex w-fit max-w-none flex-col items-center gap-3 origin-top"
              style={{ zoom: fitFactor }}
            >
              {showCharts ? (
                <div
                  className="mx-auto shrink-0 origin-top-left"
                  style={{ zoom: PROBABLES_PITCH_CHART_ZOOM }}
                >
                  <div className="flex flex-row flex-nowrap items-start justify-center gap-8">
                    {leftRows.length > 0 ? (
                      <div className="w-[11rem] shrink-0">
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
                      <div className="w-[11rem] shrink-0">
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
                  <PitchTypeChartLegend pitchTypes={colorOrder} pitchTypeColorOrder={colorOrder} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
