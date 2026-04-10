"use client"

import { useState, useEffect, useLayoutEffect } from "react"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { SectionLoadingSpinner } from "@/components/ui/spinner"

type PitchDetailRow = {
  game_id: string
  inning: number
  top_bottom: string
  bat_order: number
  pitcher_id: string
  batter_id: string
  pitch_no: number
  pitch_type: string
  speed_kmh: string
  result: string
  zone_top_px: string
  zone_left_px: string
  zone_row: string
  zone_col: string
  zone_id: string
}

type PlateAppearancePitches = {
  game_id: string
  inning: number
  top_bottom: string
  bat_order: number
  pitches: PitchDetailRow[]
}

type PitchTypeStats = {
  pitch_type: string
  pitches: number
  pct: number
  avg_speed: number | null
  balls: number
  strikes: number
  swing_miss: number
  taken: number
  foul: number
  ab: number
  h: number
  avg: string
}

type ZoneStats = {
  zoneId: number
  pitches: number
  ab: number
  h: number
  hr: number
  tb: number
  bb: number
  hbp: number
  sf: number
  avg: string
  ops: string
}

type Props = {
  playerId: string
  layout?: ViewportLayout
  /** 見出し左の縦帯色 */
  headingStripeColor?: string
}

/** 個人ページ表示項目整理 ブロックG: 球種・コース（25マス）パイロット */
export default function PitchDetailsPilot({
  playerId,
  layout = "mobile",
  headingStripeColor = "#FF4444",
}: Props) {
  const titleBase = layout === "mobile" ? "text-[1.625rem]" : "text-[1.125rem]"
  const [plateAppearances, setPlateAppearances] = useState<PlateAppearancePitches[]>([])
  const [pitchTypeStats, setPitchTypeStats] = useState<PitchTypeStats[]>([])
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([])
  const [loading, setLoading] = useState(true)
  const [isPilot, setIsPilot] = useState(false)

  useLayoutEffect(() => {
    if (!playerId) {
      setPlateAppearances([])
      setPitchTypeStats([])
      setZoneStats([])
      setIsPilot(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setPlateAppearances([])
    setPitchTypeStats([])
    setZoneStats([])
    setIsPilot(false)
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/players/${encodeURIComponent(playerId)}/pitch-details`)
      .then(async (res) => {
        if (!res.ok) {
          return {
            plateAppearances: [] as PlateAppearancePitches[],
            pitchTypeStats: [] as PitchTypeStats[],
            zoneStats: [] as ZoneStats[],
            isPilot: false,
          }
        }
        return res.json() as Promise<{
          plateAppearances: PlateAppearancePitches[]
          pitchTypeStats: PitchTypeStats[]
          zoneStats: ZoneStats[]
          isPilot: boolean
        }>
      })
      .then((data) => {
        if (cancelled) return
        setPlateAppearances(data.plateAppearances || [])
        setPitchTypeStats(data.pitchTypeStats || [])
        setZoneStats(data.zoneStats || [])
        setIsPilot(data.isPilot || false)
      })
      .catch(() => {
        if (cancelled) return
        setPlateAppearances([])
        setPitchTypeStats([])
        setZoneStats([])
        setIsPilot(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [playerId])

  if (loading) {
    return (
      <div className="mb-8">
        <SectionLoadingSpinner />
      </div>
    )
  }

  // canonical 由来の zoneStats はゾーン欠損で全 0 の可能性もあるが、isPilot（Phase 14 等）なら表を出す
  if (!isPilot) {
    return null
  }

  return (
    <div className="mb-6">
      {/* コース別成績（25マス表） */}
      <div className="mb-4">
        <h2
          className={`${titleBase} mb-3 pl-4`}
          style={{
            borderLeft: `6px solid ${headingStripeColor}`,
            fontWeight: 900,
          }}
        >
          コース別成績
        </h2>
        <div className="overflow-x-auto flex justify-center">
          <div
            className="inline-grid grid-cols-5 gap-0"
            style={{
              border: "0.5px solid #888888",
              background: "#000000",
              minWidth: "min(95vw, 480px)",
            }}
          >
            {[1, 2, 3, 4, 5].map((row) =>
              [1, 2, 3, 4, 5].map((col) => {
                const z = (row - 1) * 5 + col
                const stat = zoneStats.find((s) => s.zoneId === z)
                const isStrikeZone = [7, 8, 9, 12, 13, 14, 17, 18, 19].includes(z)
                const hasSettlement =
                  stat != null && stat.ab + stat.bb + stat.hbp + stat.sf > 0
                const opsDisplay = hasSettlement ? stat!.ops : "—"
                const avgDisplay = hasSettlement ? stat!.avg : "—"
                const hrDisplay = hasSettlement ? String(stat!.hr) : "—"
                return (
                  <div
                    key={z}
                    className="flex flex-col items-center justify-center gap-1 py-2 px-1.5 min-h-[80px]"
                    style={{
                      border: isStrikeZone ? "1.5px solid #FFFF44" : "0.5px solid #888888",
                      backgroundColor: "#000000",
                      color: "#e5e5e5",
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs latin">
                      <span className="opacity-70">OPS</span>
                      <span className="latin font-black tabular-nums text-[14px]">{opsDisplay}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs latin">
                      <span className="opacity-70">打率</span>
                      <span className="latin font-black tabular-nums text-[14px]">{avgDisplay}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs latin">
                      <span className="opacity-70">HR</span>
                      <span className="latin font-black tabular-nums text-[14px]">{hrDisplay}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 latin">
          5×5グリッド（投手目線＝投手がマウンドから見る視点。外角高→内角低）。中央9マス＝ストライクゾーン。OPS・打率・HRは決着球のゾーン別（該当なしは「—」）。
        </p>
      </div>
    </div>
  )
}
