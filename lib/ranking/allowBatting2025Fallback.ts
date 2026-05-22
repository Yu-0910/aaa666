/**
 * 打撃ランキングで 2026 欠損時に 2025 JSON を返すか。
 * 本番・R2 参照時は無効（2025 成績が 2026 ページに見える混乱を防ぐ）。
 */
export function allowBatting2025Fallback(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (String(process.env.RANKINGS_BASE_URL || '').trim()) return false
  return true
}
