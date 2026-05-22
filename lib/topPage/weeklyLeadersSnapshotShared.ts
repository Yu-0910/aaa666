/**
 * 週間トップ用リーダースナップショット（クライアント／サーバー共有・fs 非依存）
 */

import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"

export const TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR = "2026"

export function topWeeklyLeadersSnapshotPublicUrl(
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory
): string {
  return `/data/top-leaders/weekly/${year}/${weekKey}/${league.toUpperCase()}/${category}.json`
}

export function topWeeklyCurrentWeekPublicUrl(year: string): string {
  return `/data/rankings/weekly/${year}/current-week.json`
}
