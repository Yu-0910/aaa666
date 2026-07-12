/**
 * 一球ログ・出場成績テキスト共通の「塁打数」「打数に数えるか」判定。
 * docs/yahoo_plate_appearance_batting_rules.md と同期すること。
 */

import { isWalkLikeResultText } from "../baseballWalkResult"
import { isInterferenceResultText, shouldTreatInterferenceAsAtBat } from "./paSettlementStatsFromResultJa"

function stripBracketNotes(result: string): string {
  return result.replace(/\[[^\]]*\]/g, "")
}

function isHbp(result: string): boolean {
  return /死球/.test(result)
}
function isSacBunt(result: string): boolean {
  return /犠打|送りバント|セーフティスクイズ|スクイズ|犠野/.test(result)
}
function isSacFly(result: string): boolean {
  return /犠飛|犠牲フライ|犠牲飛/.test(result)
}

/**
 * `resultSummaryJa` / 最終球 `resultJa` / 出場成績の打席セルから塁打数を返す。
 * 略記ルールは docs/yahoo_plate_appearance_batting_rules.md と同期すること。
 */
export function hitBases(result: string): 0 | 1 | 2 | 3 | 4 {
  // 括弧を剥がすと「ボール」だけになり塁打が落ちるため、先に安打系キーワードを見る
  const core = stripBracketNotes(result)
  if (/本塁打|ホームラン|HR/.test(core)) return 4
  if (/左中本|右中本|左本|右本|中本(?:$)/.test(core)) return 4
  if (/三塁打|[一二三遊左中右投捕]３|[一二三遊左中右投捕]3/.test(core)) return 3
  if (/二塁打|[一二三遊左中右投捕]２|[一二三遊左中右投捕]2/.test(core)) return 2
  if (/内安|内野安打/.test(core)) return 1
  if (/二安/.test(core)) return 1
  if (/三安/.test(core)) return 1
  // 捕安・一安 等、位置+「安」の略（上記と重複しうるが先勝ちで問題なし）
  if (/[一二三遊左中右投捕]安/.test(core)) return 1
  if (/安打|ヒット|左安|中安|右安|遊安|投安|一安/.test(core)) return 1
  if (/(左|中|右)(前|線)打|前打|単打/.test(core)) return 1
  if (/ポテンヒット/.test(core)) return 1
  // 実況でヒット語が省略されるケース（例: タイムリーのみ、で出塁）
  if (/(タイムリー|適時打)/.test(core) && !/失策|エラー|野選/.test(core)) return 1
  if (/で出塁/.test(core) && !/(四球|申告敬遠|敬遠|死球|失策|エラー|野選)/.test(core)) return 1
  return 0
}

export function isAtBat(result: string): boolean {
  if (!result) return false
  if (isWalkLikeResultText(result) || isHbp(result) || isSacBunt(result) || isSacFly(result)) return false
  if (isInterferenceResultText(result)) return shouldTreatInterferenceAsAtBat(result)
  return true
}

/** Sportsnavi stats 行の打席結果列（通常 c[14] 以降）から二塁打・三塁打数を数える */
export function countExtraBaseHitsFromStatsRowTextCells(c: string[]): { h2: number; h3: number } {
  let h2 = 0
  let h3 = 0
  for (let i = 14; i < c.length; i++) {
    const t = (c[i] ?? "").trim()
    if (!t) continue
    if (!isAtBat(t)) continue
    const bases = hitBases(t)
    if (bases === 2) h2 += 1
    if (bases === 3) h3 += 1
  }
  return { h2, h3 }
}

/**
 * 数値列の安打数・本塁打数を正とし、テキスト由来の 2B/3B が過剰なときに丸める。
 */
export function capExtraBaseHitsToHitLineTotal(
  h2: number,
  h3: number,
  h: number,
  hr: number,
): { h2: number; h3: number } {
  const max23 = Math.max(0, h - hr)
  let h3c = Math.min(Math.max(0, h3), max23)
  let h2c = Math.min(Math.max(0, h2), max23 - h3c)
  return { h2: h2c, h3: h3c }
}
