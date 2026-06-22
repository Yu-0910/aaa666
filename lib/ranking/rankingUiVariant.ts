import { usesTopPageModernLayout } from "@/lib/topPageModernLayout"

/** ランキング表でコンパクト UI（列幅・選手ブロック・指標フォント）を使う年度 */
export function usesRanking2025CompactTableUi(season: string): boolean {
  const year = Number(season)
  return usesTopPageModernLayout(year)
}
