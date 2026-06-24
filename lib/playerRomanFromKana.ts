import { convertKanaToRomaji } from "@/lib/kanaToRomaji"

/** `M.Ikenaga` など略式 */
export function isAbbreviatedRomanName(s: string): boolean {
  const t = (s || "").trim()
  if (!t) return false
  return /^[A-Z]\.[A-Za-z][A-Za-z'.-]*$/.test(t)
}

type NpbPlayerMetaRoman = {
  name_kana?: string
  roman?: {
    name_en_full?: string
    name_en_short?: string
  }
}

/** 名簿外選手の表示用フル英字を決定 */
export function resolveNonRosterNameEnFull(meta: NpbPlayerMetaRoman | null | undefined): string {
  const kana = (meta?.name_kana ?? "").trim()
  const fromKana = kana ? convertKanaToRomaji(kana) : ""

  const metaFull = (meta?.roman?.name_en_full ?? "").trim()
  if (metaFull && !isAbbreviatedRomanName(metaFull)) return metaFull
  if (fromKana) return fromKana
  return metaFull
}
