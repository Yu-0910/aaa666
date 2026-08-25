import {
  BATTING_TOP_2025_SEASON_TOP_METRICS,
  BATTING_TOP_2026_SEASON_ROW2_METRICS,
  BATTING_TOP_2026_SEASON_ROW3_METRICS,
} from "@/lib/topPageBatting2025Grid"
import {
  PITCHING_TOP_2026_SEASON_ROW2_METRICS,
  PITCHING_TOP_2026_SEASON_ROW3_METRICS,
  PITCHING_TOP_2026_SEASON_TOP5_METRICS,
  PITCHING_TOP_2026_WEEKLY_ROW4_METRICS,
} from "@/lib/topPagePitching2026Grid"

/** 2026 シーズンTOP・打撃（3列×3段） */
export const BATTING_TOP_2026_SEASON_ROWS: readonly (readonly string[])[] = [
  BATTING_TOP_2025_SEASON_TOP_METRICS,
  BATTING_TOP_2026_SEASON_ROW2_METRICS,
  BATTING_TOP_2026_SEASON_ROW3_METRICS,
] as const

export const BATTING_TOP_2026_SEASON_AREA_CLASS: Record<string, string> = {
  OPS: "batting-top-2025-season-ops",
  打率: "batting-top-2025-season-avg",
  本塁打: "batting-top-2025-season-hr",
  打点: "batting-top-2026-season-rbi",
  出塁率: "batting-top-2026-season-obp",
  長打率: "batting-top-2026-season-slg",
  IsoP: "batting-top-2026-season-isop",
  IsoD: "batting-top-2026-season-isod",
  盗塁: "batting-top-2026-season-sb",
}

export const BATTING_TOP_2026_SEASON_GRID_CLASS = "batting-top-2026-season-grid"

export const BATTING_TOP_2026_ALL_GRID_METRICS = BATTING_TOP_2026_SEASON_ROWS.flat()

/** 2026 シーズンTOP・投球（3列×3段） */
export const PITCHING_TOP_2026_SEASON_ROWS: readonly (readonly string[])[] = [
  PITCHING_TOP_2026_SEASON_TOP5_METRICS,
  PITCHING_TOP_2026_SEASON_ROW2_METRICS,
  PITCHING_TOP_2026_SEASON_ROW3_METRICS,
] as const

export const PITCHING_TOP_2026_WEEKLY_ROWS: readonly (readonly string[])[] = [
  ...PITCHING_TOP_2026_SEASON_ROWS,
  PITCHING_TOP_2026_WEEKLY_ROW4_METRICS,
] as const

export const PITCHING_TOP_2026_SEASON_AREA_CLASS: Record<string, string> = {
  防御率: "pitching-top-2026-season-era",
  勝利: "pitching-top-2026-season-w",
  "K-BB％": "pitching-top-2026-season-kbb",
  "K％": "pitching-top-2026-season-kpct",
  HLD: "pitching-top-2026-season-hld",
  Ｓ: "pitching-top-2026-season-sv",
  WHIP: "pitching-top-2026-season-whip",
  "QS率": "pitching-top-2026-season-qsr",
  "P/IP": "pitching-top-2026-season-pip",
  回数: "pitching-top-2026-season-ip",
  "BB％": "pitching-top-2026-season-bbpct",
  四球: "pitching-top-2026-season-bb",
}

export const PITCHING_TOP_2026_SEASON_GRID_CLASS = "pitching-top-2026-season-grid"
export const PITCHING_TOP_2026_WEEKLY_GRID_CLASS = "pitching-top-2026-weekly-grid"

/** トップページ表示用（ランキング JSON キーは Ｓ のまま） */
export function topPagePitchingMetricTitle(metricKey: string): string {
  if (metricKey === "Ｓ") return "セーブ"
  if (metricKey === "回数") return "投球回"
  if (metricKey === "BB％") return "BB%"
  return metricKey
}
