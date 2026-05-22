/**
 * 週間ランキング用の週キー（Phase 0: 火曜始まり、今週 + 直近 N-1 週）
 */

import {
  tuesdayWeekKeyFromYmd,
  formatWeekRangeTueToSunFromTuesdayYmd,
} from "@/lib/yahooGame/jstPeriodKeys"

export const WEEKLY_RANKINGS_WEEKS_TO_KEEP = 4

/** JST 暦日 YYYY-MM-DD */
export function todayYmdJst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  if (!y || !m || !d) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  }
  return `${y}-${m}-${d}`
}

export function addDaysToYmd(ymd: string, days: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ymd
  const date = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + days, 3, 0, 0))
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

/** ビルド対象の火曜 weekKey 一覧（新しい順） */
export function weekKeysToBuild(anchorYmd: string, count = WEEKLY_RANKINGS_WEEKS_TO_KEEP): string[] {
  const current = tuesdayWeekKeyFromYmd(anchorYmd)
  if (!current) return []
  const keys: string[] = [current]
  let w = current
  for (let i = 1; i < count; i++) {
    w = addDaysToYmd(w, -7)
    keys.push(w)
  }
  return keys
}

export function weekLabelForKey(weekKey: string): string {
  return formatWeekRangeTueToSunFromTuesdayYmd(weekKey)
}
