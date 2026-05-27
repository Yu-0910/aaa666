import {
  BATTING_TOP_2025_SEASON_TOP_METRICS,
  BATTING_TOP_2026_SEASON_ROW2_METRICS,
} from "@/lib/topPageBatting2025Grid"
import { PITCHING_TOP_2026_GRID_METRICS } from "@/lib/topPagePitching2026Grid"

/** 2026 シーズンTOP・打撃（3列×2段） */
export const BATTING_TOP_2026_SEASON_ROWS: readonly (readonly string[])[] = [
  BATTING_TOP_2025_SEASON_TOP_METRICS,
  BATTING_TOP_2026_SEASON_ROW2_METRICS,
] as const

export const BATTING_TOP_2026_SEASON_AREA_CLASS: Record<string, string> = {
  OPS: "batting-top-2025-season-ops",
  打率: "batting-top-2025-season-avg",
  本塁打: "batting-top-2025-season-hr",
  打点: "batting-top-2026-season-rbi",
  出塁率: "batting-top-2026-season-obp",
  長打率: "batting-top-2026-season-slg",
}

export const BATTING_TOP_2026_SEASON_GRID_CLASS = "batting-top-2026-season-grid"

export const BATTING_TOP_2026_ALL_GRID_METRICS = BATTING_TOP_2026_SEASON_ROWS.flat()

/** 2026 シーズンTOP・投球（3列×2段） */
export const PITCHING_TOP_2026_SEASON_ROWS: readonly (readonly string[])[] = [
  ["防御率", "勝利", "K-BB％"],
  ["K％", "HLD", "Ｓ"],
] as const

export const PITCHING_TOP_2026_SEASON_AREA_CLASS: Record<string, string> = {
  防御率: "pitching-top-2026-season-era",
  勝利: "pitching-top-2026-season-w",
  "K-BB％": "pitching-top-2026-season-kbb",
  "K％": "pitching-top-2026-season-kpct",
  HLD: "pitching-top-2026-season-hld",
  Ｓ: "pitching-top-2026-season-sv",
}

export const PITCHING_TOP_2026_SEASON_GRID_CLASS = "pitching-top-2026-season-grid"

/** トップページ表示用（ランキング JSON キーは Ｓ のまま） */
export function topPagePitchingMetricTitle(metricKey: string): string {
  return metricKey === "Ｓ" ? "セーブ" : metricKey
}

export function shouldShowTopPitchingSeasonGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return PITCHING_TOP_2026_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}
