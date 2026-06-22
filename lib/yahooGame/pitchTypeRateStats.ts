/**
 * 球種別 Strike%・Whiff%（1球単位）。
 *
 * - Strike% = (空振り + 見逃し + ファウル + インプレー) / 投球数
 * - Whiff% = 空振り / スイング数（空振り + ファウル + インプレー＝スイング企図）
 * - SwStr%（参考） = 空振り / 投球数 → formatWhiffPctPerPitch
 *
 * インプレー = その球でフェアゾーンに入った打球結果（安打・アウト等）。三振・見逃し・ボールは含めない。
 */

import {
  bucketPitchResultForTypeRow,
  isBallLikePitchResultJa,
  isFoulPitchResultJa,
  isSwingMissLikePitchResultJa,
  isTakenStrikeLikePitchResultJa,
} from "./pitchCountSim"
import { isSettlementPitchResultJa } from "./paOutcomeResultJa"

/** その投球がインプレー（コンタクトして打球成立）か */
export function isInPlayPitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  if (isFoulPitchResultJa(t)) return false
  if (isBallLikePitchResultJa(t)) return false
  if (isSwingMissLikePitchResultJa(t)) return false
  if (isTakenStrikeLikePitchResultJa(t)) return false
  return isSettlementPitchResultJa(t)
}

export type PitchTypeRatePitchCounts = {
  balls: number
  swingMiss: number
  taken: number
  foul: number
  inPlay: number
}

export function emptyPitchTypeRatePitchCounts(): PitchTypeRatePitchCounts {
  return { balls: 0, swingMiss: 0, taken: 0, foul: 0, inPlay: 0 }
}

export function countPitchTypeRateFromResultJa(
  resultJa: string | null | undefined
): PitchTypeRatePitchCounts {
  const r = (resultJa ?? "").trim()
  const base = emptyPitchTypeRatePitchCounts()
  switch (bucketPitchResultForTypeRow(r)) {
    case "balls":
      base.balls = 1
      return base
    case "swing_miss":
      base.swingMiss = 1
      return base
    case "taken":
      base.taken = 1
      return base
    case "foul":
      base.foul = 1
      return base
    default:
      if (isInPlayPitchResultJa(r)) base.inPlay = 1
      return base
  }
}

export function aggregatePitchTypeRateCounts(
  resultStrings: Iterable<string | null | undefined>
): PitchTypeRatePitchCounts {
  const acc = emptyPitchTypeRatePitchCounts()
  for (const r of resultStrings) {
    const c = countPitchTypeRateFromResultJa(r)
    acc.balls += c.balls
    acc.swingMiss += c.swingMiss
    acc.taken += c.taken
    acc.foul += c.foul
    acc.inPlay += c.inPlay
  }
  return acc
}

export function strikeCountFromRateCounts(
  c: Pick<PitchTypeRatePitchCounts, "swingMiss" | "taken" | "foul" | "inPlay">
): number {
  return c.swingMiss + c.taken + c.foul + c.inPlay
}

export function swingCountFromRateCounts(
  c: Pick<PitchTypeRatePitchCounts, "swingMiss" | "foul" | "inPlay">
): number {
  return c.swingMiss + c.foul + c.inPlay
}

export function formatStrikePct(strikes: number, pitches: number): string {
  return pitches > 0 ? `${((strikes / pitches) * 100).toFixed(1)}%` : "—"
}

/** Whiff%: 空振り ÷ スイング数（スイング企図） */
export function formatWhiffPct(swingMiss: number, swings: number): string {
  return swings > 0 ? `${((swingMiss / swings) * 100).toFixed(1)}%` : "—"
}

/** SwStr%（参考）: 空振り ÷ 投球数 */
export function formatWhiffPctPerPitch(swingMiss: number, pitches: number): string {
  return pitches > 0 ? `${((swingMiss / pitches) * 100).toFixed(1)}%` : "—"
}
