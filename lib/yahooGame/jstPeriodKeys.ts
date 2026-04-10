/**
 * Phase 17: 試合日（YYYY-MM-DD）から暦月キー・火曜始まり週キー（その週の火曜の日付）を求める。
 * 曜日計算は UTC で暦日を固定（JST 当日と同一暦日として扱う）。
 */

/** `2026-03` */
export function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7)
}

/**
 * その日を含む「火曜〜日」の週の **火曜日** の YYYY-MM-DD。
 * SeasonStatsPilot の getWeekRangeTueToSun と同じ週境界。
 */
export function tuesdayWeekKeyFromYmd(ymd: string): string | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const date = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0))
  const day = date.getUTCDay()
  const daysFromTue = (day + 5) % 7
  date.setUTCDate(date.getUTCDate() - daysFromTue)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

/** 週キー（火曜 YYYY-MM-DD）から "M/D〜M/D" */
export function formatWeekRangeTueToSunFromTuesdayYmd(tuesdayYmd: string): string {
  const m = tuesdayYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return tuesdayYmd
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const tue = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0))
  const sun = new Date(tue)
  sun.setUTCDate(sun.getUTCDate() + 5)
  return `${tue.getUTCMonth() + 1}/${tue.getUTCDate()}〜${sun.getUTCMonth() + 1}/${sun.getUTCDate()}`
}
