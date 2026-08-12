/**
 * 順位表の列定義（Phase 0 固定順）。
 * 仕様: docs/plan_team_standings_phase0_spec.md §3
 * NPB 歴代: docs/plan_npb_yearly_standings_phases.md Phase 0
 */

import type { StandingsSource, TeamStandingRow } from "@/lib/standings/types"

export type StandingsMetricKey = Exclude<
  keyof TeamStandingRow,
  "rank" | "team" | "teamName"
>

export type StandingsMetricColumn = {
  order: number
  label: string
  key: StandingsMetricKey
}

/** UI・ビルド共通の列順（球団名除く） */
export const STANDINGS_METRIC_COLUMNS: readonly StandingsMetricColumn[] = [
  { order: 2, label: "試", key: "g" },
  { order: 3, label: "勝", key: "w" },
  { order: 4, label: "敗", key: "l" },
  { order: 5, label: "分", key: "t" },
  { order: 6, label: "勝率", key: "pct" },
  { order: 7, label: "差", key: "gb" },
  { order: 8, label: "残", key: "remaining" },
  { order: 9, label: "得点", key: "runs" },
  { order: 10, label: "打率", key: "avg" },
  { order: 11, label: "本塁打", key: "hr" },
  { order: 12, label: "OPS", key: "ops" },
  { order: 13, label: "安打", key: "h" },
  { order: 14, label: "単打", key: "singles" },
  { order: 15, label: "二塁打", key: "doubles" },
  { order: 16, label: "三塁打", key: "triples" },
  { order: 17, label: "出塁率", key: "obp" },
  { order: 18, label: "長打率", key: "slg" },
  { order: 19, label: "得点圏", key: "risp_avg" },
  { order: 20, label: "盗塁", key: "sb" },
  { order: 21, label: "IsoD", key: "isod" },
  { order: 22, label: "IsoP", key: "isop" },
  { order: 23, label: "BB%", key: "bb_pct" },
  { order: 24, label: "K%", key: "k_pct" },
  { order: 25, label: "失点", key: "runs_allowed" },
  { order: 26, label: "防御率", key: "era" },
  { order: 27, label: "先発防御率", key: "era_starter" },
  { order: 28, label: "救援防御率", key: "era_relief" },
  { order: 29, label: "被打率", key: "avg_allowed" },
  { order: 30, label: "完投", key: "cg" },
  { order: 31, label: "BB%", key: "bb_pct_pitch" },
  { order: 32, label: "K%", key: "k_pct_pitch" },
  { order: 33, label: "K-BB%", key: "k_bb_pct" },
  { order: 34, label: "QS率", key: "qs_rate" },
  { order: 35, label: "HQS率", key: "hqs_rate" },
  { order: 36, label: "失策", key: "e" },
] as const

/** NPB 公式年度別成績ページ由来の順位表列（提示指標のみ・固定順） */
export type NpbYearlyStandingsMetricKey =
  | "g"
  | "w"
  | "l"
  | "t"
  | "pct"
  | "gb"
  | "runs"
  | "avg"
  | "ab"
  | "h"
  | "doubles"
  | "triples"
  | "hr"
  | "rbi"
  | "sb"
  | "slg"
  | "isop"
  | "runs_allowed"
  | "era"
  | "cg"
  | "sho"
  | "ip"
  | "k9"
  | "so"

export type NpbYearlyStandingsMetricColumn = {
  order: number
  label: string
  key: NpbYearlyStandingsMetricKey
}

export const NPB_YEARLY_STANDINGS_METRIC_COLUMNS: readonly NpbYearlyStandingsMetricColumn[] = [
  { order: 2, label: "試", key: "g" },
  { order: 3, label: "勝", key: "w" },
  { order: 4, label: "敗", key: "l" },
  { order: 5, label: "分", key: "t" },
  { order: 6, label: "勝率", key: "pct" },
  { order: 7, label: "差", key: "gb" },
  { order: 8, label: "得点", key: "runs" },
  { order: 9, label: "打率", key: "avg" },
  { order: 10, label: "打数", key: "ab" },
  { order: 11, label: "安打", key: "h" },
  { order: 12, label: "二塁打", key: "doubles" },
  { order: 13, label: "三塁打", key: "triples" },
  { order: 14, label: "本塁打", key: "hr" },
  { order: 15, label: "打点", key: "rbi" },
  { order: 16, label: "盗塁", key: "sb" },
  { order: 17, label: "長打率", key: "slg" },
  { order: 18, label: "IsoP", key: "isop" },
  { order: 19, label: "失点", key: "runs_allowed" },
  { order: 20, label: "防御率", key: "era" },
  { order: 21, label: "完投", key: "cg" },
  { order: 22, label: "完封勝", key: "sho" },
  { order: 23, label: "投球回", key: "ip" },
  { order: 24, label: "K/9", key: "k9" },
  { order: 25, label: "奪三振", key: "so" },
] as const

export function standingsMetricColumnsForSource(
  source: StandingsSource,
): readonly StandingsMetricColumn[] | readonly NpbYearlyStandingsMetricColumn[] {
  return source === "npb_official_yearly"
    ? NPB_YEARLY_STANDINGS_METRIC_COLUMNS
    : STANDINGS_METRIC_COLUMNS
}
