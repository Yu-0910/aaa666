/** 2026 TOP 投球：打撃TOPと同じUIで各1〜5位を表示する指標（3×2） */
// NOTE: ランキング JSON のファイル名は「セーブ」ではなく「Ｓ」（pitching_metric_map.json で同義）。
// UI 表示は topPagePitchingMetricTitle で「セーブ」に置換する。
export const PITCHING_TOP_2026_GRID_METRICS = ["防御率", "勝利", "K-BB％", "K％", "HLD", "Ｓ"] as const

/** 2026 TOP 投球：mini（1位のみ）は使わない */
export const PITCHING_TOP_2026_MINI_METRICS = [] as const

/** 2026 TOP・今週タブで投球もモダンUI（3×2 グリッド） */
export function usesTopPitchingModernLayout(year: number, _isWeeklyTab = false): boolean {
  return year === 2026
}

export { shouldShowTopPitchingSeasonGrid as shouldShowTopPitchingFourGrid } from "@/lib/topPageTopSeasonGrid2026"
