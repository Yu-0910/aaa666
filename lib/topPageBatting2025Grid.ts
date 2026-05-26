/** 2025 TOP 打撃（シーズン）: OPS｜打率｜本塁打（3等分）｜打点 */
export const BATTING_TOP_2025_SEASON_PAIR_METRICS = ["打率", "本塁打"] as const

/** 2×2 または週間タブ: OPS / 打率 / 本塁打 / 打点 を各セルに配置 */
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

/** 上4指標ブロック（globals.css の .batting-top-2025-four-*。グリッド下限は 18rem / 列 8.75rem） */
export const BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS =
  "batting-top-2025-four-metrics flex flex-col gap-1 w-full"
export const BATTING_TOP_2025_FOUR_GRID_CLASS = "batting-top-2025-four-grid"
export const BATTING_TOP_2025_SEASON_GRID_CLASS = "batting-top-2025-season-grid"

/** 2025 シーズン TOP のみ: 打率と本塁打を同一行セル内で横並び */
export function usesTopBatting2025SeasonPairedLayout(year: number, isWeeklyTab: boolean): boolean {
  return year === 2025 && !isWeeklyTab
}

/** 2025 シーズン TOP のみ: 選手名・数値などを一段小さく */
export function usesTopBatting2025CompactTypography(year: number, isWeeklyTab: boolean): boolean {
  return year === 2025 && !isWeeklyTab
}

export type TopLeaderRowTypography = {
  rankBadge: string
  rankText: string
  teamBar: string
  playerName: string
  statValue: string
  romanName: string
  metricTitle: string
  statsListLink: string
  metricHeaderMinH: string
}

export function topLeaderRowTypography(
  year: number,
  statsCategory: "batting" | "pitching",
  isWeeklyTab = false
): TopLeaderRowTypography {
  const compact =
    usesTopBatting2025CompactTypography(year, isWeeklyTab) && statsCategory === "batting"
  if (compact) {
    return {
      rankBadge: "w-3.5 h-3.5",
      rankText: "text-[9px]",
      teamBar: "h-[1.65rem]",
      playerName: "text-xs",
      statValue: "text-base",
      romanName: "text-[9px]",
      metricTitle: "text-[11px]",
      statsListLink: "text-[8px]",
      metricHeaderMinH: "min-h-[20px]",
    }
  }
  return {
    rankBadge: "w-4 h-4",
    rankText: "text-[10px]",
    teamBar: "h-[1.95rem]",
    playerName: "text-sm",
    statValue: "text-lg",
    romanName: "text-[10px]",
    metricTitle: "text-[13px]",
    statsListLink: "text-[9px]",
    metricHeaderMinH: "min-h-[22px]",
  }
}

export function battingTop2025GridReady(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.every((m) => leaders[m]?.length)
}

/** 上4指標のうち1つでもリーダーがあれば2×2レイアウトを使う */
export function shouldShowTopBattingFourGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}
