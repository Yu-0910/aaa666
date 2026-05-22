/** 2025 TOP 打撃：OPS｜打率／本塁打｜打点の2×2（左→右、上→下） */
export const BATTING_TOP_2025_GRID_METRICS = ["OPS", "打率", "本塁打", "打点"] as const

/** 上4指標の「打点」は1〜3位を表示（他指標と同様） */
export const BATTING_TOP_2025_RBI_TOP_N = 3

/** 今週タブ打撃：OPS・打率・本塁打・打点のみ、各指標トップ5 */
export const BATTING_WEEKLY_TAB_TOP_N = 5

/** トップページで 2025/2026 打撃の指標タイトル・行レイアウトを共通化する年度 */
export function usesTopBattingModernLayout(year: number): boolean {
  return year === 2025 || year === 2026
}

/** 指標見出し（中央の黄色タイトル）をモダン表示するか。2025年は打撃・投球とも従来どおり */
export function usesTopPageModernMetricTitle(
  year: number,
  statsCategory: "batting" | "pitching"
): boolean {
  return (
    year === 2025 ||
    (usesTopBattingModernLayout(year) && statsCategory === "batting") ||
    (year === 2026 && statsCategory === "pitching")
  )
}

/**
 * リーダー行：日本語名＋数値の1行、その下に英字名（2025 TOP と同型）。
 * 2026 の TOP・今週タブ（打撃・投球）でも同じ。
 */
export function usesTopPageModernLeaderRow(
  year: number,
  statsCategory: "batting" | "pitching"
): boolean {
  if (year === 2025) return true
  if (year === 2026 && (statsCategory === "batting" || statsCategory === "pitching")) {
    return true
  }
  return usesTopBattingModernLayout(year) && statsCategory === "batting"
}

/** 上4指標ブロック（globals.css の .batting-top-2025-four-* と対） */
export const BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS =
  "batting-top-2025-four-metrics flex flex-col gap-1 w-full"
export const BATTING_TOP_2025_FOUR_GRID_CLASS = "batting-top-2025-four-grid"

export function battingTop2025GridReady(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.every((m) => leaders[m]?.length)
}

/** 上4指標のうち1つでもリーダーがあれば2×2レイアウトを使う */
export function shouldShowTopBattingFourGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}
