import type { CatcherPaRoundPitchTypeRow } from "@/lib/catcherSeasonDerivedTypes"
import type {
  PitcherSeasonPocPayload,
  PitcherSeasonPocPitchTypesSplitRow,
} from "@/lib/pitcherSeasonPocTypes"

export function mapCatcherPaRoundRowsToSplitRows(
  rows: CatcherPaRoundPitchTypeRow[]
): PitcherSeasonPocPitchTypesSplitRow[] {
  return rows.map((r) => ({
    key: String(r.key),
    label: r.key === "5" ? "5巡目以上" : `${r.key}巡目`,
    pitches_total: r.pitches_total,
    rows: r.rows,
  }))
}

function hasPitchTypesSplitRows(rows: CatcherPaRoundPitchTypeRow[] | null | undefined): boolean {
  return (rows?.length ?? 0) > 0 && rows.some((r) => r.pitches_total > 0)
}

export function hasCatcherPaRoundVsHandData(
  vsL: CatcherPaRoundPitchTypeRow[],
  vsR: CatcherPaRoundPitchTypeRow[]
): boolean {
  return hasPitchTypesSplitRows(vsL) || hasPitchTypesSplitRows(vsR)
}

export function buildCatcherPaRoundPitchTypePayload(
  base: CatcherPaRoundPitchTypeRow[],
  vsL: CatcherPaRoundPitchTypeRow[],
  vsR: CatcherPaRoundPitchTypeRow[]
): PitcherSeasonPocPayload | null {
  const hasBase = hasPitchTypesSplitRows(base)
  if (!hasBase && !hasCatcherPaRoundVsHandData(vsL, vsR)) return null
  return {
    splits: {
      byPaRoundPitchTypes: mapCatcherPaRoundRowsToSplitRows(base),
      byPaRoundPitchTypesVsL: mapCatcherPaRoundRowsToSplitRows(vsL),
      byPaRoundPitchTypesVsR: mapCatcherPaRoundRowsToSplitRows(vsR),
    },
  } as PitcherSeasonPocPayload
}
