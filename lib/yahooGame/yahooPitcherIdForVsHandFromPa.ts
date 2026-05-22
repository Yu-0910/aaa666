import type { PlateAppearance } from "./types"

/**
 * 対左右（vs_hand）打席分けに使う投手 Yahoo ID。
 *
 * **打席途中の投手交代**: `pa.yahooPitcherId` が先発のままのデータでも、`pitchEvents` の **配列末尾側**
 *（実質最終球に近い方）の `yahooPitcherId` を優先する。
 *
 * **注意**: `pitchIndex` でソートし直すと、取得データによって順序が実試合とずれ「最終球」が誤る例があったため、
 * **マージ済み canonical の配列順**をそのまま末尾から走査する（Phase10 マージは pitch_no 順で並べている）。
 *
 * `pitchEvents` が無いときは `pa.yahooPitcherId` のみ。
 */
export function yahooPitcherIdForVsHandFromPa(pa: PlateAppearance): string {
  const pe = pa.pitchEvents ?? []
  for (let i = pe.length - 1; i >= 0; i--) {
    const id = String(pe[i]?.yahooPitcherId ?? "").trim()
    if (id) return id
  }
  return String(pa.yahooPitcherId ?? "").trim()
}

/**
 * 打席ログに現れる投手 Yahoo ID のユニーク集合（対左右・統合インデックス双方で参照）。
 * - vs_hand と同じ「末尾 pitchEvents 優先」の代表 ID
 * - 打席途中交代などで途中の一球に別 ID が付く場合も拾う
 */
export function collectPitcherYahooIdsFromPlateAppearance(pa: PlateAppearance): string[] {
  const ids = new Set<string>()
  const main = yahooPitcherIdForVsHandFromPa(pa)
  if (/^\d+$/.test(main)) ids.add(main)
  for (const e of pa.pitchEvents ?? []) {
    const id = String(e.yahooPitcherId ?? "").trim()
    if (/^\d+$/.test(id)) ids.add(id)
  }
  return [...ids]
}
