/**
 * スポナビ公式 塁状況別成績（二俣翔一 yahoo_2000066・2026・結果球時点）。
 */
export type SportsnaviFutamataSituationRefRow = {
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

export const FUTAMATA_SITUATION_REF_2026: Record<string, SportsnaviFutamataSituationRefRow> = {
  none: { ab: 25, h: 3, hr: 1, rbi: 1, so: 9, bb: 1, hbp: 0, sh: 0, sf: 0 },
  r1: { ab: 11, h: 3, hr: 0, rbi: 1, so: 2, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r12: { ab: 2, h: 1, hr: 0, rbi: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r13: { ab: 1, h: 1, hr: 0, rbi: 1, so: 0, bb: 0, hbp: 1, sh: 0, sf: 0 },
  r2: { ab: 2, h: 0, hr: 0, rbi: 0, so: 2, bb: 0, hbp: 0, sh: 1, sf: 0 },
  r23: { ab: 0, h: 0, hr: 0, rbi: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 1 },
  r3: { ab: 2, h: 1, hr: 0, rbi: 1, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
  loaded: { ab: 0, h: 0, hr: 0, rbi: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
}

export function rispAbFromFutamataSituationRef(
  ref: Record<string, Pick<SportsnaviFutamataSituationRefRow, "ab">>,
): number {
  const rispKeys = ["r2", "r3", "r12", "r13", "r23", "loaded"] as const
  return rispKeys.reduce((sum, k) => sum + (ref[k]?.ab ?? 0), 0)
}
