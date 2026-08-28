import { convertKanaToRomaji } from "@/lib/kanaToRomaji"
import { resolveOfficialRomanOverride } from "@/lib/playerOfficialRomanOverrides"
import { preferredRomanNameFromRankingSource } from "@/lib/ranking/preferredRomanName.server"

/** `M.Ikenaga` など略式 */
export function isAbbreviatedRomanName(s: string): boolean {
  const t = (s || "").trim()
  if (!t) return false
  return /^[A-Z]\.[A-Za-z][A-Za-z'.-]*$/.test(t)
}

type NpbPlayerMetaRoman = {
  player_id?: string
  npb_player_id?: string
  name_ja?: string
  name_kana?: string
  roman?: {
    name_en_full?: string
    name_en_short?: string
  }
}

/** 名簿外選手の表示用フル英字を決定 */
export function resolveNonRosterNameEnFull(meta: NpbPlayerMetaRoman | null | undefined): string {
  const official = resolveOfficialRomanOverride({
    npbPlayerId: meta?.npb_player_id ?? meta?.player_id,
    name: meta?.name_ja,
  })
  if (official) return official

  const fromRanking = preferredRomanNameFromRankingSource(meta?.npb_player_id ?? meta?.player_id)
  if (fromRanking) return fromRanking

  const kana = (meta?.name_kana ?? "").trim()
  const fromKana = kana ? convertKanaToRomaji(kana) : ""

  const metaFull = (meta?.roman?.name_en_full ?? "").trim()
  if (metaFull && !isAbbreviatedRomanName(metaFull)) return metaFull
  if (fromKana) return fromKana
  return metaFull
}
