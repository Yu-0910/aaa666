import { playerRomanNames } from "@/app/components/top/topPageConstants"

/**
 * TOP 等で使う略式ローマ字（例: K.Kozono = 名の頭文字 + 姓）。
 * `playerRomanNames` は「姓 名」（例: Sato Teruaki）を想定。
 * URL クエリ `roman` とも同一形式。
 */
export function abbreviatedRomanForUrl(leader: { romanName?: string; name: string }): string {
  const raw = (leader.romanName || playerRomanNames[leader.name] || "").trim()
  if (!raw) return ""
  if (/^[A-Z]\.[A-Za-z]+$/.test(raw)) return raw
  const parts = raw.split(/\s+/)
  if (parts.length >= 2) {
    const family = parts[0]!
    const given = parts[1]!
    const initial = given.length > 0 ? given[0]!.toUpperCase() : ""
    return `${initial}.${family}`
  }
  if (parts[0]!.length > 0) {
    const n = parts[0]!
    return `${n[0]!.toUpperCase()}.${n}`
  }
  return ""
}
