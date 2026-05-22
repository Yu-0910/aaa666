export type CatcherPitcherSplitsDerived = {
  schemaVersion: "player-catcher-pitcher-splits-v1"
  seasonYear: string
  npbCatcherId: string
  rows: CatcherPitcherSplitRow[]
}

export type CatcherPitcherSplitRow = {
  pitcherNpbId: string
  pitcherName: string
  pitcherTeam: string
  bf: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  ipOuts: number
  era: number | null
  ip: string
  wl: string
  kPct: number | null
  kBbPct: number | null
  whip: number | null
  qsPct: number | null
  games?: number
  wins?: number
  losses?: number
  qsCount?: number
}

