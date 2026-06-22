/**
 * 旧 player-N + ?roman= URL から NPB ID 個人ページへリダイレクトするマップ。
 * 生成: python _tools/patch_ranking_player_links_to_npb.py
 */

let cachedRomanAliases: Record<string, string> | null = null

export function isPlaceholderPlayerPageId(id: string): boolean {
  return /^player-\d+$/i.test((id || "").trim())
}

export async function resolveNpbIdFromRomanAlias(roman: string): Promise<string | null> {
  const key = (roman || "").trim()
  if (!key) return null

  if (!cachedRomanAliases) {
    try {
      const res = await fetch("/data/player_page_roman_aliases.json", { cache: "no-store" })
      if (!res.ok) return null
      const data = (await res.json()) as unknown
      cachedRomanAliases =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, string>)
          : {}
    } catch {
      cachedRomanAliases = {}
    }
  }

  const npbId = (cachedRomanAliases[key] || "").trim()
  return npbId || null
}
