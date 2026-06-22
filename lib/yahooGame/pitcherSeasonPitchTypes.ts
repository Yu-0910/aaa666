/**
 * 投手シーズン球種別（canonical 横断）。Yahoo 個人ページ「投球データ」表に準拠。
 * Whiff% = 空振り ÷ スイング数（スイング企図）。
 */

import { getNpbRoster2026 } from "@/lib/npbRoster"
import {
  aggregateByPitchType,
  canonicalPlateAppearanceToPilot,
  type PlateAppearancePitches,
} from "@/lib/pitchDetailsPilot"
import {
  effectiveVsHandBucketForPitcherSplit,
  pitcherThrowHandRLFromYahooPitcherIdWithMentioned,
  resolveBatHandJaForBatter,
} from "@/lib/yahooGame/batterHandFromCanonical"
import { listNpbPlayerIdsWithPitchingAppearanceInGame } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { findPitchingLineForNpbPlayer } from "@/lib/yahooGame/pitcherForNpbPlayer"
import { findNpbIdForYahooBatting, type RosterRow } from "@/lib/yahooGame/rosterCsv"
import { plateAppearanceResolvedResultText } from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { pickResultSummaryJaFromPitchEvents } from "@/lib/yahooGame/mergePhase10FromPitchRows"
import type { CanonicalGameDocument, PlateAppearance } from "@/lib/yahooGame/types"

export type PitcherSeasonPitchTypeRow = {
  pitch_type: string
  pitches: number
  /** 全体の投球割合（%） */
  pct: number
  /** 対左打者への投球における当該球種の割合（%） */
  pct_vs_left: number | null
  /** 対右打者への投球における当該球種の割合（%） */
  pct_vs_right: number | null
  max_speed_kmh: number | null
  avg_speed_kmh: number | null
  so: number
  /** 奪三振に占める割合（%） */
  so_pct: number | null
  whiff_pct: string
  avg: string
  hr: number
}

export type PitcherSeasonPitchTypesPayload = {
  schemaVersion: string
  seasonYear: string
  npbPlayerId: string
  yahooPitcherIds: string[]
  pitches_total: number
  so_total: number
  generatedAt: string
  source: { canonicalGames: string[] }
  rows: PitcherSeasonPitchTypeRow[]
}

export type PitcherSeasonPaBlock = PlateAppearancePitches & {
  /** 投手視点の対左(L)/対右(R)。不明は null */
  vsHand: "L" | "R" | null
}

function teamForYahooPlayerId(doc: CanonicalGameDocument, yahooId: string): string {
  for (const t of doc.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

function resolveNpbForYahooPitcherInGame(
  doc: CanonicalGameDocument,
  roster: RosterRow[],
  yahooPitcherId: string,
): string | null {
  const yid = yahooPitcherId.trim()
  if (!yid) return null
  for (const line of doc.domain.pitchingLines ?? []) {
    if ((line.yahooPlayerId ?? "").trim() !== yid) continue
    const teamHint = teamForYahooPlayerId(doc, yid)
    const match = findNpbIdForYahooBatting(roster, line.playerName, teamHint)
    return match?.npbPlayerId?.trim() || null
  }
  return null
}

function settlementForPa(doc: CanonicalGameDocument, pa: PlateAppearance): string {
  const resolved = plateAppearanceResolvedResultText(doc, pa).trim()
  return (
    resolved ||
    pickResultSummaryJaFromPitchEvents(pa.pitchEvents) ||
    (pa.resultSummaryJa ?? "").trim() ||
    ""
  )
}

function pitcherIdsInPa(pa: PlateAppearance): Set<string> {
  const set = new Set<string>()
  const paPid = (pa.yahooPitcherId ?? "").trim()
  if (paPid) set.add(paPid)
  for (const e of pa.pitchEvents ?? []) {
    const id = String(e.yahooPitcherId ?? "").trim()
    if (id) set.add(id)
  }
  return set
}

/** 1 試合分の打席ブロックを投手 NPB ID ごとに収集 */
export function collectPitcherSeasonPaBlocksFromGame(
  doc: CanonicalGameDocument,
  roster: RosterRow[],
  targetNpbIds?: Set<string>,
): Map<string, { blocks: PitcherSeasonPaBlock[]; yahooIds: Set<string> }> {
  const batRoster = getNpbRoster2026()
  const gameId = doc.gameId
  const out = new Map<string, { blocks: PitcherSeasonPaBlock[]; yahooIds: Set<string> }>()

  const ensure = (npb: string) => {
    if (!out.has(npb)) out.set(npb, { blocks: [], yahooIds: new Set() })
    return out.get(npb)!
  }

  for (const pa of doc.domain.plateAppearances ?? []) {
    const pe = pa.pitchEvents ?? []
    if (!pe.length) continue

    const pids = pitcherIdsInPa(pa)
    const npbByPid = new Map<string, string>()
    for (const pid of pids) {
      const npb = resolveNpbForYahooPitcherInGame(doc, roster, pid)
      if (npb) npbByPid.set(pid, npb)
    }
    if (!npbByPid.size) continue

    const settlement = settlementForPa(doc, pa)
    const pilot = canonicalPlateAppearanceToPilot(gameId, pa, {
      settlementResult: settlement || undefined,
    })
    if (!pilot?.pitches.length) continue

    const batterId = (pa.yahooBatterId ?? "").trim()
    const batJa = resolveBatHandJaForBatter(doc, batterId, batRoster)

    for (const [pid, npb] of npbByPid) {
      if (targetNpbIds && !targetNpbIds.has(npb)) continue
      const filtered = pilot.pitches.filter((p) => (p.pitcher_id ?? "").trim() === pid)
      if (!filtered.length) continue

      const pitcherThrow = pitcherThrowHandRLFromYahooPitcherIdWithMentioned(
        pid,
        doc.game.yahooPlayersMentioned,
      )
      const vsHand = effectiveVsHandBucketForPitcherSplit(batJa, pitcherThrow)

      const bucket = ensure(npb)
      bucket.yahooIds.add(pid)
      bucket.blocks.push({
        ...pilot,
        pitches: filtered,
        vsHand,
      })
    }
  }

  return out
}

function pct(n: number, d: number): number | null {
  if (d <= 0) return null
  return Math.round((n / d) * 1000) / 10
}

/** 収集済み打席ブロックからシーズン球種別行を構築 */
export function aggregatePitcherSeasonPitchTypeRows(
  blocks: PitcherSeasonPaBlock[],
): Omit<
  PitcherSeasonPitchTypesPayload,
  "schemaVersion" | "seasonYear" | "npbPlayerId" | "yahooPitcherIds" | "generatedAt" | "source"
> {
  const coreStats = aggregateByPitchType(blocks, { whiffDenominator: 'swings' })
  const totalSo = coreStats.reduce((s, r) => s + r.so, 0)
  const totalPitches = blocks.reduce((s, b) => s + b.pitches.length, 0)

  let pitchesVsLeft = 0
  let pitchesVsRight = 0
  const typePitchVsLeft = new Map<string, number>()
  const typePitchVsRight = new Map<string, number>()
  const typeSpeeds = new Map<string, number[]>()

  for (const block of blocks) {
    for (const p of block.pitches) {
      const pt = p.pitch_type || "不明"
      const spd = parseInt(p.speed_kmh, 10)
      if (!Number.isNaN(spd) && spd > 0) {
        const arr = typeSpeeds.get(pt) ?? []
        arr.push(spd)
        typeSpeeds.set(pt, arr)
      }
      if (block.vsHand === "L") {
        pitchesVsLeft += 1
        typePitchVsLeft.set(pt, (typePitchVsLeft.get(pt) ?? 0) + 1)
      } else if (block.vsHand === "R") {
        pitchesVsRight += 1
        typePitchVsRight.set(pt, (typePitchVsRight.get(pt) ?? 0) + 1)
      }
    }
  }

  const rows: PitcherSeasonPitchTypeRow[] = coreStats.map((r) => {
    const pt = r.pitch_type
    const speeds = typeSpeeds.get(pt) ?? []
    const maxSpeed = speeds.length ? Math.max(...speeds) : null
    const leftN = typePitchVsLeft.get(pt) ?? 0
    const rightN = typePitchVsRight.get(pt) ?? 0
    return {
      pitch_type: pt,
      pitches: r.pitches,
      pct: pct(r.pitches, totalPitches) ?? 0,
      pct_vs_left: pct(leftN, pitchesVsLeft),
      pct_vs_right: pct(rightN, pitchesVsRight),
      max_speed_kmh: maxSpeed,
      avg_speed_kmh:
        r.avg_speed != null && Number.isFinite(r.avg_speed)
          ? Math.round(r.avg_speed * 10) / 10
          : null,
      so: r.so,
      so_pct: totalSo > 0 ? Math.round((r.so / totalSo) * 1000) / 10 : null,
      whiff_pct: r.whiff_pct,
      avg: r.avg,
      hr: r.hr,
    }
  })

  return {
    pitches_total: totalPitches,
    so_total: totalSo,
    rows,
  }
}

export type PitcherSeasonPitchTypesAccum = {
  blocks: PitcherSeasonPaBlock[]
  yahooIds: Set<string>
  gameIds: Set<string>
}

/** canonical 全試合から投手別に球種ブロックと登板試合 ID を収集（batch/live 共通） */
export function accumulatePitcherSeasonPitchTypesFromDocs(
  docs: CanonicalGameDocument[],
  roster: RosterRow[],
): Map<string, PitcherSeasonPitchTypesAccum> {
  const byNpb = new Map<string, PitcherSeasonPitchTypesAccum>()

  const ensure = (npb: string): PitcherSeasonPitchTypesAccum => {
    let acc = byNpb.get(npb)
    if (!acc) {
      acc = { blocks: [], yahooIds: new Set(), gameIds: new Set() }
      byNpb.set(npb, acc)
    }
    return acc
  }

  for (const doc of docs) {
    for (const npb of listNpbPlayerIdsWithPitchingAppearanceInGame(doc, roster)) {
      ensure(npb).gameIds.add(doc.gameId)
    }

    const chunk = collectPitcherSeasonPaBlocksFromGame(doc, roster)
    for (const [npb, rec] of chunk) {
      const acc = ensure(npb)
      acc.blocks.push(...rec.blocks)
      for (const y of rec.yahooIds) acc.yahooIds.add(y)
      acc.gameIds.add(doc.gameId)
    }
  }

  return byNpb
}

export function buildPitcherSeasonPitchTypesForNpbFromDocs(
  npbPlayerId: string,
  seasonYear: string,
  docs: CanonicalGameDocument[],
  roster: RosterRow[],
): PitcherSeasonPitchTypesPayload | null {
  const npb = npbPlayerId.trim()
  if (!npb) return null

  const acc = accumulatePitcherSeasonPitchTypesFromDocs(docs, roster).get(npb)
  if (!acc?.blocks.length) return null

  const agg = aggregatePitcherSeasonPitchTypeRows(acc.blocks)
  return {
    schemaVersion: "pitcher-season-pitch-types-v1",
    seasonYear,
    npbPlayerId: npb,
    yahooPitcherIds: [...acc.yahooIds].sort(),
    generatedAt: new Date().toISOString(),
    source: { canonicalGames: [...acc.gameIds].sort() },
    ...agg,
  }
}
