/** TOP ページ yearOptions（2026〜1950）と同期 */
export const TOP_PAGE_MODERN_LAYOUT_MIN_YEAR = 1950
export const TOP_PAGE_MODERN_LAYOUT_MAX_YEAR = 2026

/** 2026 系モダン UI（9指標グリッド・コンパクト typography・2段リーダー行）を使う年度 */
export function usesTopPageModernLayout(year: number): boolean {
  return (
    Number.isFinite(year) &&
    year >= TOP_PAGE_MODERN_LAYOUT_MIN_YEAR &&
    year <= TOP_PAGE_MODERN_LAYOUT_MAX_YEAR
  )
}
