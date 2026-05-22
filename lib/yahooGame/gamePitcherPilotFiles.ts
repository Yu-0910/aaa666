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
  /** 長打の合算（試合横断マージ時の ISOP 再計算用。省略可） */
  tb?: number
  /** Isolated power against: (TB − H) / AB（打数ゼロは "—"） */
  isop: string
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

function normalizeZoneStatRow(raw: unknown): ZoneStat | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const zoneId = Number(r.zoneId)
  if (!Number.isFinite(zoneId)) return null
  const ab = Number(r.ab) || 0
  const h = Number(r.h) || 0
  const avg =
    typeof r.avg === "string" ? r.avg : ab > 0 ? (h / ab).toFixed(3) : "—"
  const tbRaw = r.tb
  const tbNum =
    typeof tbRaw === "number" && Number.isFinite(tbRaw) ? tbRaw : null
  let isop: string
  if (typeof r.isop === "string") isop = r.isop
  else if (ab > 0 && tbNum != null) isop = ((tbNum - h) / ab).toFixed(3)
  else isop = "—"
  const hr = Number(r.hr) || 0
  const out: ZoneStat = {
    zoneId,
    pitches: Number(r.pitches) || 0,
    ab,
    h,
    hr,
    avg,
    isop,
  }
  if (tbNum != null) out.tb = tbNum
  return out
}

function normalizeZoneStatsResponse(raw: unknown): ZoneStatsResponse | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const gameId = typeof o.game_id === "string" ? o.game_id : ""
  const pitcherId = typeof o.pitcher_id === "string" ? o.pitcher_id : ""
  const mapSide = (v: unknown): ZoneStat[] => {
    if (!Array.isArray(v)) return []
    return v.map(normalizeZoneStatRow).filter((x): x is ZoneStat => x != null)
  }
  return {
    game_id: gameId,
    pitcher_id: pitcherId,
    vsRight: mapSide(o.vsRight),
    vsLeft: mapSide(o.vsLeft),
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
    return normalizeZoneStatsResponse(JSON.parse(readFileSync(filePath, "utf-8")))
  } catch {
    return null
  }
}

/** Phase 20 出力: `_data/derived/pitcher_zone_from_canonical/{year}/yahoo_*.json` */
export type PitcherZoneSeasonDerivedPayload = {
  zoneStats: ZoneStatsResponse
  seasonYear: string
  schemaVersion: string
  generatedAt?: string
  canonicalGames: string[]
}

export function loadPitcherZoneSeasonDerived(
  projectRoot: string,
  yahooPitcherId: string,
  year: string
): PitcherZoneSeasonDerivedPayload | null {
  const yid = yahooPitcherId.trim()
  const y = year.trim()
  if (!yid || !y) return null
  const filePath = join(
    projectRoot,
    "_data",
    "derived",
    "pitcher_zone_from_canonical",
    y,
    `yahoo_${yid}.json`
  )
  if (!existsSync(filePath)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(filePath, "utf-8"))
    const zoneStats = normalizeZoneStatsResponse(raw)
    if (!zoneStats) return null
    const o = raw as Record<string, unknown>
    const seasonYear = typeof o.seasonYear === "string" ? o.seasonYear : y
    const schemaVersion =
      typeof o.schemaVersion === "string"
        ? o.schemaVersion
        : "pitcher-zone-from-canonical-unknown"
    const generatedAt =
      typeof o.generatedAt === "string" ? o.generatedAt : undefined
    const src = o.source
    let canonicalGames: string[] = []
    if (src && typeof src === "object") {
      const cg = (src as { canonicalGames?: unknown }).canonicalGames
      if (Array.isArray(cg)) {
        canonicalGames = cg.filter((x): x is string => typeof x === "string")
      }
    }
    return {
      zoneStats,
      seasonYear,
      schemaVersion,
      generatedAt,
      canonicalGames,
    }
  } catch {
    return null
  }
}
