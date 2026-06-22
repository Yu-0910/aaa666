/**
 * Phase 32: カウント別球種集計（Phase 0 仕様 SSOT）。
 * 各 pitchEvent を countBeforePitchAtIndex で帰属し、球種別に集計する。
 */

import type { PitcherSeasonPocPitchTypesSplitRow } from "../pitcherSeasonPocTypes"
import type { CanonicalGameDocument, PitchEvent } from "./types"
import {
  countBeforePitchAtIndex,
  isValidPitchCountKey,
  ORDERED_PITCH_COUNT_KEYS,
} from "./pitchCountSim"
import { sortPitchEventsByPitchIndex } from "./sortPitchEventsByPitchIndex"
import { yahooPitcherIdForVsHandFromPa } from "./yahooPitcherIdForVsHandFromPa"

export type PitcherCountPitchTypesAcc = Map<string, Map<string, number>>

/** npbPlayerId → カウント別球種 acc（phase_pitcher_poc1 用） */
export type PitcherCountPitchTypesByNpb = Map<string, PitcherCountPitchTypesAcc>

export function emptyPitcherCountPitchTypesAcc(): PitcherCountPitchTypesAcc {
  return new Map()
}

export function ensurePitcherCountPitchTypesAcc(
  byNpb: PitcherCountPitchTypesByNpb,
  npb: string,
): PitcherCountPitchTypesAcc {
  let acc = byNpb.get(npb)
  if (!acc) {
    acc = emptyPitcherCountPitchTypesAcc()
    byNpb.set(npb, acc)
  }
  return acc
}

function ensureCountBucket(acc: PitcherCountPitchTypesAcc, countKey: string): Map<string, number> {
  let tm = acc.get(countKey)
  if (!tm) {
    tm = new Map()
    acc.set(countKey, tm)
  }
  return tm
}

/** 1 球をカウント別球種 acc に加算（投手 ID 解決済みを想定） */
export function addPitchToCountPitchTypesAcc(
  acc: PitcherCountPitchTypesAcc,
  countKey: string,
  pitchTypeJa: string | null | undefined,
): void {
  if (!isValidPitchCountKey(countKey)) return
  const pt = (pitchTypeJa ?? "").trim() || "不明"
  const tm = ensureCountBucket(acc, countKey)
  tm.set(pt, (tm.get(pt) ?? 0) + 1)
}

/**
 * 打席内の pitchEvents を走査し、各球を投球直前カウントに帰属。
 * defaultPitcherId: 打席の yahooPitcherId（一球ごとの yahooPitcherId が無い場合の fallback）
 */
export function accumulateCountPitchTypesFromPitchEvents(
  acc: PitcherCountPitchTypesAcc,
  pitchEvents: PitchEvent[] | undefined,
  defaultPitcherId: string,
  targetYahooPitcherIds: Set<string>,
): { pitchesAdded: number; skippedInvalidCount: number } {
  const sorted = sortPitchEventsByPitchIndex(pitchEvents ?? [])
  let pitchesAdded = 0
  let skippedInvalidCount = 0

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!
    const ePid = String(e.yahooPitcherId ?? "").trim() || defaultPitcherId
    if (!targetYahooPitcherIds.has(ePid)) continue

    const ck = countBeforePitchAtIndex(sorted, i)
    if (!ck || !isValidPitchCountKey(ck)) {
      skippedInvalidCount += 1
      continue
    }
    addPitchToCountPitchTypesAcc(acc, ck, e.pitchTypeJa)
    pitchesAdded += 1
  }

  return { pitchesAdded, skippedInvalidCount }
}

/** canonical 全試合から yahooPitcherId セットに該当する球のみ acc に加算 */
export function accumulatePitcherCountPitchTypesFromDocs(
  docs: CanonicalGameDocument[],
  targetYahooPitcherIds: Set<string>,
  acc: PitcherCountPitchTypesAcc = emptyPitcherCountPitchTypesAcc(),
): PitcherCountPitchTypesAcc {
  for (const doc of docs) {
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (!pid) continue
      accumulateCountPitchTypesFromPitchEvents(acc, pa.pitchEvents, pid, targetYahooPitcherIds)
    }
  }
  return acc
}

export function buildPitcherCountPitchTypesRows(
  acc: PitcherCountPitchTypesAcc,
): PitcherSeasonPocPitchTypesSplitRow[] {
  return ORDERED_PITCH_COUNT_KEYS.map((key) => {
    const tm = acc.get(key)
    const pitchesTotal = [...(tm?.values() ?? [])].reduce((s, n) => s + n, 0)
    if (!tm || pitchesTotal <= 0) return null
    const rows = [...tm.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pitch_type, pitches]) => ({
        pitch_type,
        pitches,
        pct: Math.round((pitches / pitchesTotal) * 1000) / 10,
      }))
    return { key, label: key, pitches_total: pitchesTotal, rows }
  }).filter((row): row is PitcherSeasonPocPitchTypesSplitRow => row != null)
}
