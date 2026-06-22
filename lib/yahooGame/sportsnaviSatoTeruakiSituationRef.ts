/**
 * スポナビ公式 塁状況別成績（佐藤輝明 yahoo_2000051・2026・結果球時点）。
 */
export type SportsnaviSatoTeruakiSituationRefRow = {
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

export const SATO_TERUAKI_SITUATION_REF_2026: Record<string, SportsnaviSatoTeruakiSituationRefRow> =
  {
    none: { ab: 117, h: 41, hr: 9, rbi: 9, so: 31, bb: 12, hbp: 0, sh: 0, sf: 0 },
    r1: { ab: 47, h: 14, hr: 3, rbi: 8, so: 13, bb: 6, hbp: 0, sh: 0, sf: 0 },
    r12: { ab: 12, h: 7, hr: 1, rbi: 8, so: 3, bb: 3, hbp: 0, sh: 0, sf: 0 },
    r13: { ab: 3, h: 0, hr: 0, rbi: 1, so: 1, bb: 0, hbp: 0, sh: 0, sf: 1 },
    r2: { ab: 12, h: 6, hr: 0, rbi: 6, so: 3, bb: 8, hbp: 0, sh: 0, sf: 0 },
    r23: { ab: 3, h: 1, hr: 0, rbi: 1, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r3: { ab: 7, h: 3, hr: 2, rbi: 5, so: 3, bb: 1, hbp: 0, sh: 0, sf: 0 },
    loaded: { ab: 4, h: 2, hr: 0, rbi: 5, so: 1, bb: 0, hbp: 0, sh: 0, sf: 1 },
  }

export function rispAbFromSatoTeruakiSituationRef(
  ref: Record<string, Pick<SportsnaviSatoTeruakiSituationRefRow, "ab">>,
): number {
  const rispKeys = ["r2", "r3", "r12", "r13", "r23", "loaded"] as const
  return rispKeys.reduce((sum, k) => sum + (ref[k]?.ab ?? 0), 0)
}
