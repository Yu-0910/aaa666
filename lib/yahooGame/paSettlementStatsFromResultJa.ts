/**
 * 最終球の結果テキストから、球種別・ゾーン集計などで使う打席成績フラグ・塁打。
 * pitchDetailsPilot と同一ロジック（SSOT）。Python CLI からも参照する。
 */

import { isWalkLikeResultText } from "../baseballWalkResult"
import {
  isSettlementPitchResultJa,
  isStrikeoutResultJa,
} from "./paOutcomeResultJa"
import { isAtBat } from "./resultJaHitBases"

export { isWalkLikeResultText }

/**
 * 結果テキストの `[]` 内は注釈（作戦名・補足）として扱い、集計判定の基本は“本体”で行う。
 * 例: "捕ゴロ[ヒットエンドラン]" はアウトであり、注釈内の「ヒット」で安打扱いしてはいけない。
 */
export function stripBracketNotes(r: string | null | undefined): string {
  return String(r ?? "").replace(/\[[^\]]*\]/g, "").trim()
}

/**
 * 出場成績スロット等の「妨害」系略記（打数に含めない打席結果の目印）。
 * スポナビ表では `打妨` のみのセルがあり、`妨害` 文字列を含まない。
 */
export function isInterferenceResultText(r: string | null | undefined): boolean {
  const raw = (r ?? "").trim()
  if (!raw) return false
  return /妨害|打妨|打撃妨害|打者妨|守妨/.test(raw)
}

/**
 * 妨害（守備妨害など）の扱いルール（実務向け）:
 * - 原則: 妨害は打数に含めない（公式の扱いが多様で、単純な置換は危険）。
 * - 例外: 結果テキストに「三振/空三振/見三振」等が含まれる場合は、
 *   **三振で打者アウトになった後に妨害が付記されたケース**として扱い、
 *   打数・三振としてカウントする（例: "空三振[…守備妨害]"）。
 *
 * この判定は、順位表・個人成績の整合性（「三振後の出来事」）を優先したポリシー。
 */
export function shouldTreatInterferenceAsAtBat(r: string | null | undefined): boolean {
  const raw = (r ?? "").trim()
  if (!isInterferenceResultText(raw)) return false
  return /三振|空三振|見三振/.test(raw) || /^(空振り|見逃し)/.test(raw)
}

/** 安打か */
export function isHitResultJa(r: string | null | undefined): boolean {
  const raw = (r ?? "").trim()
  const s = stripBracketNotes(raw)
  // 「ランエンドヒット」はファウル／ボール行の補足で、文中に「ヒット」があっても安打ではない。
  if (/ランエンドヒット/.test(raw) && /^(ファウル|ボール)/.test(raw)) return false
  if (/^(左安|右安|中安|遊安|一安|二安|三安|投安|内安|二塁|三塁|本塁|ソロ|満塁)/.test(s)) return true
  if (/^(右|左|中)[２2]/.test(s) || /^(右|左|中)[３3]/.test(s)) return true
  return /安打|ヒット/.test(s)
}

/** 塁打数（単打=1 … 本塁打=4） */
export function getTotalBasesFromResultJa(r: string | null | undefined): number {
  const raw = (r ?? "").trim()
  const s = stripBracketNotes(raw)
  if (/本塁打|ホームラン|HR/i.test(s)) return 4
  if (/三塁打/.test(s)) return 3
  if (/二塁打/.test(s)) return 2
  if (/^(右|左|中)[３3]/.test(s)) return 3
  if (/^(右|左|中)[２2]/.test(s)) return 2
  if (isHitResultJa(s)) return 1
  return 0
}

export function isHomeRunFromResultJa(r: string | null | undefined): boolean {
  return getTotalBasesFromResultJa(r) === 4
}

export function isHbpResultJa(r: string | null | undefined): boolean {
  return /死球/.test((r ?? "").trim())
}

/** 犠飛・投犠打／捕犠打（ゾーン集計では sf 欄） */
export function isSfResultJa(r: string | null | undefined): boolean {
  return /犠飛|投犠打|捕犠打/.test((r ?? "").trim())
}

export type PaOutcomeStatsRow = {
  settlement: boolean
  atBat: boolean
  strikeout: boolean
  walk: boolean
  hbp: boolean
  sf: boolean
  hit: boolean
  totalBases: number
  homeRun: boolean
}

/** Python CLI 用: 1 文字列分のスナップショット */
export function paOutcomeStatsFromResultJa(
  r: string | null | undefined
): PaOutcomeStatsRow {
  const text = (r ?? "").trim()
  const tb = getTotalBasesFromResultJa(r)
  return {
    settlement: isSettlementPitchResultJa(r),
    atBat: isAtBat(text),
    strikeout: isStrikeoutResultJa(r),
    walk: isWalkLikeResultText(text),
    hbp: isHbpResultJa(r),
    sf: isSfResultJa(r),
    hit: isHitResultJa(r),
    totalBases: tb,
    homeRun: tb === 4,
  }
}
