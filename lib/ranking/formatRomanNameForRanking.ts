/**
 * ランキング・名簿の英字を「イニシャル.姓」形式に揃える（RankingUI と同一ロジック）
 * 名簿の日本人は英字が「姓 名」順（Morishita Shota）のため nameJa を渡す。
 */

import { isJapaneseNpbListedNameJa } from "@/lib/playerNameNormalize"

export type FormatRomanNameOptions = {
  /** 名簿の name_ja（日本人判定に使用） */
  nameJa?: string
}

export function formatRomanNameForRanking(romanName: string, opts?: FormatRomanNameOptions): string {
  const trimmed = romanName.trim()
  if (!trimmed) return ""

  const alreadyFormattedPattern = /^(?:[A-Z]\.)+(?:[A-Z][a-z]+|[A-Z]+|[A-Za-z][A-Za-z'.-]*)$/
  if (alreadyFormattedPattern.test(trimmed)) {
    return trimmed
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 0) return ""

  if (parts.length === 1) {
    const name = parts[0]
    return name.length > 0 ? name : ""
  }

  const ja = opts?.nameJa?.trim()
  if (parts.length === 2) {
    if (ja && isJapaneseNpbListedNameJa(ja)) {
      const surname = parts[0]
      const given = parts[1]
      if (given.length > 0 && surname.length > 0) {
        return `${given[0].toUpperCase()}.${surname}`
      }
    }
    const given = parts[0]
    const surname = parts[1]
    if (given.length > 0 && surname.length > 0) {
      return `${given[0].toUpperCase()}.${surname}`
    }
    return ""
  }

  const firstName = parts[parts.length - 1]
  const lastName = parts.slice(0, -1).join(" ")
  const initial = lastName.length > 0 ? lastName[0].toUpperCase() : ""
  return `${initial}.${firstName}`
}
