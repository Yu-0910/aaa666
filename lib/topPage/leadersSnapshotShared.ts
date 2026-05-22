/**
 * トップ用リーダースナップショットの共有定数（クライアント／サーバー両方で利用可。fs 非依存）
 */

export const TOP_LEADERS_SNAPSHOT_YEAR = "2026"

export type TopLeadersCategory = "batting" | "pitching"

export function topLeadersSnapshotPublicUrl(
  year: string,
  league: string,
  category: TopLeadersCategory
): string {
  return `/data/top-leaders/${year}/${league.toUpperCase()}/${category}.json`
}

export function usesTopLeadersSnapshot(year: string | number): boolean {
  return String(year) === TOP_LEADERS_SNAPSHOT_YEAR
}
