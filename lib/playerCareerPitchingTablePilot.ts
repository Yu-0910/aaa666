import { isPitcherRegistrationPosition } from "@/lib/rosterPitcher"
import type { NpbRosterPlayer } from "@/lib/npbRoster"

/** 日本ハムの投手のうち、通算で打撃成績も掲載する例外（矢澤・柴田） */
export const NIPPON_HAM_PITCHER_CAREER_BATTING_EXCEPTION_NPB_IDS = new Set([
  "73375157", // 矢澤 宏太
  "81085150", // 柴田 獅子
])

export type RosterPitcherCareerTableMatch = Pick<
  NpbRosterPlayer,
  "npb_player_id" | "name_ja" | "position"
>

/**
 * 2026 名簿に名前があり、投手として登録されている選手か（通算投手表・キャリアハイ UI 対象）。
 * 矢澤・柴田は打撃表を優先するため除外。
 */
/** 通算成績表の表・文字・数値スケール（全選手共通） */
export const CAREER_TABLE_SCALE_MULTIPLIER = 1.2

export function careerTableScaleMultiplier(
  _npbPlayerId?: string | null | undefined,
): number {
  return CAREER_TABLE_SCALE_MULTIPLIER
}

/** @deprecated careerTableScaleMultiplier を使用 */
export const careerPitchingTableScaleMultiplier = careerTableScaleMultiplier

export function usesPitcherCareerPitchingTableFromRosterMatch(
  matched: RosterPitcherCareerTableMatch | null | undefined,
): boolean {
  if (!matched) return false
  const id = (matched.npb_player_id || "").trim()
  if (!id) return false
  if (NIPPON_HAM_PITCHER_CAREER_BATTING_EXCEPTION_NPB_IDS.has(id)) return false
  if (!(matched.name_ja || "").trim()) return false
  return isPitcherRegistrationPosition(matched.position, { rosterNpbPlayerId: id })
}
