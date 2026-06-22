/** Yahoo 速報メタ / スポナビ試合ページと同一のデー・ナイター推定（hour>=17 → ナイター）。 */

export type DayNightKind = "day" | "night"

/** `raw_sportsnavi/{gameId}.html` の試合カード開始時刻 */
export function parseStartTimeFromSportsnaviGameHtml(html: string): string | null {
  const m = html.match(/bb-gameDescription__left[\s\S]*?<time>(\d{1,2}:\d{2})<\/time>/i)
  const t = (m?.[1] ?? "").trim()
  return /^\d{1,2}:\d{2}$/.test(t) ? t : null
}

export function inferDayNightFromStartTime(startTime: string): DayNightKind | null {
  const t = startTime.trim()
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null
  const [hStr, mStr] = t.split(":")
  const h = parseInt(hStr, 10)
  const mi = parseInt(mStr ?? "0", 10) || 0
  if (!Number.isFinite(h)) return null
  if (h > 17 || (h === 17 && mi >= 0)) return "night"
  return "day"
}

export function inferDayNightFromBlob(blob: string): DayNightKind | null {
  if (/ナイター/.test(blob)) return "night"
  if (/デ[ーイ]ゲーム|デー\s*戦|デイゲーム/.test(blob)) return "day"
  return null
}

export function resolveDayNightKind(opts: {
  metaKind?: string | null
  startTimeLocal?: string | null
  htmlBlob?: string | null
}): DayNightKind | null {
  const mk = (opts.metaKind ?? "").trim()
  if (mk === "day" || mk === "night") return mk
  const blob = opts.htmlBlob ?? ""
  const fromKeyword = inferDayNightFromBlob(blob)
  if (fromKeyword) return fromKeyword
  const st = (opts.startTimeLocal ?? "").trim()
  if (st) {
    const fromTime = inferDayNightFromStartTime(st)
    if (fromTime) return fromTime
  }
  return null
}
