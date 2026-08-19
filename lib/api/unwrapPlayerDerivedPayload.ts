/**
 * Phase4: 個人APIが `{ hasData, year, payload }` 形式のときと、従来のフラット JSON の両方を解釈する。
 */

import type {
  PlateAppearancePitches,
  PitchTypeHandSplitStats,
  PitchTypeStats,
  SpeedBandStatsMap,
  ZoneStats,
} from "@/lib/pitchDetailsPilot"
import type { BattingTotalRowSource } from "@/lib/seasonStatsPilot"
import type {
  BattingVsHandTotalReconciliation,
  PilotBlocksData,
  SeasonStatsRow,
} from "@/lib/seasonStatsPilotShared"

export type SeasonStatsUnpacked = {
  stats: SeasonStatsRow[]
  isPilot: boolean
  blocks: PilotBlocksData | null
  pitchTypeStats: PitchTypeStats[]
  pitchTypeHandSplit: PitchTypeHandSplitStats
  speedBandStats: SpeedBandStatsMap
  battingTotalRowSource: BattingTotalRowSource
  battingVsHandReconciliation: BattingVsHandTotalReconciliation | null
}

const emptySeason: SeasonStatsUnpacked = {
  stats: [],
  isPilot: false,
  blocks: null,
  pitchTypeStats: [],
  pitchTypeHandSplit: { vsRight: [], vsLeft: [] },
  speedBandStats: {},
  battingTotalRowSource: null,
  battingVsHandReconciliation: null,
}

/** season-stats API の JSON を SeasonStatsPilot が期待する形へ */
export function unwrapSeasonStatsApiJson(json: unknown): SeasonStatsUnpacked {
  if (!json || typeof json !== "object") return { ...emptySeason }
  const o = json as Record<string, unknown>
  const inner =
    "payload" in o && o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o
  if ("hasData" in o && o.hasData === false && !("stats" in inner)) {
    return { ...emptySeason }
  }
  const src = inner.battingTotalRowSource
  const battingTotalRowSource: BattingTotalRowSource =
    src === "phase11" || src === "rankings" || src === "csv" || src === "batting_lines_fallback"
      ? src
      : null
  const rec = inner.battingVsHandReconciliation
  const battingVsHandReconciliation: BattingVsHandTotalReconciliation | null =
    rec != null && typeof rec === "object" &&
    typeof (rec as BattingVsHandTotalReconciliation).fullyAligned === "boolean" &&
    typeof (rec as BattingVsHandTotalReconciliation).total === "object" &&
    typeof (rec as BattingVsHandTotalReconciliation).vsHandSum === "object" &&
    typeof (rec as BattingVsHandTotalReconciliation).delta === "object"
      ? (rec as BattingVsHandTotalReconciliation)
      : null
  return {
    stats: Array.isArray(inner.stats) ? (inner.stats as SeasonStatsRow[]) : [],
    isPilot: Boolean(inner.isPilot),
    blocks: (inner.blocks as PilotBlocksData | null | undefined) ?? null,
    pitchTypeStats: Array.isArray(inner.pitchTypeStats)
      ? (inner.pitchTypeStats as PitchTypeStats[])
      : [],
    pitchTypeHandSplit:
      inner.pitchTypeHandSplit != null && typeof inner.pitchTypeHandSplit === "object"
        ? (inner.pitchTypeHandSplit as PitchTypeHandSplitStats)
        : { vsRight: [], vsLeft: [] },
    speedBandStats:
      inner.speedBandStats != null && typeof inner.speedBandStats === "object"
        ? (inner.speedBandStats as SpeedBandStatsMap)
        : {},
    battingTotalRowSource,
    battingVsHandReconciliation,
  }
}

export type PitchDetailsUnpacked = {
  plateAppearances: PlateAppearancePitches[]
  pitchTypeStats: PitchTypeStats[]
  zoneStats: ZoneStats[]
  isPilot: boolean
}

const emptyPitch: PitchDetailsUnpacked = {
  plateAppearances: [],
  pitchTypeStats: [],
  zoneStats: [],
  isPilot: false,
}

/** pitch-details API の JSON を PitchDetailsPilot が期待する形へ */
export function unwrapPitchDetailsApiJson(json: unknown): PitchDetailsUnpacked {
  if (!json || typeof json !== "object") return { ...emptyPitch }
  const o = json as Record<string, unknown>
  const inner =
    "payload" in o && o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o
  if ("hasData" in o && o.hasData === false && !("plateAppearances" in inner)) {
    return { ...emptyPitch }
  }
  return {
    plateAppearances: Array.isArray(inner.plateAppearances)
      ? (inner.plateAppearances as PlateAppearancePitches[])
      : [],
    pitchTypeStats: Array.isArray(inner.pitchTypeStats)
      ? (inner.pitchTypeStats as PitchTypeStats[])
      : [],
    zoneStats: Array.isArray(inner.zoneStats) ? (inner.zoneStats as ZoneStats[]) : [],
    isPilot: Boolean(inner.isPilot),
  }
}

/** pitcher-zone-stats: シーズンゾーン（vsRight / vsLeft） */
export type PitcherZoneStatsUnpacked =
  | {
      ok: true
      body: {
        vsRight: unknown
        vsLeft: unknown
        schemaVersion?: string
        seasonYear?: string
        generatedAt?: string
        yahooPitcherId?: string
      }
    }
  | { ok: false; error: string; code?: string }

/** pitcher-zone-stats API（envelope または従来フラット）を解釈 */
export function unwrapPitcherZoneStatsApiJson(json: unknown, httpOk: boolean): PitcherZoneStatsUnpacked {
  if (!httpOk) {
    if (!json || typeof json !== "object") return { ok: false, error: `HTTP error` }
    const o = json as Record<string, unknown>
    const err = typeof o.error === "string" ? o.error : "リクエストに失敗しました。"
    const code = typeof o.code === "string" ? o.code : undefined
    return { ok: false, error: err, code }
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "ゾーン成績の JSON が読み取れませんでした。" }
  }
  const o = json as Record<string, unknown>

  if ("hasData" in o && o.hasData === false) {
    const msg =
      typeof o.message === "string" && o.message.trim()
        ? o.message.trim()
        : "シーズンゾーン成績がありません。"
    const code = typeof o.code === "string" ? o.code : undefined
    return { ok: false, error: msg, code }
  }

  const inner =
    "payload" in o && o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o

  if (Array.isArray(inner.vsRight) && Array.isArray(inner.vsLeft)) {
    return {
      ok: true,
      body: {
        vsRight: inner.vsRight,
        vsLeft: inner.vsLeft,
        schemaVersion: typeof inner.schemaVersion === "string" ? inner.schemaVersion : undefined,
        seasonYear: typeof inner.seasonYear === "string" ? inner.seasonYear : undefined,
        generatedAt: typeof inner.generatedAt === "string" ? inner.generatedAt : undefined,
        yahooPitcherId:
          typeof inner.yahooPitcherId === "string" ? inner.yahooPitcherId : undefined,
      },
    }
  }

  return { ok: false, error: "ゾーン成績の形式が不正です。" }
}
