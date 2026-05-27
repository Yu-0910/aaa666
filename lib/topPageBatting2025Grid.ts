import type { LeaderRow } from "@/lib/ranking/leadersTypes"

/** 2025/2026 シーズン TOP: OPS｜打率｜本塁打（3等分）｜打点。今週タブは 2×2 */
/** 2025 シーズン TOP のみ: 各指標5位まで（デザイン確認用。4–5位は不足時プレースホルダ） */
export const BATTING_TOP_2025_SEASON_TOP_METRICS = ["OPS", "打率", "本塁打"] as const
/** 2026 シーズン TOP 下段: OPS/打率/本塁打 と同型（各1〜5位） */
export const BATTING_TOP_2026_SEASON_ROW2_METRICS = ["打点", "出塁率", "長打率"] as const
export const BATTING_TOP_2026_SEASON_ALL_METRICS = [
  ...BATTING_TOP_2025_SEASON_TOP_METRICS,
  ...BATTING_TOP_2026_SEASON_ROW2_METRICS,
] as const
export const BATTING_TOP_2025_SEASON_TOP_N = 5

/** 2×2 または週間タブ: OPS / 打率 / 本塁打 / 打点 を各セルに配置 */
export const BATTING_TOP_2025_GRID_METRICS = ["OPS", "打率", "本塁打", "打点"] as const

/** 上4指標の「打点」は1〜3位を表示（他指標と同様） */
export const BATTING_TOP_2025_RBI_TOP_N = 3

/** 今週タブ打撃：OPS・打率・本塁打・打点のみ、各指標トップ5 */
export const BATTING_WEEKLY_TAB_TOP_N = 5

function usesTopPage2025DesignYear(year: number): boolean {
  return year === 2025 || year === 2026
}

/** トップページで 2025 系モダン打撃レイアウト（2026 は6指標グリッド、2025 今週のみ 2×2）を使うか */
export function usesTopBattingModernLayout(year: number, _isWeeklyTab = false): boolean {
  return usesTopPage2025DesignYear(year)
}

/** 指標見出し（中央の黄色タイトル）をモダン表示するか */
export function usesTopPageModernMetricTitle(
  year: number,
  statsCategory: "batting" | "pitching",
  isWeeklyTab = false
): boolean {
  if (statsCategory === "pitching") return year === 2026
  return usesTopBattingModernLayout(year, isWeeklyTab) && statsCategory === "batting"
}

/**
 * リーダー行：日本語名＋数値の1行、その下に英字名（2025 TOP と同型）。
 * 2026 の TOP・今週タブ（打撃・投球）でも同じ。
 */
export function usesTopPageModernLeaderRow(
  year: number,
  statsCategory: "batting" | "pitching",
  isWeeklyTab = false
): boolean {
  // 2026 TOP・今週タブでは投球も打撃と同じ「2段」リーダー行（名前＋数値／英字名）に揃える。
  if (statsCategory === "pitching") return year === 2026
  return usesTopBattingModernLayout(year, isWeeklyTab) && statsCategory === "batting"
}

/** 上4指標ブロック（globals.css の .batting-top-2025-four-*。グリッド下限は 18rem / 列 8.75rem） */
export const BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS =
  "batting-top-2025-four-metrics flex flex-col gap-1 w-full"
export const BATTING_TOP_2025_FOUR_GRID_CLASS = "batting-top-2025-four-grid"
export const BATTING_TOP_2025_SEASON_GRID_CLASS = "batting-top-2025-season-grid"

/** 2025/2026 シーズン TOP: OPS｜打率｜本塁打（3等分）＋打点。2026 今週タブも同型 */
export function usesTopBatting2025SeasonPairedLayout(year: number, isWeeklyTab: boolean): boolean {
  return usesTopPage2025DesignYear(year) && (!isWeeklyTab || year === 2026)
}

/** 2025/2026 シーズン TOP: コンパクト typography。2026 今週タブも同型 */
export function usesTopBatting2025CompactTypography(year: number, isWeeklyTab: boolean): boolean {
  return usesTopPage2025DesignYear(year) && (!isWeeklyTab || year === 2026)
}

export type TopLeaderRowTypography = {
  rankBadge: string
  rankText: string
  rankTextColor?: string
  teamBar: string
  teamBarWidth?: string
  playerName: string
  statValue: string
  romanName: string
  metricTitle: string
  statsListLink: string
  metricHeaderMinH: string
  leaderRowGap: string
  rankInset: string
  playerNameLine: string
  nameValueGap: string
  statValueShift: string
  rowPy: string
  /** 2025: 名前・英字名のみ左へ（数値は動かさない） */
  playerTextShift?: string
  teamBarInset?: string
  /** 2025 シーズン TOP: 1～5 を数値と同じ bebas 表示（グレー丸バッジなし） */
  rankBebas?: boolean
}

export function battingTop2025SeasonTopN(metricLabel: string, year: string): number | null {
  if (!usesTopPage2025DesignYear(Number(year))) return null
  const y = Number(year)
  if (y === 2026 && (BATTING_TOP_2026_SEASON_ALL_METRICS as readonly string[]).includes(metricLabel)) {
    return BATTING_TOP_2025_SEASON_TOP_N
  }
  if ((BATTING_TOP_2025_SEASON_TOP_METRICS as readonly string[]).includes(metricLabel)) {
    return BATTING_TOP_2025_SEASON_TOP_N
  }
  return null
}

/** シーズン TOP のメイングリッド指標（2026 は6指標・2025 は上3+打点別行） */
export function battingSeasonGridMetrics(year: number): readonly string[] {
  if (year === 2026) return BATTING_TOP_2026_SEASON_ALL_METRICS
  return BATTING_TOP_2025_SEASON_TOP_METRICS
}

export function usesBatting2026SeasonSixMetricGrid(year: number, _isWeeklyTab = false): boolean {
  return year === 2026
}

/** 4–5位が無いときデザイン確認用のプレースホルダを補う */
export function pad2025SeasonTopMetricLeaders(
  leaders: Record<string, LeaderRow[] | undefined>
): Record<string, LeaderRow[]> {
  const out: Record<string, LeaderRow[]> = { ...leaders }
  const placeholderValue: Record<string, string | number> = {
    OPS: ".900",
    打率: ".300",
    本塁打: 35,
  }

  for (const metric of BATTING_TOP_2025_SEASON_TOP_METRICS) {
    const rows = [...(out[metric] ?? [])]
    while (rows.length < BATTING_TOP_2025_SEASON_TOP_N) {
      const rank = (rows.length + 1) as LeaderRow["rank"]
      rows.push({
        rank,
        name: `テスト${rank}位`,
        team: "G",
        teamName: "巨人",
        value: placeholderValue[metric] ?? "—",
        romanName: "SAMPLE",
      })
    }
    out[metric] = rows.slice(0, BATTING_TOP_2025_SEASON_TOP_N)
  }
  return out
}

export function topLeaderRowTypography(
  year: number,
  statsCategory: "batting" | "pitching",
  isWeeklyTab = false
): TopLeaderRowTypography {
  // 2025/2026 のシーズンTOPは、投球も打撃と同じタイポグラフィに揃える（ユーザー要望）。
  // 週間タブは従来どおり（投球は別UIになり得る）。
  const compact = usesTopBatting2025CompactTypography(year, isWeeklyTab)
  if (compact) {
    return {
      rankBadge: "w-[12.8px] h-[12.8px]",
      rankText: "text-[8px]",
      rankInset: "-ml-[0.5px]",
      teamBarInset: "-ml-[0.75px]",
      playerTextShift: "-translate-x-[0.5px]",
      teamBar: "h-[1.544rem]",
      teamBarWidth: "w-[3.5px]",
      playerName: "text-[12px]",
      statValue: "text-[14.3px]",
      romanName: "text-[7.9px] leading-none",
      metricTitle: "text-[11.7px]",
      statsListLink: "text-[6.86px]",
      metricHeaderMinH: "min-h-[19.8px]",
      leaderRowGap: "gap-0.5",
      playerNameLine: "truncate",
      nameValueGap: "gap-1.5",
      statValueShift: "-translate-x-1",
      rowPy: "py-0.5",
      rankBebas: true,
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
    leaderRowGap: "gap-0.5",
    rankInset: "",
    playerNameLine: "truncate",
    nameValueGap: "gap-2",
    statValueShift: "-translate-x-1",
    rowPy: "py-0.5",
  }
}

export function battingTop2025GridReady(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.every((m) => leaders[m]?.length)
}

/** 上4指標のうち1つでもリーダーがあれば2×2レイアウトを使う */
export function shouldShowTopBattingFourGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return BATTING_TOP_2025_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}

export function shouldShowTopBattingSeasonGrid(
  year: number,
  leaders: Record<string, unknown[] | undefined>
): boolean {
  if (year === 2026) {
    return BATTING_TOP_2026_SEASON_ALL_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
  }
  return (
    BATTING_TOP_2025_SEASON_TOP_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0) ||
    (leaders.打点?.length ?? 0) > 0
  )
}

/** 打撃メイングリッド表示（2026 今週はシーズンTOPと同じ6指標グリッド） */
export function shouldShowTopBattingMainGrid(
  year: number,
  isWeeklyTab: boolean,
  leaders: Record<string, unknown[] | undefined>
): boolean {
  if (year === 2026 || !isWeeklyTab) return shouldShowTopBattingSeasonGrid(year, leaders)
  return shouldShowTopBattingFourGrid(leaders)
}

/** シーズン TOP でメイングリッドに載せる指標は mini 行から除外 */
export function battingMiniMetricsForSeasonTab(
  year: number,
  miniMetrics: string[],
  isWeeklyTab: boolean
): string[] {
  if (isWeeklyTab && year !== 2026) return miniMetrics.filter((m) => m !== "打点")
  if (year === 2026) {
    const hide = new Set<string>([...BATTING_TOP_2026_SEASON_ALL_METRICS, "安打", "盗塁"])
    return miniMetrics.filter((m) => !hide.has(m))
  }
  return miniMetrics.filter((m) => m !== "打点")
}
