/**
 * 投手 PoC: 打席結果テキストから PA 集計（Phase 1 / Phase 6 共通）
 * 打者集計と同一の略称解釈: `resultJaHitBases` / `docs/yahoo_plate_appearance_batting_rules.md`
 */

import { isWalkLikeResultText } from "@/lib/baseballWalkResult"
import { isStrikeoutResultJa } from "@/lib/yahooGame/paOutcomeResultJa"
import { hitBases, isAtBat } from "@/lib/yahooGame/resultJaHitBases"

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

function isHbp(result: string): boolean {
  return /死球/.test(result)
}
function isSacBunt(result: string): boolean {
  return /犠打|送りバント/.test(result)
}
function isSacFly(result: string): boolean {
  return /犠飛|犠牲フライ|犠牲飛/.test(result)
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
  if (isStrikeoutResultJa(result)) {
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
