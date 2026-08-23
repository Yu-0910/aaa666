export type PitchDetailRow = {
  game_id: string
  inning: number
  top_bottom: string
  bat_order: number
  pitcher_id: string
  batter_id: string
  pitch_no: number
  pitch_type: string
  speed_kmh: string
  result: string
  zone_top_px: string
  zone_left_px: string
  zone_row: string
  zone_col: string
  zone_id: string
}

export type PlateAppearancePitches = {
  inning: number
  top_bottom: string
  bat_order: number
  game_id: string
  pitches: PitchDetailRow[]
  settlement_result?: string
}

export type PitchTypeStats = {
  pitch_type: string
  pitches: number
  pct: number
  avg_speed: number | null
  balls: number
  strikes: number
  strike_pct: string
  swing_miss: number
  taken: number
  foul: number
  whiff_pct: string
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  tb: number
  avg: string
  ops: string
}

export type PitchTypeHandSplitStats = {
  vsRight: PitchTypeStats[]
  vsLeft: PitchTypeStats[]
}

export type ZoneStats = {
  zoneId: number
  pitches: number
  ab: number
  h: number
  hr: number
  tb: number
  bb: number
  hbp: number
  sf: number
  avg: string
  isop: string
}

export type SpeedBandStatsRow = {
  isop: string
  avg: string
  hr: number
  h2: number
  pitch_share_pct: string
  whiff_pct: string
}

export type SpeedBandStatsMap = Partial<Record<string, SpeedBandStatsRow>>
