/** 公式戦集計で共有する試合種別フィルタ。 */

import type { ScheduleGameEntry } from "./sportsnaviScheduleParse"

const REGULAR_SEASON_START_BY_YEAR: Record<string, string> = {
  "2026": "2026-03-27",
}

function isAllStarText(value: unknown): boolean {
  return /オールセリーグ|オールパリーグ|全セ|全パ/.test(String(value ?? ""))
}

/** 指定年度の日付がレギュラーシーズン期間内か。未登録年度は従来互換で通す。 */
export function isRegularSeasonDate(year: string, ymd: string): boolean {
  const start = REGULAR_SEASON_START_BY_YEAR[year]
  return !start || ymd >= start
}

/** canonicalの試合が公式戦集計対象か。 */
export function isRegularSeasonCanonicalGame(
  year: string,
  ymd: string,
  documentTitle?: string,
): boolean {
  return isRegularSeasonDate(year, ymd) && !isAllStarText(documentTitle)
}

/** Phase0日程の試合が公式戦取得・集計対象か。 */
export function isRegularSeasonScheduleGame(
  year: string,
  ymd: string,
  game?: Pick<ScheduleGameEntry, "homeTeamShort" | "awayTeamShort"> | null,
): boolean {
  if (!isRegularSeasonDate(year, ymd)) return false
  return !isAllStarText(`${game?.homeTeamShort ?? ""} ${game?.awayTeamShort ?? ""}`)
}
