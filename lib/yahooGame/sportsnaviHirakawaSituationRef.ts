/**
 * スポナビ公式 塁状況別成績（平川蓮 yahoo_2110164・2026・結果球時点）。
 * 状況別打撃成績の検証スクリプト・テストで共有する。
 */
export type SportsnaviSituationRefRow = {
  ab: number
  h: number
  so: number
  bb: number
  hbp: number
  sh: number
  sf: number
}

export const HIRAKAWA_SITUATION_REF_2026: Record<string, SportsnaviSituationRefRow> = {
  none: { ab: 53, h: 7, so: 20, bb: 2, hbp: 1, sh: 0, sf: 0 },
  r1: { ab: 18, h: 6, so: 3, bb: 0, hbp: 0, sh: 1, sf: 0 },
  r2: { ab: 9, h: 1, so: 4, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r3: { ab: 3, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r12: { ab: 8, h: 1, so: 3, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r13: { ab: 1, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r23: { ab: 1, h: 0, so: 1, bb: 2, hbp: 0, sh: 0, sf: 0 },
  loaded: { ab: 2, h: 1, so: 0, bb: 1, hbp: 0, sh: 0, sf: 0 },
}

/** 得点圏状況（1塁のみ・なし以外）の打数合算 = 得点圏打率の打数 */
export function rispAbFromSituationRef(
  ref: Record<string, Pick<SportsnaviSituationRefRow, "ab">>,
): number {
  const rispKeys = ["r2", "r3", "r12", "r13", "r23", "loaded"] as const
  return rispKeys.reduce((sum, k) => sum + (ref[k]?.ab ?? 0), 0)
}
