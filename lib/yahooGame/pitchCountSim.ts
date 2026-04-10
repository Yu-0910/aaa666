/**
 * 一球ごとの resultJa から、**最終球を投げる直前**の B-S カウントを求める（Phase 16）。
 * canonical に balls/strikes が無い場合の近似。ファウル・ボール・空振り等の表記に依存。
 */

import type { PitchEvent } from "./types"

const VALID_COUNT_KEYS = new Set([
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
])

export function isValidPitchCountKey(k: string): boolean {
  return VALID_COUNT_KEYS.has(k)
}

function classifyForCount(r: string): "ball" | "strike" | "foul" | "neutral" {
  const t = (r ?? "").trim()
  if (!t) return "neutral"
  if (/ファウル/.test(t)) return "foul"
  if (/ボール/.test(t) || /デッドボール/.test(t)) return "ball"
  if (/死球|触身/.test(t)) return "ball"
  if (/空振り/.test(t) || /^見逃し/.test(t) || /振り逃げ/.test(t)) return "strike"
  return "neutral"
}

/**
 * 1 球の後のカウント（MLB ルール：2ストライク後のファウルはカウント不変）
 */
export function advanceBs(b: number, s: number, resultJa: string): { b: number; s: number } {
  const kind = classifyForCount(resultJa)
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
export function countBeforeLastPitch(pitchEvents: PitchEvent[] | undefined): string | null {
  const pe = pitchEvents ?? []
  if (pe.length === 0) return null
  if (pe.length === 1) return "0-0"
  let b = 0
  let s = 0
  for (let i = 0; i < pe.length - 1; i++) {
    const r = (pe[i]?.resultJa ?? "").trim()
    const next = advanceBs(b, s, r)
    b = next.b
    s = next.s
  }
  return `${b}-${s}`
}
