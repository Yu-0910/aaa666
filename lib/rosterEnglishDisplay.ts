import { compactPlayerName } from "@/lib/playerNameNormalize"

/** 名簿 CSV 行から個人ページ用のフル英字（Western order）を返す */
export function rosterEnglishFullFromCsvRow(p: {
  name_ja: string
  name_en: string
  name_en_full?: string
}): string {
  const a = (p.name_en_full ?? "").trim()
  if (a) return a
  return (p.name_en ?? "").trim()
}

/**
 * 日本語名の別表記（Ｔ．ハーン ↔ ハーン 等）でも英字を引けるようキーを列挙
 * （lib/npbRoster の rosterJaNameLookupKeys と同じルール）
 */
export function rosterEnglishAliasKeys(nameJa: string, englishFull: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!englishFull) return out
  const c = compactPlayerName(nameJa)
  out[nameJa] = englishFull
  if (c) out[c] = englishFull
  const noInitial = c
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.]/u, "")
  if (noInitial && noInitial !== c) out[noInitial] = englishFull
  return out
}
