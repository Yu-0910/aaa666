/**
 * 名簿 name_ja と facounter 掲載名の差を吸収（同一人物・登録名変更・表記ゆれ）。
 * キーは名簿の name_ja、値は facounter 側の別表記。
 */
import { compactPlayerName } from "@/lib/playerNameNormalize"

export const ROSTER_FACOUNTER_NAME_ALIASES: Record<string, string[]> = {
  "Ｊ．ティマ": ["フリアン・ティマ", "ティマ"],
  モンテル: ["日隈 モンテル"],
  /** 2026年登録名「拓也」＝ facounter「矢崎 拓也」（同一人物・NPB 71575134） */
  拓也: ["矢崎 拓也"],
  /** 名簿「勝海」／facounter「雅海」（同一人物・NPB 41145134） */
  "石垣 勝海": ["石垣 雅海"],
}

/** 名簿 name_ja から facounter 突合に使う表示名候補 */
export function rosterNameKeysForFacounter(nameJa: string): string[] {
  const keys = new Set<string>()
  const base = (nameJa || "").trim()
  if (!base) return []
  keys.add(base)
  const aliases = ROSTER_FACOUNTER_NAME_ALIASES[base]
  if (aliases) for (const a of aliases) keys.add(a)
  return [...keys]
}

/** facounter 行をインデックス登録するときの表記候補（逆引き含む） */
export function facounterNamesForIndex(facounterNameJa: string): string[] {
  const keys = new Set<string>()
  const base = (facounterNameJa || "").trim()
  if (!base) return []
  keys.add(base)
  const c = compactPlayerName(base)
  for (const [rosterName, aliases] of Object.entries(ROSTER_FACOUNTER_NAME_ALIASES)) {
    if (compactPlayerName(rosterName) === c) {
      keys.add(rosterName)
      for (const a of aliases) keys.add(a)
    }
    for (const a of aliases) {
      if (compactPlayerName(a) === c) {
        keys.add(rosterName)
        for (const x of aliases) keys.add(x)
      }
    }
  }
  return [...keys]
}
