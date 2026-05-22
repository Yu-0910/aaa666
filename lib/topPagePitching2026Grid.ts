/** 2026 TOP 投球：防御率｜K-BB％／勝利｜セーブの2×2（左→右、上→下） */
export const PITCHING_TOP_2026_GRID_METRICS = ["防御率", "K-BB％", "勝利", "セーブ"] as const

/** 2026 TOP 投球・1位のみ */
export const PITCHING_TOP_2026_MINI_METRICS = ["K％", "QS率", "完封", "HLD"] as const

export function usesTopPitchingModernLayout(year: number): boolean {
  return year === 2026
}

export function shouldShowTopPitchingFourGrid(leaders: Record<string, unknown[] | undefined>): boolean {
  return PITCHING_TOP_2026_GRID_METRICS.some((m) => (leaders[m]?.length ?? 0) > 0)
}
