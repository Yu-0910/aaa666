/**
 * 投手 PoC: 打席結果テキストから PA 集計（Phase 1 / Phase 6 共通）
 */

import { isWalkLikeResultText } from "@/lib/baseballWalkResult"

export function lastPitchResult(pa: {
  paId?: string
  resultSummaryJa?: string
  pitchEvents?: { resultJa?: string | null }[]
}): string {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return (
    (pa.resultSummaryJa ?? "").trim() ||
    ((last?.resultJa ?? "") as string).trim() ||
    ""
  )
}

function isStrikeout(result: string): boolean {
  return /三振|空三振|見三振/.test(result) || /^(空振り|見逃し)/.test(result)
}
function isHbp(result: string): boolean {
  return /死球/.test(result)
}
function isSacBunt(result: string): boolean {
  return /犠打|送りバント/.test(result)
}
function isSacFly(result: string): boolean {
  return /犠飛/.test(result)
}

function hitBases(result: string): 0 | 1 | 2 | 3 | 4 {
  if (/本塁打|ホームラン|HR/.test(result)) return 4
  if (/三塁打/.test(result)) return 3
  if (/二塁打/.test(result)) return 2
  if (/安打|ヒット|左安|中安|右安/.test(result)) return 1
  return 0
}

function isAtBat(result: string): boolean {
  if (!result) return false
  if (isWalkLikeResultText(result) || isHbp(result) || isSacBunt(result) || isSacFly(result))
    return false
  if (/妨害/.test(result)) return false
  return true
}

/** 投手視点: 1 打席のカウント */
export function addPitcherPaCount(
  agg: { bf: number; ab: number; h: number; hr: number; so: number; bb: number; hbp: number },
  result: string
): void {
  agg.bf += 1
  if (isWalkLikeResultText(result)) {
    agg.bb += 1
    return
  }
  if (isHbp(result)) {
    agg.hbp += 1
    return
  }
  if (isSacBunt(result) || isSacFly(result)) return
  if (isStrikeout(result)) {
    agg.so += 1
    if (isAtBat(result)) agg.ab += 1
    return
  }
  const hb = hitBases(result)
  if (hb > 0) {
    agg.h += 1
    if (hb === 4) agg.hr += 1
    if (isAtBat(result)) agg.ab += 1
    return
  }
  if (isAtBat(result)) agg.ab += 1
}

export function fmtAvg(ab: number, h: number): string {
  if (ab <= 0) return ".000"
  const v = h / ab
  const s = v.toFixed(3)
  return s.startsWith("0") ? s.slice(1) : s
}
