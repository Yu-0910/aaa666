import { normalizeStadiumSplitValue } from "@/lib/stadiumVenueNormalize"

/**
 * スポナビ 1軍リーグ戦日程 HTML（Phase 0）から gameId・球場名を抽出する。
 * 球場名は試合枠左上の `bb-scheduleTable__stadium` 列（同一 `<tr>` 内の game リンク）。
 */

export type ScheduleGameEntry = {
  gameId: string
  stadiumName: string
}

export function stripHtmlToText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 日程表の表示名をマスタで正規化（空のみ「未設定」）。 */
export function normalizeStadiumNameFromSchedule(raw: string): string {
  const s = stripHtmlToText(raw)
  return normalizeStadiumSplitValue(s)
}

const SCHEDULE_DAY_HEAD_MARKER = 'bb-scheduleTable__head" scope="row"'

/** 当日セルだけに切る（休養日のあと tbody 全体を取らない）。 */
function sliceScheduleDayBlock(html: string, dayThNeedle: string): string {
  const start = html.indexOf(dayThNeedle)
  if (start < 0) return ""
  const afterStart = start + dayThNeedle.length
  const nextDayHead = html.indexOf(SCHEDULE_DAY_HEAD_MARKER, afterStart)
  if (nextDayHead >= 0) return html.slice(start, nextDayHead)
  const tbodyEnd = html.indexOf("</tbody>", afterStart)
  return tbodyEnd >= 0 ? html.slice(start, tbodyEnd) : html.slice(start)
}

export function scopeScheduleHtmlForDate(html: string, ymd: string): string {
  const month = parseInt(ymd.slice(5, 7), 10)
  const day = parseInt(ymd.slice(8, 10), 10)
  const jaNeedle = `${month}月${day}日`
  const rowspanCandidates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  for (const rowspan of rowspanCandidates) {
    const dayThNeedle = `${SCHEDULE_DAY_HEAD_MARKER} rowspan="${rowspan}">${jaNeedle}`
    const scoped = sliceScheduleDayBlock(html, dayThNeedle)
    if (scoped) return scoped
  }

  const titleNeedle = `bb-head01__title">${jaNeedle}`
  const tStart = html.indexOf(titleNeedle)
  if (tStart < 0) return ""
  const tNext = html.indexOf(`bb-head01__title">`, tStart + titleNeedle.length)
  return tNext >= 0 ? html.slice(tStart, tNext) : html.slice(tStart)
}

export function extractGamesFromScopedHtml(scoped: string): ScheduleGameEntry[] {
  const games: ScheduleGameEntry[] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let trm: RegExpExecArray | null
  while ((trm = trRe.exec(scoped))) {
    const row = trm[1] ?? ""
    const gidM = row.match(/href="\/npb\/game\/(\d+)\/index"/)
    if (!gidM) continue
    const gameId = gidM[1]!.trim()
    if (!gameId) continue

    let stadiumRaw = ""
    const stTd = row.match(
      /<td[^>]*\bclass="[^"]*bb-scheduleTable__stadium[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
    )
    if (stTd) {
      stadiumRaw = stTd[1] ?? ""
    } else {
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      for (const td of tds) {
        const inner = td[1] ?? ""
        if (inner.includes("/npb/game/") || inner.includes("/npb/teams/")) continue
        const text = stripHtmlToText(inner)
        if (!text || text.length > 48) continue
        if (/^\d+\s*-\s*\d+$/.test(text)) continue
        if (/^(予|勝|敗|Ｓ)/.test(text)) continue
        stadiumRaw = inner
        break
      }
    }

    games.push({
      gameId,
      stadiumName: normalizeStadiumNameFromSchedule(stadiumRaw),
    })
  }
  return games
}

export function extractGamesFromScheduleHtml(html: string, ymd: string): ScheduleGameEntry[] {
  const scoped = scopeScheduleHtmlForDate(html, ymd)
  if (!scoped) return []
  const hasGameLink = /href="\/npb\/game\/\d+\/index"/.test(scoped)
  if (!hasGameLink && /試合はありません/.test(scoped)) return []
  return extractGamesFromScopedHtml(scoped)
}

export function extractGameIdsFromScheduleHtml(html: string, ymd: string): string[] {
  const ids = extractGamesFromScheduleHtml(html, ymd).map((g) => g.gameId)
  return [...new Set(ids)].sort()
}
