import type { CatcherPitcherSeasonTotals, CatcherPitcherSplitRow } from "@/lib/catcherPitcherSplits"

export type CatcherAppearancesSummary = {
  gamesAsCatcher: number
  gameIds: string[]
}

export type CatcherDefenseBasicSummary = {
  sbAttempts: number
  sb: number
  cs: number
  csPct: number | null
  pb: number
  pitches: number
  battedBallOuts: { ground: number; air: number } | null
}

export type CatcherStartingSummaryState = {
  starts: number
  teamWins: number
  teamLosses: number
  teamDraws?: number
  teamWinPct: number | null
  qsCount: number
  hqsCount: number
  sqsCount: number
  qsPct: number | null
  hqsPct: number | null
  sqsPct: number | null
}

export type CatcherPaRoundPitchTypeRow = {
  key: "1" | "2" | "3" | "4" | "5"
  pitches_total: number
  rows: { pitch_type: string; pitches: number; pct: number }[]
}

export type CatcherSeasonDerivedState = {
  appearances: CatcherAppearancesSummary | null
  pitchers: CatcherPitcherSplitRow[]
  /** phase23 全投手合算（基本成績の故意四・失点等） */
  seasonTotals: CatcherPitcherSeasonTotals | null
  defenseBasic: CatcherDefenseBasicSummary | null
  startingSummary: CatcherStartingSummaryState | null
  paRoundPitchTypes: CatcherPaRoundPitchTypeRow[]
  paRoundPitchTypesVsL: CatcherPaRoundPitchTypeRow[]
  paRoundPitchTypesVsR: CatcherPaRoundPitchTypeRow[]
}

export const EMPTY_CATCHER_SEASON_DERIVED: CatcherSeasonDerivedState = {
  appearances: null,
  pitchers: [],
  seasonTotals: null,
  defenseBasic: null,
  startingSummary: null,
  paRoundPitchTypes: [],
  paRoundPitchTypesVsL: [],
  paRoundPitchTypesVsR: [],
}
