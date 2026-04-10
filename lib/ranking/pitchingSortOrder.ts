/**
 * 投手ランキング URL の `order` と一覧のデフォルトソートを共有（トップ導線・PitchingRankingPageClient で一致させる）
 */
export function getPitchingSortOrderForKey(metricKey: string): 'asc' | 'desc' {
  const k = metricKey.toLowerCase()
  const asc = new Set([
    'era',
    'whip',
    'avg_against',
    'babip_against',
    'obp_against',
    'slg_against',
    'p_ip',
    'bb_pct',
  ])
  if (asc.has(k)) return 'asc'
  return 'desc'
}
