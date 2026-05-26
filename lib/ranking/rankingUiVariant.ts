/** ランキング表で 2025 年版のコンパクト UI（列幅・選手ブロック・指標フォント）を使う年度 */
export function usesRanking2025CompactTableUi(season: string): boolean {
  return season === "2025" || season === "2026"
}
