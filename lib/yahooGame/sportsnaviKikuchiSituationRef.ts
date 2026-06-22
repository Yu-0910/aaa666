/**
 * スポナビ公式 塁状況別成績（菊池涼介 yahoo_1100082・2026・結果球時点）。
 */
export type SportsnaviKikuchiSituationRefRow = {
  ab: number
  h: number
  hr: number
  rbi: number
  so: number
  bb: number
  hbp: number
  sh: number
  sf: number
}

export const KIKUCHI_SITUATION_REF_2026: Record<string, SportsnaviKikuchiSituationRefRow> = {
  none: { ab: 110, h: 23, hr: 0, rbi: 0, so: 29, bb: 12, hbp: 0, sh: 0, sf: 0 },
  r1: { ab: 19, h: 7, hr: 1, rbi: 2, so: 5, bb: 4, hbp: 0, sh: 5, sf: 0 },
  r12: { ab: 9, h: 2, hr: 1, rbi: 4, so: 1, bb: 4, hbp: 0, sh: 0, sf: 0 },
  r13: { ab: 2, h: 0, hr: 0, rbi: 0, so: 1, bb: 1, hbp: 0, sh: 1, sf: 0 },
  r2: { ab: 7, h: 2, hr: 0, rbi: 0, so: 1, bb: 1, hbp: 0, sh: 2, sf: 0 },
  r23: { ab: 1, h: 1, hr: 0, rbi: 2, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r3: { ab: 5, h: 1, hr: 0, rbi: 2, so: 1, bb: 2, hbp: 0, sh: 0, sf: 1 },
  loaded: { ab: 2, h: 1, hr: 0, rbi: 2, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
}

export function rispAbFromKikuchiSituationRef(
  ref: Record<string, Pick<SportsnaviKikuchiSituationRefRow, "ab">>,
): number {
  const rispKeys = ["r2", "r3", "r12", "r13", "r23", "loaded"] as const
  return rispKeys.reduce((sum, k) => sum + (ref[k]?.ab ?? 0), 0)
}
