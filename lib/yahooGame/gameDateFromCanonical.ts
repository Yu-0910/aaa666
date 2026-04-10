/**
 * canonical のタイトル文字列から試合開催日（日本の暦日）を取り出す。
 */

import type { CanonicalGameDocument } from "./types"

/** `YYYY-MM-DD` またはパース不能時は `null` */
export function parseGameDateYmdFromCanonical(doc: CanonicalGameDocument): string | null {
  const t = (doc.game?.meta?.documentTitle ?? doc.game?.meta?.ogTitle ?? "").trim()
  const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
