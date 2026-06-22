/**
 * 一球ごとの resultJa から、**最終球を投げる直前**の B-S カウントを求める（Phase 16）。
 * canonical に balls/strikes が無い場合の近似。
 *
 * 分類ルール（「一球結果テキストの分類ギャップ」対策の SSOT）:
 * - 優先順: ファウル → ボール系 → ストライク系 → neutral
 * - 表記は Yahoo 一球速報の「詳しい投球内容」由来。
 * - Python は scripts/pitch_result_ja_classify_cli.ts 経由で本モジュールを呼ぶ（二重実装しない）。
 */

import { isIntentionalWalkResultText, isWalkLikeResultText } from "../baseballWalkResult"
import type { PitchEvent } from "./types"
import { sortPitchEventsByPitchIndex } from "./sortPitchEventsByPitchIndex"

/** UI・派生出力の表示順（Phase 32 カウント別球種 SSOT） */
export const ORDERED_PITCH_COUNT_KEYS = [
  "0-0",
  "1-0",
  "2-0",
  "3-0",
  "0-1",
  "1-1",
  "2-1",
  "3-1",
  "0-2",
  "1-2",
  "2-2",
  "3-2",
] as const

export type PitchCountKey = (typeof ORDERED_PITCH_COUNT_KEYS)[number]

const VALID_COUNT_KEYS = new Set<string>(ORDERED_PITCH_COUNT_KEYS)

export function isValidPitchCountKey(k: string): boolean {
  return VALID_COUNT_KEYS.has(k)
}

/** ファウル（文中に「ファウル」を含む） */
export function isFoulPitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  return !!t && /ファウル/.test(t)
}

/**
 * ボールカウントが増える表記（四死球・ボール・死球など）。
 * カウントシミュ・球種別の「balls」列で共通利用。
 */
export function isBallLikePitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  if (/ボール/.test(t) || /デッドボール/.test(t)) return true
  if (/死球|触身/.test(t)) return true
  if (/^四球/.test(t) || /^敬遠/.test(t) || /故意四/.test(t)) return true
  return false
}

/**
 * 球種別空振り率などで「スイングの空振り相当」とみなす一球テキスト。
 * `空振り` を含む表記に加え、決着表記の `空三振`（先頭一致）を含める。
 */
export function isWhiffLikePitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  if (/^空三振/.test(t)) return true
  if (/空振り/.test(t)) return true
  return false
}

/** 空振り相当に加え、振り逃げ（スイングストライク扱いの拡張） */
export function isSwingMissLikePitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  if (isWhiffLikePitchResultJa(t)) return true
  if (/振り逃げ/.test(t)) return true
  return false
}

/** 見逃しストライク・見逃し三振の見逃し系、および見三振 */
export function isTakenStrikeLikePitchResultJa(r: string | null | undefined): boolean {
  const t = (r ?? "").trim()
  if (!t) return false
  if (/^見逃し/.test(t)) return true
  if (/^見三振/.test(t)) return true
  if (t === "ストライク") return true
  return false
}

export type PitchCountKind = "ball" | "strike" | "foul" | "neutral"

/** B-S シミュ用: 1 球の resultJa を ball / strike / foul / neutral に分類 */
export function classifyPitchResultForCountJa(r: string | null | undefined): PitchCountKind {
  const t = (r ?? "").trim()
  if (!t) return "neutral"
  if (isFoulPitchResultJa(t)) return "foul"
  if (isBallLikePitchResultJa(t)) return "ball"
  if (isSwingMissLikePitchResultJa(t) || isTakenStrikeLikePitchResultJa(t)) return "strike"
  return "neutral"
}

/** 球種別 Strike% / Whiff% 用の相互排他バケット（該当なしは none → インプレー判定は pitchTypeRateStats） */
export function bucketPitchResultForTypeRow(
  r: string | null | undefined
): "balls" | "swing_miss" | "taken" | "foul" | "none" {
  const t = (r ?? "").trim()
  if (!t) return "none"
  if (isFoulPitchResultJa(t)) return "foul"
  if (isBallLikePitchResultJa(t)) return "balls"
  if (isSwingMissLikePitchResultJa(t)) return "swing_miss"
  if (isTakenStrikeLikePitchResultJa(t)) return "taken"
  return "none"
}

/**
 * 1 球の後のカウント（MLB ルール：2ストライク後のファウルはカウント不変）
 */
export function advanceBs(b: number, s: number, resultJa: string): { b: number; s: number } {
  const kind = classifyPitchResultForCountJa(resultJa)
  let nb = b
  let ns = s
  if (kind === "ball") {
    nb = Math.min(3, b + 1)
    return { b: nb, s: ns }
  }
  if (kind === "foul") {
    if (s < 2) ns = Math.min(2, s + 1)
    return { b: nb, s: ns }
  }
  if (kind === "strike") {
    ns = Math.min(2, s + 1)
    return { b: nb, s: ns }
  }
  return { b: nb, s: ns }
}

/**
 * 最終球の「投球直前」の B-S を `"0-0"` … `"3-2"` 形式で返す。
 * 投球が 1 球のみなら `0-0`。投球なしは `null`。
 */
/**
 * 指定インデックスの球を投げる直前の B-S（Phase 32 カウント別球種 SSOT）。
 * index === 0 → "0-0"。範囲外・投球なしは null。
 */
export function countBeforePitchAtIndex(
  pitchEvents: PitchEvent[] | undefined,
  index: number,
): string | null {
  const pe = sortPitchEventsByPitchIndex(pitchEvents ?? [])
  if (pe.length === 0 || index < 0 || index >= pe.length) return null
  if (index === 0) return "0-0"
  let b = 0
  let s = 0
  for (let i = 0; i < index; i++) {
    const r = (pe[i]?.resultJa ?? "").trim()
    const next = advanceBs(b, s, r)
    b = next.b
    s = next.s
  }
  const key = `${b}-${s}`
  return isValidPitchCountKey(key) ? key : null
}

export function countBeforeLastPitch(pitchEvents: PitchEvent[] | undefined): string | null {
  const pe = sortPitchEventsByPitchIndex(pitchEvents ?? [])
  if (pe.length === 0) return null
  return countBeforePitchAtIndex(pe, pe.length - 1)
}

/** §6a・§6b: 末尾がボール/ストライク進行のみの行は決着前の中間行（mergePhase10 と同一） */
function isBallLikeTrailingResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  if (/^ボール\[/.test(s) && /(ランエンドヒット|タイムリー|適時打|安打|ヒット)/.test(s)) return false
  if (/^ボール\[/.test(s) && /ハーフスイング/.test(s)) return false
  return /^ボール$/.test(s) || /^ボール\[/.test(s)
}

function isStrikeCountOnlyTrailingResultJa(r: string | null | undefined): boolean {
  const s = (r ?? "").trim()
  if (!s) return false
  return s === "見逃し" || s === "空振り" || s === "ファウル"
}

function isIntermediateTrailingResultJa(r: string | null | undefined): boolean {
  return isBallLikeTrailingResultJa(r) || isStrikeCountOnlyTrailingResultJa(r)
}

/** 決着球の pitchEvents 内インデックス（`pickResultSummaryJaFromResultJaSequence` と同じ後退） */
export function decisivePitchIndexFromResultJaSequence(results: (string | null | undefined)[]): number {
  if (results.length === 0) return -1
  let i = results.length - 1
  while (i > 0 && isIntermediateTrailingResultJa(results[i])) {
    i -= 1
  }
  const cand = (results[i] ?? "").trim()
  if (cand && isIntermediateTrailingResultJa(cand)) return results.length - 1
  return i
}

/**
 * 決着球を投げる直前の B-S（Yahoo カウント別成績に合わせる）。
 * 末尾の中間行（素のボール・見逃し・空振り・ファウル）を除いてから `countBeforeLastPitch`。
 */
export function countBeforeDecisivePitch(pitchEvents: PitchEvent[] | undefined): string | null {
  const sorted = sortPitchEventsByPitchIndex(pitchEvents ?? [])
  if (sorted.length === 0) return null
  const results = sorted.map((e) => (e.resultJa ?? "").trim())
  const idx = decisivePitchIndexFromResultJaSequence(results)
  if (idx < 0) return null
  return countBeforeLastPitch(sorted.slice(0, idx + 1))
}

/**
 * 四球・敬遠で一球ログが短いとき、Yahoo カウント別成績の 3-0 / 3-1 へ寄せる。
 * （故意四はストライク混じりなら 3-1、球数のみの敬遠は 3-0）
 */
export function adjustPitchCountKeyForWalk(
  countKey: string,
  paResultText: string,
  pitchEvents: PitchEvent[] | undefined,
): string {
  if (!isWalkLikeResultText(paResultText)) return countKey
  if (countKey === "3-0" || countKey === "3-1" || countKey === "3-2") return countKey

  const sorted = sortPitchEventsByPitchIndex(pitchEvents ?? [])
  const hasStrikePitch = sorted.some((e) => {
    const k = classifyPitchResultForCountJa(e.resultJa)
    return k === "strike" || k === "foul"
  })

  if (isIntentionalWalkResultText(paResultText)) {
    if (hasStrikePitch) return "3-1"
    if (countKey === "2-0" && sorted.length >= 3) return "3-0"
    if (countKey === "3-1" || countKey === "1-1") return countKey
    return "3-0"
  }

  const allBallLike =
    sorted.length > 0 && sorted.every((e) => isBallLikePitchResultJa(e.resultJa))
  if (allBallLike) return "3-0"

  return countKey
}

/** 最終球直前カウント + 四球系の Yahoo 寄せ */
export function pitchCountKeyForPlateAppearance(
  pitchEvents: PitchEvent[] | undefined,
  paResultText: string,
): string | null {
  const ck = countBeforeLastPitch(pitchEvents)
  if (!ck || !isValidPitchCountKey(ck)) return null
  return adjustPitchCountKeyForWalk(ck, paResultText, pitchEvents)
}
