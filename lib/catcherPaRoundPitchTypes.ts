export type CatcherPaRoundPitchTypesDerived = {
  schemaVersion: "player-catcher-pa-round-pitch-types-v1"
  seasonYear: string
  npbCatcherId: string
  byPaRoundPitchTypes: CatcherPaRoundPitchTypesRoundRow[]
  /** 対左打者（投手 splits.vsHand と同じ打者・投手腕換算） */
  byPaRoundPitchTypesVsL?: CatcherPaRoundPitchTypesRoundRow[]
  /** 対右打者 */
  byPaRoundPitchTypesVsR?: CatcherPaRoundPitchTypesRoundRow[]
}

export type CatcherPaRoundPitchTypesRoundRow = {
  key: "1" | "2" | "3" | "4" | "5"
  pitches_total: number
  rows: Array<{
    pitch_type: string
    pitches: number
    pct: number
  }>
}

