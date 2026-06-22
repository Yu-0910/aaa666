/**
 * 投手「今季」PoC: 2026-03-27 広島 vs 中日（canonical と season-pitching 派生の既定試合）
 * 青柳晃洋ページは別試合のレガシー PoC を維持（page.tsx 側で分岐）
 */
export const DEFAULT_YAHOO_GAME_ID_HIROSHIMA_CHUNICHI_20260327 = "2021038624"

/** 青柳晃洋 PoC 試合（page.tsx の isAoyagiPage 分岐と一致） */
export const AOYAGI_POC_YAHOO_GAME_ID = "2021040084"

/**
 * season-pitching の canonicalGames から最新試合 ID を選ぶ。
 * ID は日付昇順で並ぶ前提のため、数値として最大のものを採用する。
 */
export function pickLatestCanonicalGameId(
  canonicalGames: string[] | undefined | null
): string | null {
  const ids = (canonicalGames ?? [])
    .map((g) => String(g).trim())
    .filter((g) => /^\d{10}$/.test(g))
  if (ids.length === 0) return null
  return ids.reduce((best, id) => (id >= best ? id : best))
}

/**
 * 球種・試合単位 API 用の yahooGameId。
 * URL 明示値 > 青柳 PoC > シーズン登板最新 > 広島–中日 PoC 既定。
 * 旧実装が全投手に付けた広島–中日 ID は、登板試合が分かれば差し替える。
 */
export function resolvePitcherPocYahooGameId(input: {
  explicitFromUrl: string
  isAoyagiPage: boolean
  canonicalGames: string[] | undefined | null
}): string {
  const { explicitFromUrl, isAoyagiPage, canonicalGames } = input
  if (isAoyagiPage) return AOYAGI_POC_YAHOO_GAME_ID

  const fromSeason = pickLatestCanonicalGameId(canonicalGames)
  const fallback = DEFAULT_YAHOO_GAME_ID_HIROSHIMA_CHUNICHI_20260327
  const explicit = explicitFromUrl.trim()

  if (!explicit) {
    return fromSeason ?? fallback
  }
  if (
    explicit === fallback &&
    fromSeason &&
    fromSeason !== fallback
  ) {
    return fromSeason
  }
  return explicit
}
