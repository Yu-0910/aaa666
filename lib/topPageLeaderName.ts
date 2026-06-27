import { playerRomanNames } from "@/app/components/top/topPageConstants"
import { withOfficialRomanOverride } from "@/lib/playerOfficialRomanOverrides"

/**
 * TOP 等で使う略式ローマ字（例: K.Kozono = 名の頭文字 + 姓）。
 * `playerRomanNames` は「姓 名」（例: Sato Teruaki）を想定。
 * URL クエリ `roman` とも同一形式。
 */
export function abbreviatedRomanForUrl(leader: { romanName?: string; name: string }): string {
  const raw = withOfficialRomanOverride({
    romanName: leader.romanName || playerRomanNames[leader.name],
    name: leader.name,
  })
  if (!raw) return ""
  if (/^(?:[A-Z]\.)+[A-Za-z][A-Za-z'.-]*$/.test(raw)) return raw
  const parts = raw.split(/\s+/)
  if (parts.length >= 2) {
    const family = parts[0]!
    const given = parts[1]!
    const initial = given.length > 0 ? given[0]!.toUpperCase() : ""
    return `${initial}.${family}`
  }
  if (parts[0]!.length > 0) {
    return parts[0]!
  }
  return ""
}
