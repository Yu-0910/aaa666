/**
 * 英字名マップのキー正規化・参照のみ（fs / 名簿に依存しない）。
 * Client Component から import 可。
 */

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
