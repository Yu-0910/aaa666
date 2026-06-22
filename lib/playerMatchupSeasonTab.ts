/**
 * Phase 0: 個人ページ「今季の成績 › 対戦成績」サブタブの型・表示条件・タブ列定義。
 * UI（Phase 3）と API（Phase 2）から共用する。
 */

import type { PlayerMatchupTeamBlock } from "@/lib/playerMatchupTypes"
import { PLAYER_MATCHUP_TEAM_ORDER } from "@/lib/playerMatchupTeamOrder"

const MATCHUP_TEAM_ORDER_INDEX = new Map(
  PLAYER_MATCHUP_TEAM_ORDER.map((t, i) => [t.teamCode, i]),
)

/** 対戦成績の実データ対象シーズン（初版） */
export const PLAYER_MATCHUP_DISPLAY_YEAR = "2026" as const

/** 表ヘッダー列（1 列目の選手名を除く 6 指標・左からの順） */
export const PLAYER_MATCHUP_TABLE_COLUMNS = [
  { key: "ops", label: "OPS" },
  { key: "avg", label: "打率" },
  { key: "ab", label: "打数" },
  { key: "h", label: "安打" },
  { key: "hr", label: "本塁打" },
  { key: "so", label: "三振" },
] as const

/** 対戦成績表: 選手名列の幅（px） */
export const PLAYER_MATCHUP_NAME_COLUMN_WIDTH_PX = 66

export type PlayerMatchupTableColumnKey =
  (typeof PLAYER_MATCHUP_TABLE_COLUMNS)[number]["key"]

/** 野手・今季サブタブ（SeasonStatsPilot の PilotSeasonDetailTab に matchup / vs_team_pitch は含めない） */
export type FielderSeasonDetailTab =
  | "basic"
  | "pitch"
  | "situation"
  | "matchup"
  | "vs_team_pitch"
  | "catcher"

/** 投手・今季サブタブ */
export type PitcherSeasonSubTab =
  | "basic"
  | "pitch"
  | "situation"
  | "matchup"

export type SeasonSubTabItem = {
  key: FielderSeasonDetailTab | PitcherSeasonSubTab
  label: string
}

/** 対戦成績は 4 つ目（0-based index 3） */
export const FIELDER_SEASON_TAB_MATCHUP_INDEX = 3
export const PITCHER_SEASON_TAB_MATCHUP_INDEX = 3

const FIELDER_TAB_KEYS = new Set<string>([
  "basic",
  "pitch",
  "situation",
  "matchup",
  "vs_team_pitch",
  "catcher",
])

const PITCHER_TAB_KEYS = new Set<string>([
  "basic",
  "pitch",
  "situation",
  "matchup",
])

export function isFielderSeasonDetailTab(v: string): v is FielderSeasonDetailTab {
  return FIELDER_TAB_KEYS.has(v)
}

export function isPitcherSeasonSubTab(v: string): v is PitcherSeasonSubTab {
  return PITCHER_TAB_KEYS.has(v)
}

export function isMatchupSeasonDetailTab(tab: string): boolean {
  return tab === "matchup"
}

/** 計画書 §3.1: showMatchupSeasonSubTab */
export function resolveShowMatchupSeasonSubTab(options: {
  statsTab: "season" | "career"
  showFielderSeasonPilotUi: boolean
  showPitcherSeasonSuganoUi: boolean
}): boolean {
  return (
    options.statsTab === "season" &&
    (options.showFielderSeasonPilotUi || options.showPitcherSeasonSuganoUi)
  )
}

/** 野手今季サブタブ列（対戦成績の次に球団別、捕手タブは最後） */
export function buildFielderSeasonSubTabs(showCatcherSeasonTab: boolean): SeasonSubTabItem[] {
  const base: SeasonSubTabItem[] = [
    { key: "basic", label: "基本成績" },
    { key: "pitch", label: "球種情報" },
    { key: "situation", label: "状況別" },
    { key: "matchup", label: "対戦成績" },
    { key: "vs_team_pitch", label: "球団別" },
  ]
  if (showCatcherSeasonTab) {
    return [...base, { key: "catcher", label: "捕手成績" }]
  }
  return base
}

/** 投手今季サブタブ列（対戦成績は 4 つ目） */
export function buildPitcherSeasonSubTabs(): SeasonSubTabItem[] {
  return [
    { key: "basic", label: "基本成績" },
    { key: "pitch", label: "球種情報" },
    { key: "situation", label: "状況別" },
    { key: "matchup", label: "対戦成績" },
  ]
}

/** 黄色スライダー 1 タブ分の幅（% 文字列） */
export function seasonSubTabSliderWidthPct(tabCount: number): string {
  if (tabCount <= 0) return "100%"
  return `${100 / tabCount}%`
}

/** 黄色スライダーの translateX（activeIndex は 0 始まり） */
export function seasonSubTabSliderTransform(activeIndex: number): string {
  return `translateX(${Math.max(0, activeIndex) * 100}%)`
}

export function activeSeasonSubTabIndex(
  tabs: readonly SeasonSubTabItem[],
  activeKey: string,
): number {
  const idx = tabs.findIndex((t) => t.key === activeKey)
  return idx >= 0 ? idx : 0
}

/** 対戦成績: 球団見出し順（対戦人数降順 → 同数は固定球団順） */
export function compareMatchupTeamsByOpponentCountDesc(
  a: Pick<PlayerMatchupTeamBlock, "teamCode" | "opponents">,
  b: Pick<PlayerMatchupTeamBlock, "teamCode" | "opponents">,
): number {
  const diff = b.opponents.length - a.opponents.length
  if (diff !== 0) return diff
  const ai = MATCHUP_TEAM_ORDER_INDEX.get(a.teamCode) ?? 999
  const bi = MATCHUP_TEAM_ORDER_INDEX.get(b.teamCode) ?? 999
  if (ai !== bi) return ai - bi
  return a.teamCode.localeCompare(b.teamCode)
}

export function sortMatchupTeamsByOpponentCountDesc(
  teams: readonly PlayerMatchupTeamBlock[],
): PlayerMatchupTeamBlock[] {
  return [...teams].sort(compareMatchupTeamsByOpponentCountDesc)
}

/** 対戦成績表: 球団内の行順（OPS 降順 → 名前） */
export function compareMatchupOpponentsByOpsDesc(
  a: { opponentName: string; ops: string | null },
  b: { opponentName: string; ops: string | null },
): number {
  const parseOps = (ops: string | null) => {
    if (ops == null) return -1
    const t = ops.trim()
    if (!t || t === "—") return -1
    const n = parseFloat(t.startsWith(".") ? `0${t}` : t)
    return Number.isFinite(n) ? n : -1
  }
  const diff = parseOps(b.ops) - parseOps(a.ops)
  if (diff !== 0) return diff
  return a.opponentName.localeCompare(b.opponentName, "ja")
}
