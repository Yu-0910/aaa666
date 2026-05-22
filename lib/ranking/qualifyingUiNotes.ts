/**
 * 2026 規定ランキング向け UI 文言（Phase 2/3）
 */

import { shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { shouldRequireQualifyingPitching } from "@/lib/ranking/qualifyingPitching"

export const SEASON_2026_BATTING_QUALIFYING_NOTE =
  "2026: 規定は所属球団の試合消化数に応じて異なります（打席: 試合数×3.1）"

export const SEASON_2026_PITCHING_QUALIFYING_NOTE =
  "2026: 規定は所属球団の試合消化数に応じて異なります（投球回: 試合数×1.0）"

export const WEEKLY_2026_BATTING_QUALIFYING_NOTE =
  "週間成績（規定: 当週の所属球団試合数×3.1 打席）"

export const WEEKLY_2026_PITCHING_QUALIFYING_NOTE =
  "週間成績（規定: 当週の所属球団試合数×1.0 投球回）"

export function season2026BattingQualifyingNote(metricKey: string, year: string): string | undefined {
  if (year !== "2026" || !shouldRequireQualifyingPA(metricKey)) return undefined
  return SEASON_2026_BATTING_QUALIFYING_NOTE
}

export function season2026PitchingQualifyingNote(metricKey: string, year: string): string | undefined {
  if (year !== "2026" || !shouldRequireQualifyingPitching(metricKey)) return undefined
  return SEASON_2026_PITCHING_QUALIFYING_NOTE
}

/** 週間ページ: 率系は規定注記、カウント系は「週間成績」のみ */
export function weeklyBattingTitleSubNote(metricKey: string, year: string): string {
  if (year === "2026" && shouldRequireQualifyingPA(metricKey)) {
    return WEEKLY_2026_BATTING_QUALIFYING_NOTE
  }
  return "週間成績"
}

export function weeklyPitchingTitleSubNote(metricKey: string, year: string): string {
  if (year === "2026" && shouldRequireQualifyingPitching(metricKey)) {
    return WEEKLY_2026_PITCHING_QUALIFYING_NOTE
  }
  return "週間成績"
}
