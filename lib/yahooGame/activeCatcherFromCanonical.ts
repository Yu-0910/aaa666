/**
 * 試合中の「実際にミットを構えていた捕手」を textPlayByPlay から追跡し、
 * 盗塁阻止・背後投球数・GO/AO を帰属する。
 */

import { compactPlayerName } from "@/lib/playerNameNormalize"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import {
  catcherSubstitutionEnteringNamesFromPbpLine,
  explicitCatcherNameFromPbpLine,
} from "@/lib/catcherAppearances"
import {
  buildNameKeyToYahooIdMapForPb,
  catcherPbEventsFromCanonical,
  resolveCatcherYahooIdForPbEvent,
} from "@/lib/yahooGame/catcherPbEventsFromCanonical"
import { sbCsEventsFromCanonical } from "@/lib/yahooGame/catcherSbCsEventsFromCanonical"
import { comparePlateAppearances } from "@/lib/yahooGame/pitcherPocHelpers"
import { lastPitchResult } from "@/lib/yahooGame/pitcherPaResultCommon"
import { classifyBattedBallOutForGoAo } from "@/lib/yahooGame/pitcherGoAoFromResult"
import { parsePaId } from "@/lib/yahooGame/paIdFormat"
import {
  fieldingTeamNameFromInningHalf,
  getStartingCatcherForTeam,
  teamsRoughlyMatch,
} from "@/lib/yahooGame/startingCatcherFromCanonical"
import { buildNameKeyToYahooIdMap, normalizeJaNameKey } from "@/lib/yahooGame/runnerEventsFromTextPlayByPlay"
import type { CanonicalGameDocument, PlateAppearance } from "@/lib/yahooGame/types"

export type CatcherDefenseBasicAgg = {
  sb: number
  cs: number
  pb: number
  pitches: number
  ground: number
  air: number
}

function parseInningHalfSectionTitle(t: string): { inning: number; half: "表" | "裏" } | null {
  const m = String(t ?? "").trim().match(/^(\d+)回(表|裏)$/)
  if (!m) return null
  const inning = parseInt(m[1] ?? "", 10)
  const half = m[2] as "表" | "裏"
  if (!Number.isFinite(inning) || inning <= 0) return null
  return { inning, half }
}

function sortInningSections<T extends { sectionTitle?: string }>(sections: readonly T[]): T[] {
  return [...sections].sort((a, b) => {
    const pa = parseInningHalfSectionTitle(a.sectionTitle ?? "")
    const pb = parseInningHalfSectionTitle(b.sectionTitle ?? "")
    if (!pa && !pb) return 0
    if (!pa) return 1
    if (!pb) return -1
    if (pa.inning !== pb.inning) return pa.inning - pb.inning
    if (pa.half === pb.half) return 0
    return pa.half === "表" ? -1 : 1
  })
}

function paTimelineKey(inningHalf: string, paSeqInHalf: number): string {
  return `${inningHalf}\t${paSeqInHalf}`
}

function getCatcherYahooIdForTeam(
  state: Map<string, string>,
  teamName: string,
): string | null {
  const t = String(teamName ?? "").trim()
  if (!t) return null
  if (state.has(t)) return state.get(t) ?? null
  for (const [k, v] of state) {
    if (teamsRoughlyMatch(k, t)) return v
  }
  return null
}

function setCatcherYahooIdForTeam(
  state: Map<string, string>,
  teamName: string,
  yahooId: string,
): void {
  const t = String(teamName ?? "").trim()
  if (!t || !yahooId) return
  for (const k of [...state.keys()]) {
    if (teamsRoughlyMatch(k, t)) {
      state.set(k, yahooId)
      return
    }
  }
  state.set(t, yahooId)
}

function initCatcherState(doc: CanonicalGameDocument): Map<string, string> {
  const state = new Map<string, string>()
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? "").trim()
    if (!teamName) continue
    const starter = getStartingCatcherForTeam(doc, teamName)
    if (starter?.yahooPlayerId) state.set(teamName, starter.yahooPlayerId)
  }
  return state
}

function resolveNameToYahooId(name: string, nameToId: Map<string, string>): string | null {
  const key = normalizeJaNameKey(compactPlayerName(name))
  return key ? nameToId.get(key) ?? null : null
}

/**
 * 半回×打席通し番号ごとに、その打席開始時点で守備側にいた捕手の Yahoo ID。
 */
export function buildCatcherYahooIdByPaTimeline(
  doc: CanonicalGameDocument,
): Map<string, string> {
  const timeline = new Map<string, string>()
  const state = initCatcherState(doc)
  const nameToId = buildNameKeyToYahooIdMap(doc)

  for (const sec of sortInningSections(doc.game?.textPlayByPlay ?? [])) {
    const inningHalf = String(sec.sectionTitle ?? "").trim()
    if (!parseInningHalfSectionTitle(inningHalf)) continue
    const fieldingTeam = fieldingTeamNameFromInningHalf(doc, inningHalf)
    if (!fieldingTeam) continue

    for (const rawLine of sec.lines ?? []) {
      const line = String(rawLine ?? "")
      if (!line) continue

      for (const name of catcherSubstitutionEnteringNamesFromPbpLine(line)) {
        const yid = resolveNameToYahooId(name, nameToId)
        if (yid) setCatcherYahooIdForTeam(state, fieldingTeam, yid)
      }

      const explicit = explicitCatcherNameFromPbpLine(line)
      if (explicit) {
        const yid = resolveNameToYahooId(explicit, nameToId)
        if (yid) setCatcherYahooIdForTeam(state, fieldingTeam, yid)
      }

      const paM = line.match(/^(\d+)[：:]/)
      if (!paM) continue
      const paSeq = Number(paM[1])
      if (!Number.isFinite(paSeq) || paSeq <= 0) continue
      const catcherYid = getCatcherYahooIdForTeam(state, fieldingTeam)
      if (catcherYid) timeline.set(paTimelineKey(inningHalf, paSeq), catcherYid)
    }
  }

  return timeline
}

export function resolveCatcherYahooIdAtPa(
  doc: CanonicalGameDocument,
  inningHalf: string,
  paSeqInHalf: number,
  timeline: Map<string, string>,
): string | null {
  const fromTimeline = timeline.get(paTimelineKey(inningHalf, paSeqInHalf))
  if (fromTimeline) return fromTimeline
  const fieldingTeam = fieldingTeamNameFromInningHalf(doc, inningHalf)
  if (!fieldingTeam) return null
  const starter = getStartingCatcherForTeam(doc, fieldingTeam)
  return starter?.yahooPlayerId ?? null
}

/** 打席時点の実守備捕手（timeline は試合ごとに1回構築して再利用） */
export function resolveActiveCatcherYahooIdForPlateAppearance(
  doc: CanonicalGameDocument,
  pa: PlateAppearance,
  timeline: Map<string, string>,
): string | null {
  const parsed = parsePaId(pa.paId)
  if (parsed) {
    return resolveCatcherYahooIdAtPa(
      doc,
      `${parsed.inning}回${parsed.half}`,
      parsed.paSeqInHalf,
      timeline,
    )
  }
  const inningHalf = String(pa.inningHalf ?? "").trim()
  if (!inningHalf) return null
  const fieldingTeam = fieldingTeamNameFromInningHalf(doc, inningHalf)
  if (!fieldingTeam) return null
  return getStartingCatcherForTeam(doc, fieldingTeam)?.yahooPlayerId ?? null
}

/** 試合内・守備側チームごとの捕手別 BF（実守備捕手） */
export function bfByFieldingTeamAndCatcherYahooId(
  doc: CanonicalGameDocument,
): Map<string, Map<string, number>> {
  const timeline = buildCatcherYahooIdByPaTimeline(doc)
  const byTeam = new Map<string, Map<string, number>>()
  const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
  for (const pa of pas) {
    const inningHalf = String(pa.inningHalf ?? "").trim()
    const fieldingTeam = inningHalf ? fieldingTeamNameFromInningHalf(doc, inningHalf) : null
    if (!fieldingTeam) continue
    const catcherYid = resolveActiveCatcherYahooIdForPlateAppearance(doc, pa, timeline)
    if (!catcherYid) continue
    let m = byTeam.get(fieldingTeam)
    if (!m) {
      m = new Map()
      byTeam.set(fieldingTeam, m)
    }
    m.set(catcherYid, (m.get(catcherYid) ?? 0) + 1)
  }
  return byTeam
}

/** 試合内で BF 最大の実守備捕手（同点は Yahoo ID 昇順） */
export function primaryCatcherYahooIdByFieldingTeam(
  doc: CanonicalGameDocument,
): Map<string, string> {
  const out = new Map<string, string>()
  const byTeam = bfByFieldingTeamAndCatcherYahooId(doc)
  for (const [teamName, perCatcher] of byTeam) {
    const sorted = [...perCatcher.entries()].sort(
      (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
    )
    const cyid = sorted[0]?.[0]
    if (cyid) out.set(teamName, cyid)
  }
  return out
}

function addAgg(
  byNpb: Map<string, CatcherDefenseBasicAgg>,
  npbId: string,
  patch: Partial<CatcherDefenseBasicAgg>,
): void {
  let agg = byNpb.get(npbId)
  if (!agg) {
    agg = { sb: 0, cs: 0, pb: 0, pitches: 0, ground: 0, air: 0 }
    byNpb.set(npbId, agg)
  }
  if (patch.sb) agg.sb += patch.sb
  if (patch.cs) agg.cs += patch.cs
  if (patch.pb) agg.pb += patch.pb
  if (patch.pitches) agg.pitches += patch.pitches
  if (patch.ground) agg.ground += patch.ground
  if (patch.air) agg.air += patch.air
}

function npbFromYahoo(yahooId: string): string | null {
  const npb = resolveNpbPlayerIdFromPublicId(yahooId)
  return npb || null
}

/** paSeqInHalf 不明の SB/CS は先発捕手へフォールバックしない（誤帰属を避ける） */
function attributePbWithTimeline(
  doc: CanonicalGameDocument,
  timeline: Map<string, string>,
  byNpb: Map<string, CatcherDefenseBasicAgg>,
): void {
  const nameToId = buildNameKeyToYahooIdMapForPb(doc)
  for (const ev of catcherPbEventsFromCanonical(doc)) {
    const yahooCatcher = resolveCatcherYahooIdForPbEvent(doc, ev, timeline, nameToId)
    if (!yahooCatcher) continue
    const npb = npbFromYahoo(yahooCatcher)
    if (!npb) continue
    addAgg(byNpb, npb, { pb: 1 })
  }
}

function attributeSbCsWithTimeline(
  doc: CanonicalGameDocument,
  timeline: Map<string, string>,
  byNpb: Map<string, CatcherDefenseBasicAgg>,
): void {
  for (const ev of sbCsEventsFromCanonical(doc)) {
    if (ev.paSeqInHalf == null || ev.paSeqInHalf <= 0) continue
    const yahooCatcher = timeline.get(paTimelineKey(ev.inningHalf, ev.paSeqInHalf))
    if (!yahooCatcher) continue
    const npb = npbFromYahoo(yahooCatcher)
    if (!npb) continue
    addAgg(byNpb, npb, ev.kind === "SB" ? { sb: 1 } : { cs: 1 })
  }
}

export function aggregateCatcherDefenseBasicByNpbId(
  doc: CanonicalGameDocument,
): Map<string, CatcherDefenseBasicAgg> {
  const byNpb = new Map<string, CatcherDefenseBasicAgg>()
  const timeline = buildCatcherYahooIdByPaTimeline(doc)

  attributeSbCsWithTimeline(doc, timeline, byNpb)
  attributePbWithTimeline(doc, timeline, byNpb)

  const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
  for (const pa of pas) {
    const parsed = parsePaId(pa.paId)
    if (!parsed) continue
    const inningHalf = `${parsed.inning}回${parsed.half}`
    const yahooCatcher = resolveCatcherYahooIdAtPa(doc, inningHalf, parsed.paSeqInHalf, timeline)
    if (!yahooCatcher) continue
    const npb = npbFromYahoo(yahooCatcher)
    if (!npb) continue

    const pitches = (pa.pitchEvents ?? []).length
    const goAoKind = classifyBattedBallOutForGoAo(lastPitchResult(pa))
    addAgg(byNpb, npb, {
      pitches,
      ground: goAoKind === "ground" ? 1 : 0,
      air: goAoKind === "air" ? 1 : 0,
    })
  }

  return byNpb
}
