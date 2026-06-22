/**
 * 英字名マップのキー正規化・参照のみ（fs / 名簿に依存しない）。
 * Client Component から import 可。
 */

import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"

/** roman-names API と同一の球団フル名 → 短縮名（クライアント照合用） */
const CSV_TEAM_TO_RANKING_SHORT: Record<string, string> = {
  中日ドラゴンズ: "中日",
  広島東洋カープ: "広島",
  東京ヤクルトスワローズ: "ヤクルト",
  読売ジャイアンツ: "巨人",
  阪神タイガース: "阪神",
  横浜DeNAベイスターズ: "DeNA",
  "オリックス・バファローズ": "オリックス",
  千葉ロッテマリーンズ: "ロッテ",
  北海道日本ハムファイターズ: "日本ハム",
  東北楽天ゴールデンイーグルス: "楽天",
  埼玉西武ライオンズ: "西武",
  福岡ソフトバンクホークス: "ソフトバンク",
}

function romanNameJaVariants(nameJa: string): string[] {
  const variants = new Set<string>()
  const trimmed = (nameJa ?? "").trim()
  if (!trimmed) return []
  variants.add(trimmed)
  variants.add(trimmed.replace(/\u3000/g, " "))
  variants.add(compactPlayerName(trimmed))
  variants.add(rosterNameMatchKey(trimmed))
  const noInitial = rosterNameMatchKey(trimmed)
    .replace(/^[\uFF21-\uFF3A\uFF41-\uFF5A][．.]/u, "")
    .replace(/^[A-Za-z][.]/iu, "")
  if (noInitial) variants.add(noInitial)
  return [...variants].filter(Boolean)
}

function teamLookupVariants(teamShort: string): string[] {
  const variants = new Set<string>()
  const t = (teamShort ?? "").trim()
  if (!t) return []
  variants.add(t)
  const full = Object.keys(CSV_TEAM_TO_RANKING_SHORT).find((k) => CSV_TEAM_TO_RANKING_SHORT[k] === t)
  if (full) variants.add(full)
  return [...variants]
}

function teamPartsMatch(teamPart: string, candidates: readonly string[]): boolean {
  const key = rosterNameMatchKey(teamPart)
  return candidates.some((t) => t === teamPart || rosterNameMatchKey(t) === key)
}

/**
 * roman-names API マップから英字名を解決（ランキングと同ソース、クライアント安全）。
 * 外国人の「ウィットリー」↔「Ｆ．ウィットリー」表記差は suffix 照合で吸収。
 */
export function resolveRomanNameFromMap(
  nameJa: string,
  teamShort: string,
  romanMap: Record<string, string>,
): string | undefined {
  const names = romanNameJaVariants(nameJa)
  const teams = teamLookupVariants(teamShort)

  for (const n of names) {
    for (const t of teams) {
      const v = lookupRomanInMap(romanMap, n, t)
      if (v) return v
    }
  }

  if (teams.length > 0) {
    const suffixes = names.map((n) => rosterNameMatchKey(n)).filter((n) => n.length >= 2)
    for (const key of Object.keys(romanMap)) {
      const pipe = key.indexOf("|")
      if (pipe < 0) continue
      const namePart = key.slice(0, pipe)
      const teamPart = key.slice(pipe + 1)
      if (!teamPartsMatch(teamPart, teams)) continue
      const nameKey = rosterNameMatchKey(namePart)
      for (const s of suffixes) {
        if (nameKey === s || nameKey.endsWith(s) || s.endsWith(nameKey)) {
          const en = romanMap[key]?.trim()
          if (en) return en
        }
      }
    }
  }

  return lookupRomanInMap(romanMap, nameJa, "")
}

/** マップキー用: 名前とチームを正規化（全角スペース→半角スペース、trim） */
export function normalizeRomanMapKey(name: string, team: string): string {
  const n = (name ?? '').toString().replace(/\u3000/g, ' ').trim()
  const t = (team ?? '').toString().trim()
  return `${n}|${t}`
}

/** スペースを除去したキー（照合の確実性のため両方登録） */
export function normalizeRomanMapKeyNoSpace(name: string, team: string): string {
  const n = (name ?? '').toString().replace(/[\s\u3000]/g, '').trim()
  const t = (team ?? '').toString().trim()
  return `${n}|${t}`
}

/**
 * API 取得後のマップから、行の name/team で英字名を引く（NFKC フォールバック付き）
 */
function lookupRomanInMapNameOnly(map: Record<string, string>, name: string): string | undefined {
  const prefixes = [normalizeRomanMapKey(name, ""), normalizeRomanMapKeyNoSpace(name, "")]
  for (const key of Object.keys(map)) {
    for (const p of prefixes) {
      if (p && key.startsWith(p)) {
        const en = map[key]?.trim()
        if (en) return en
      }
    }
  }
  try {
    const n2 = name.normalize("NFKC")
    if (n2 !== name) return lookupRomanInMapNameOnly(map, n2)
  } catch {
    /* ignore */
  }
  return undefined
}

export function lookupRomanInMap(map: Record<string, string>, name: string, team: string): string | undefined {
  const tryPair = (n: string, t: string): string | undefined => {
    const a = map[normalizeRomanMapKey(n, t)]?.trim()
    if (a) return a
    const b = map[normalizeRomanMapKeyNoSpace(n, t)]?.trim()
    if (b) return b
    return undefined
  }

  let v = tryPair(name, team)
  if (v) return v
  try {
    const n2 = name.normalize("NFKC")
    if (n2 !== name) v = tryPair(n2, team)
  } catch {
    /* ignore */
  }
  if (v) return v
  if (!(team ?? "").toString().trim()) {
    return lookupRomanInMapNameOnly(map, name)
  }
  return undefined
}
