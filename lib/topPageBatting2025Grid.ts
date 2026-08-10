import type { LeaderRow, LeadersConfig } from "@/lib/ranking/leadersTypes"
import { usesTopPageModernLayout } from "@/lib/topPageModernLayout"

/** 2025/2026 シーズン TOP: OPS｜打率｜本塁打（3等分）｜打点。今週タブは 2×2 */
/** シーズン TOP 1段目: 各指標5位まで */
export const BATTING_TOP_2025_SEASON_TOP_METRICS = ["OPS", "打率", "本塁打"] as const
/** シーズン TOP 2段目: 各1〜3位 */
export const BATTING_TOP_2026_SEASON_ROW2_METRICS = ["打点", "出塁率", "長打率"] as const
/** シーズン TOP 3段目: 各1〜3位 */
export const BATTING_TOP_2026_SEASON_ROW3_METRICS = ["IsoP", "IsoD", "盗塁"] as const
/** シーズン TOP 4段目: 各1〜3位 */
export const BATTING_TOP_2026_SEASON_ROW4_METRICS = ["BB/K", "RC", "GPA"] as const
export const BATTING_TOP_2026_SEASON_TOP3_METRICS = [
  ...BATTING_TOP_2026_SEASON_ROW2_METRICS,
  ...BATTING_TOP_2026_SEASON_ROW3_METRICS,
  ...BATTING_TOP_2026_SEASON_ROW4_METRICS,
] as const
export const BATTING_TOP_2026_SEASON_ALL_METRICS = [
  ...BATTING_TOP_2025_SEASON_TOP_METRICS,
  ...BATTING_TOP_2026_SEASON_TOP3_METRICS,
] as const
export const BATTING_TOP_2025_SEASON_TOP_N = 5
export const BATTING_TOP_2026_SEASON_TOP3_N = 3

/** 2×2 または週間タブ: OPS / 打率 / 本塁打 / 打点 を各セルに配置 */
export const BATTING_TOP_2025_GRID_METRICS = ["OPS", "打率", "本塁打", "打点"] as const

/** 上4指標の「打点」は1〜3位を表示（他指標と同様） */
export const BATTING_TOP_2025_RBI_TOP_N = 3

/** 今週タブ打撃：OPS・打率・本塁打・打点のみ、各指標トップ5 */
export const BATTING_WEEKLY_TAB_TOP_N = 5

/** トップページでモダン打撃レイアウト（9指標グリッド）を使うか */
export function usesTopBattingModernLayout(year: number, _isWeeklyTab = false): boolean {
  return usesTopPageModernLayout(year)
}

/** 指標見出し（中央の黄色タイトル）をモダン表示するか */
export function usesTopPageModernMetricTitle(
  year: number,
  statsCategory: "batting" | "pitching",
  isWeeklyTab = false
): boolean {
  if (!usesTopPageModernLayout(year)) return false
  if (statsCategory === "pitching") return true
  return statsCategory === "batting"
}

/**
 * リーダー行：日本語名＋数値の1行、その下に英字名（モダン TOP と同型）。
 */
export function usesTopPageModernLeaderRow(
  year: number,
  statsCategory: "batting" | "pitching",
  _isWeeklyTab = false
): boolean {
  if (!usesTopPageModernLayout(year)) return false
  return statsCategory === "batting" || statsCategory === "pitching"
}

/** 上4指標ブロック（globals.css の .batting-top-2025-four-*。グリッド下限は 18rem / 列 8.75rem） */
export const BATTING_TOP_2025_FOUR_METRICS_WRAPPER_CLASS =
  "batting-top-2025-four-metrics flex flex-col gap-1 w-full"
export const BATTING_TOP_2025_FOUR_GRID_CLASS = "batting-top-2025-four-grid"
export const BATTING_TOP_2025_SEASON_GRID_CLASS = "batting-top-2025-season-grid"

/** シーズン TOP: 9指標グリッド（今週タブも同型） */
export function usesTopBatting2025SeasonPairedLayout(year: number, _isWeeklyTab: boolean): boolean {
  return usesTopPageModernLayout(year)
}

/** シーズン TOP: コンパクト typography（今週タブも同型） */
export function usesTopBatting2025CompactTypography(year: number, _isWeeklyTab: boolean): boolean {
  return usesTopPageModernLayout(year)
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
  /** シーズン TOP: 1～5 を数値と同じ bebas 表示（グレー丸バッジなし） */
  rankBebas?: boolean
}

export function battingTop2025SeasonTopN(metricLabel: string, year: string): number | null {
  if (!usesTopPageModernLayout(Number(year))) return null
  if ((BATTING_TOP_2025_SEASON_TOP_METRICS as readonly string[]).includes(metricLabel)) {
    return BATTING_TOP_2025_SEASON_TOP_N
  }
  if ((BATTING_TOP_2026_SEASON_TOP3_METRICS as readonly string[]).includes(metricLabel)) {
    return BATTING_TOP_2026_SEASON_TOP3_N
  }
  return null
}

/** シーズン TOP のメイングリッド指標（モダン年度は9指標） */
export function battingSeasonGridMetrics(year: number): readonly string[] {
  if (usesTopPageModernLayout(year)) return BATTING_TOP_2026_SEASON_ALL_METRICS
  return BATTING_TOP_2025_SEASON_TOP_METRICS
}

export function usesBatting2026SeasonSixMetricGrid(year: number, _isWeeklyTab = false): boolean {
  return usesTopPageModernLayout(year)
}

/** 4–5位が無いときデザイン確認用のプレースホルダを補う（レガシー用・未使用） */
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
  if (usesTopPageModernLayout(year)) {
    return BATTING_TOP_2026_SEASON_ALL_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
  }
  return (
    BATTING_TOP_2025_SEASON_TOP_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0) ||
    (leaders.打点?.length ?? 0) > 0
  )
}

/** 打撃メイングリッド表示（モダン年度はシーズン・今週とも9指標グリッド） */
export function shouldShowTopBattingMainGrid(
  year: number,
  isWeeklyTab: boolean,
  leaders: Record<string, unknown[] | undefined>
): boolean {
  if (usesTopPageModernLayout(year) || !isWeeklyTab) {
    return shouldShowTopBattingSeasonGrid(year, leaders)
  }
  return shouldShowTopBattingFourGrid(leaders)
}

/** シーズン TOP でメイングリッドに載せる指標は mini 行から除外 */
export function battingMiniMetricsForSeasonTab(
  year: number,
  miniMetrics: string[],
  _isWeeklyTab: boolean
): string[] {
  if (usesTopPageModernLayout(year)) {
    const hide = new Set<string>([...BATTING_TOP_2026_SEASON_ALL_METRICS, "安打"])
    return miniMetrics.filter((m) => !hide.has(m))
  }
  return miniMetrics.filter((m) => m !== "打点")
}

/**
 * モダン TOP 用 LeadersConfig に揃える。
 * ランキング JSON 由来（primary）を優先し、スナップショット等（supplement）は不足分のみ補う。
 * 旧形式（mini 指標は1位のみ）も9指標グリッド向けに再構成する。
 */
export function normalizeBattingLeadersConfigForModern(
  primary: LeadersConfig,
  supplement: LeadersConfig | null | undefined,
  year: string
): LeadersConfig {
  if (!usesTopPageModernLayout(Number(year))) {
    return primary
  }

  const pickRows = (metric: string): LeaderRow[] => {
    const topN = battingTop2025SeasonTopN(metric, year) ?? 1
    const a = primary.leaders[metric] ?? []
    const b = supplement?.leaders[metric] ?? []
    const best = (b.length > a.length ? b : a).slice(0, topN)
    return best.map((row, i) => ({
      ...row,
      rank: Math.min(topN, i + 1) as LeaderRow["rank"],
    }))
  }

  const leaders: Record<string, LeaderRow[]> = {}
  for (const metric of BATTING_TOP_2026_SEASON_ALL_METRICS) {
    const rows = pickRows(metric)
    if (rows.length > 0) leaders[metric] = rows
  }

  return {
    top3Metrics: [...BATTING_TOP_2026_SEASON_ALL_METRICS],
    miniMetrics: [],
    leaders,
  }
}
