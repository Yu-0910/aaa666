/**
 * Phase 33 Phase 0 SSOT: 打者×対戦球団×投手利き腕×カウント別球種集計。
 * 一球の帰属は Phase 32（countBeforePitchAtIndex）と同一。四球寄せは使わない。
 */

import type { PitcherSeasonPocPitchTypesSplitRow } from "../pitcherSeasonPocTypes"
import { teamDisplayNameFromCode } from "../standings/teamCodes"
import {
  contextFromInningHalf,
  resolveGameContextForBatter,
  vsTeamSplitValueToTeamCode,
} from "./batterGameContextFromCanonical"
import { pitcherThrowHandRLFromYahooPitcherId } from "./batterHandFromCanonical"
import {
  addPitchToCountPitchTypesAcc,
  buildPitcherCountPitchTypesRows,
  emptyPitcherCountPitchTypesAcc,
  type PitcherCountPitchTypesAcc,
} from "./pitcherCountPitchTypesAgg"
import {
  countBeforePitchAtIndex,
  isValidPitchCountKey,
} from "./pitchCountSim"
import { sortPitchEventsByPitchIndex } from "./sortPitchEventsByPitchIndex"
import type { CanonicalGameDocument, PlateAppearance } from "./types"
import { yahooPitcherIdForVsHandFromPa } from "./yahooPitcherIdForVsHandFromPa"
import { injectTeamsFromTextPbpIfMissing } from "./inferTeamsFromTextPbp"

export type BatterVsTeamHandBucket = "combined" | "L" | "R"

/** teamCode → hand bucket → count acc */
export type BatterVsTeamCountPitchTypesAcc = Map<
  string,
  Map<BatterVsTeamHandBucket, PitcherCountPitchTypesAcc>
>

export function emptyBatterVsTeamCountPitchTypesAcc(): BatterVsTeamCountPitchTypesAcc {
  return new Map()
}

function ensureTeamHandAcc(
  acc: BatterVsTeamCountPitchTypesAcc,
  teamCode: string,
  hand: BatterVsTeamHandBucket,
): PitcherCountPitchTypesAcc {
  let byHand = acc.get(teamCode)
  if (!byHand) {
    byHand = new Map()
    acc.set(teamCode, byHand)
  }
  let countAcc = byHand.get(hand)
  if (!countAcc) {
    countAcc = emptyPitcherCountPitchTypesAcc()
    byHand.set(hand, countAcc)
  }
  return countAcc
}

function addPitchToBatterVsTeamAcc(
  acc: BatterVsTeamCountPitchTypesAcc,
  teamCode: string,
  pitcherThrow: "R" | "L" | "",
  countKey: string,
  pitchTypeJa: string | null | undefined,
): void {
  addPitchToCountPitchTypesAcc(ensureTeamHandAcc(acc, teamCode, "combined"), countKey, pitchTypeJa)
  if (pitcherThrow === "L") {
    addPitchToCountPitchTypesAcc(ensureTeamHandAcc(acc, teamCode, "L"), countKey, pitchTypeJa)
  } else if (pitcherThrow === "R") {
    addPitchToCountPitchTypesAcc(ensureTeamHandAcc(acc, teamCode, "R"), countKey, pitchTypeJa)
  }
}

function accumulateFromPlateAppearance(
  acc: BatterVsTeamCountPitchTypesAcc,
  pa: PlateAppearance,
  teamCode: string,
): { pitchesAdded: number; skippedInvalidCount: number } {
  const defaultPitcherId = yahooPitcherIdForVsHandFromPa(pa)
  if (!defaultPitcherId) return { pitchesAdded: 0, skippedInvalidCount: 0 }

  const sorted = sortPitchEventsByPitchIndex(pa.pitchEvents ?? [])
  let pitchesAdded = 0
  let skippedInvalidCount = 0

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!
    const ck = countBeforePitchAtIndex(sorted, i)
    if (!ck || !isValidPitchCountKey(ck)) {
      skippedInvalidCount += 1
      continue
    }
    const ePid = String(e.yahooPitcherId ?? "").trim() || defaultPitcherId
    const pitcherThrow = pitcherThrowHandRLFromYahooPitcherId(ePid)
    addPitchToBatterVsTeamAcc(acc, teamCode, pitcherThrow, ck, e.pitchTypeJa)
    pitchesAdded += 1
  }

  return { pitchesAdded, skippedInvalidCount }
}

/** 1 試合・1 打者の pitchEvents を球団 acc に加算 */
export function accumulateBatterVsTeamCountPitchTypesFromGame(
  acc: BatterVsTeamCountPitchTypesAcc,
  doc: CanonicalGameDocument,
  yahooBatterId: string,
  stadiumByGameId: Map<string, string>,
): { pitchesAdded: number; skippedInvalidCount: number; teamCode: string | null } {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return { pitchesAdded: 0, skippedInvalidCount: 0, teamCode: null }

  const ctx = resolveGameContextForBatter(doc, bid, stadiumByGameId)
  if (!ctx) return { pitchesAdded: 0, skippedInvalidCount: 0, teamCode: null }

  const teamCode = vsTeamSplitValueToTeamCode(ctx.vsTeamValue)
  if (!teamCode) return { pitchesAdded: 0, skippedInvalidCount: 0, teamCode: null }

  let pitchesAdded = 0
  let skippedInvalidCount = 0

  for (const pa of doc.domain?.plateAppearances ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const r = accumulateFromPlateAppearance(acc, pa, teamCode)
    pitchesAdded += r.pitchesAdded
    skippedInvalidCount += r.skippedInvalidCount
  }

  return { pitchesAdded, skippedInvalidCount, teamCode }
}

export function accumulateBatterVsTeamCountPitchTypesFromDocs(
  docs: CanonicalGameDocument[],
  yahooBatterId: string,
  stadiumByGameId: Map<string, string>,
  acc: BatterVsTeamCountPitchTypesAcc = emptyBatterVsTeamCountPitchTypesAcc(),
): BatterVsTeamCountPitchTypesAcc {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return acc

  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    accumulateBatterVsTeamCountPitchTypesFromGame(acc, doc, bid, stadiumByGameId)
  }

  return acc
}

/** canonical 全試合を 1 パス走査し、pitchEvents あり打者ごとに acc を返す（phase33 ビルド用） */
export function accumulateAllBattersVsTeamCountPitchTypesFromDocs(
  docs: CanonicalGameDocument[],
  stadiumByGameId: Map<string, string>,
): Map<string, BatterVsTeamCountPitchTypesAcc> {
  const byBatter = new Map<string, BatterVsTeamCountPitchTypesAcc>()

  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (!bid || (pa.pitchEvents ?? []).length === 0) continue

      const half = String(pa.inningHalf ?? "").trim()
      const ctx = contextFromInningHalf(doc, half, stadiumByGameId)
      if (!ctx) continue

      const teamCode = vsTeamSplitValueToTeamCode(ctx.vsTeamValue)
      if (!teamCode) continue

      const acc = byBatter.get(bid) ?? emptyBatterVsTeamCountPitchTypesAcc()
      accumulateFromPlateAppearance(acc, pa, teamCode)
      byBatter.set(bid, acc)
    }
  }

  return byBatter
}

function pitchesTotalFromAcc(countAcc: PitcherCountPitchTypesAcc | undefined): number {
  if (!countAcc) return 0
  let total = 0
  for (const tm of countAcc.values()) {
    for (const n of tm.values()) total += n
  }
  return total
}

export function buildBatterVsTeamCountPitchTypesTeamBlocks(
  acc: BatterVsTeamCountPitchTypesAcc,
  minPitchesDisplay = 0,
): Array<{
  teamCode: string
  label: string
  pitches_total: number
  byCountPitchTypes: PitcherSeasonPocPitchTypesSplitRow[]
  byCountPitchTypesVsL?: PitcherSeasonPocPitchTypesSplitRow[]
  byCountPitchTypesVsR?: PitcherSeasonPocPitchTypesSplitRow[]
}> {
  const teams: Array<{
    teamCode: string
    label: string
    pitches_total: number
    byCountPitchTypes: PitcherSeasonPocPitchTypesSplitRow[]
    byCountPitchTypesVsL?: PitcherSeasonPocPitchTypesSplitRow[]
    byCountPitchTypesVsR?: PitcherSeasonPocPitchTypesSplitRow[]
  }> = []

  for (const [teamCode, byHand] of acc) {
    const combinedAcc = byHand.get("combined")
    const pitchesTotal = pitchesTotalFromAcc(combinedAcc)
    if (pitchesTotal <= 0 || pitchesTotal < minPitchesDisplay) continue

    const byCountPitchTypes = buildPitcherCountPitchTypesRows(
      combinedAcc ?? emptyPitcherCountPitchTypesAcc(),
    )
    const vsL = buildPitcherCountPitchTypesRows(byHand.get("L") ?? emptyPitcherCountPitchTypesAcc())
    const vsR = buildPitcherCountPitchTypesRows(byHand.get("R") ?? emptyPitcherCountPitchTypesAcc())

    teams.push({
      teamCode,
      label: teamDisplayNameFromCode(teamCode),
      pitches_total: pitchesTotal,
      byCountPitchTypes,
      ...(vsL.length > 0 ? { byCountPitchTypesVsL: vsL } : {}),
      ...(vsR.length > 0 ? { byCountPitchTypesVsR: vsR } : {}),
    })
  }

  return teams.sort((a, b) => a.teamCode.localeCompare(b.teamCode))
}
