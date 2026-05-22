export type CatcherPaRoundPitchTypesDerived = {
  schemaVersion: "player-catcher-pa-round-pitch-types-v1"
  seasonYear: string
  npbCatcherId: string
  byPaRoundPitchTypes: CatcherPaRoundPitchTypesRoundRow[]
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

