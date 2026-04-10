import { existsSync, readFileSync } from "fs"
import { join } from "path"

export type GamePitchTypeRow = {
  pitch_type: string
  pitches: number
  pct: number
  avg_speed_kmh: number | null
  swing_miss: number
  taken: number
  foul: number
  balls: number
  strike_pct: string
  whiff_pct: string
  avg: string
  /** 球種別の被OPS（canonical 生成・将来のスクレイプで付与。無い場合は UI が「—」） */
  ops?: string
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
}

export type GamePitchTypesResponse = {
  game_id: string
  pitcher_id: string
  pitches_total: number
  rows: GamePitchTypeRow[]
  total_row: GamePitchTypeRow
}

export type ZoneStat = {
  zoneId: number
  pitches: number
  ab: number
  h: number
  hr: number
  ops: string
  avg: string
}

export type ZoneStatsResponse = {
  game_id: string
  pitcher_id: string
  vsRight: ZoneStat[]
  vsLeft: ZoneStat[]
}

const DATA_DIR = join("_data", "yahoo_games_pilot")

export function loadPitchTypesJson(
  projectRoot: string,
  gameId: string,
  yahooPitcherId: string
): GamePitchTypesResponse | null {
  const filePath = join(projectRoot, DATA_DIR, `pitch_by_type_${gameId}_${yahooPitcherId}.json`)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as GamePitchTypesResponse
  } catch {
    return null
  }
}

export function loadZoneStatsJson(
  projectRoot: string,
  gameId: string,
  yahooPitcherId: string
): ZoneStatsResponse | null {
  const filePath = join(projectRoot, DATA_DIR, `zone_stats_${gameId}_${yahooPitcherId}.json`)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as ZoneStatsResponse
  } catch {
    return null
  }
}
