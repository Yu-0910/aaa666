/**
 * Phase 4: 投球詳細パイロット
 * Phase14 派生が無い場合のフォールバック: pitch_details.csv（batter_id 一致）
 */

import fs from 'fs'
import path from 'path'
import type { PlateAppearance } from '@/lib/yahooGame/types'
import { bucketPitchResultForTypeRow } from '@/lib/yahooGame/pitchCountSim'
import {
  getTotalBasesFromResultJa,
  isHitResultJa,
  isHomeRunFromResultJa,
  isHbpResultJa,
  isSfResultJa,
} from '@/lib/yahooGame/paSettlementStatsFromResultJa'
import {
  isSettlementPitchResultJa,
  isStrikeoutResultJa,
} from '@/lib/yahooGame/paOutcomeResultJa'
import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import type { ZoneStat, ZoneStatsResponse } from '@/lib/yahooGame/gamePitcherPilotFiles'
import {
  effectiveVsHandBucketForPitcherSplit,
  pitcherThrowHandRLFromYahooPitcherId,
} from '@/lib/yahooGame/batterHandFromCanonical'
import { getProjectRoot } from '@/lib/projectRoot'
import { DERIVED_SEASON_YEAR_DEFAULT, getYahooIdForPilot } from './seasonStatsPilot'
import {
  STRAIGHT_SPEED_BAND_KEYS,
  kmhToStraightBandKey,
  resolveStraightSpeedBandKey,
} from '@/lib/straightSpeedBands'

export {
  STRAIGHT_SPEED_BANDS,
  STRAIGHT_SPEED_BAND_KEYS,
  type StraightSpeedBandKey,
} from '@/lib/straightSpeedBands'

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

/** 打席単位にまとめた投球詳細 */
export type PlateAppearancePitches = {
  inning: number
  top_bottom: string
  bat_order: number
  game_id: string
  pitches: PitchDetailRow[]
}

export function loadPitchDetails(yahooId: string): PlateAppearancePitches[] {
  const bid = yahooId.trim()
  if (!bid) return []

  const csvPath = path.join(
    process.cwd(),
    '_data',
    'yahoo_games_pilot',
    'pitch_details.csv'
  )
  if (!fs.existsSync(csvPath)) return []

  const text = fs.readFileSync(csvPath, 'utf-8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0].split(',')
  const rows: PitchDetailRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < header.length) continue
    if ((cols[5] ?? '').trim() !== bid) continue
    rows.push({
      game_id: cols[0] ?? '',
      inning: parseInt(cols[1] ?? '0', 10) || 0,
      top_bottom: cols[2] ?? '',
      bat_order: parseInt(cols[3] ?? '0', 10) || 0,
      pitcher_id: cols[4] ?? '',
      batter_id: cols[5] ?? '',
      pitch_no: parseInt(cols[6] ?? '0', 10) || 0,
      pitch_type: cols[7] ?? '',
      speed_kmh: cols[8] ?? '',
      result: cols[9] ?? '',
      zone_top_px: cols[10] ?? '',
      zone_left_px: cols[11] ?? '',
      zone_row: cols[12] ?? '',
      zone_col: cols[13] ?? '',
      zone_id: cols[14] ?? '',
    })
  }

  // 打席単位にグルーピング
  const paMap = new Map<string, PlateAppearancePitches>()
  for (const r of rows) {
    const key = `${r.game_id}-${r.inning}-${r.top_bottom}-${r.bat_order}`
    let pa = paMap.get(key)
    if (!pa) {
      pa = {
        game_id: r.game_id,
        inning: r.inning,
        top_bottom: r.top_bottom,
        bat_order: r.bat_order,
        pitches: [],
      }
      paMap.set(key, pa)
    }
    pa.pitches.push(r)
  }

  return Array.from(paMap.values()).sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning
    if (a.top_bottom !== b.top_bottom) return a.top_bottom === '表' ? -1 : 1
    return a.bat_order - b.bat_order
  })
}

/** 球種別成績（G-3）+ フル指標 */
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

/** 投球詳細から球種別成績を集計 */
export function aggregateByPitchType(plateAppearances: PlateAppearancePitches[]): PitchTypeStats[] {
  const allPitches = plateAppearances.flatMap((pa) => pa.pitches)
  if (allPitches.length === 0) return []

  const total = allPitches.length
  const byType = new Map<string, PitchDetailRow[]>()
  for (const p of allPitches) {
    const t = p.pitch_type || '不明'
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t)!.push(p)
  }

  // 打席の最終球 = 決着球。その球種に打数・安打・HR・三振・四球・死球・犠飛・塁打をカウント
  const settlementByType = new Map<string, { ab: number; h: number; hr: number; tb: number; so: number; bb: number; hbp: number; sf: number }>()
  for (const pa of plateAppearances) {
    if (pa.pitches.length === 0) continue
    const last = pa.pitches[pa.pitches.length - 1]
    const t = last.pitch_type || '不明'
    if (!settlementByType.has(t)) settlementByType.set(t, { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 })
    const rec = settlementByType.get(t)!
    if (isSettlementPitchResultJa(last.result)) {
      rec.ab += 1
      if (isHitResultJa(last.result)) {
        rec.h += 1
        rec.tb += getTotalBasesFromResultJa(last.result)
        if (isHomeRunFromResultJa(last.result)) rec.hr += 1
      }
    }
    if (isStrikeoutResultJa(last.result)) rec.so += 1
    if (isWalkLikeResultText(last.result)) rec.bb += 1
    if (isHbpResultJa(last.result)) rec.hbp += 1
    if (isSfResultJa(last.result)) rec.sf += 1
  }

  const result: PitchTypeStats[] = []
  for (const [pitchType, pitches] of byType.entries()) {
    let balls = 0
    let swingMiss = 0
    let taken = 0
    let foul = 0
    for (const p of pitches) {
      switch (bucketPitchResultForTypeRow(p.result)) {
        case 'balls':
          balls += 1
          break
        case 'swing_miss':
          swingMiss += 1
          break
        case 'taken':
          taken += 1
          break
        case 'foul':
          foul += 1
          break
      }
    }
    const set = settlementByType.get(pitchType) || { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 }
    // ストライク = 空振り相当+見逃し+ファウル+インプレイ（打数でアウト/安打＝三振以外のAB）
    const inPlay = set.ab - set.so
    const strikes = swingMiss + taken + foul + inPlay

    const speeds = pitches.map((p) => parseInt(p.speed_kmh, 10)).filter((n) => !isNaN(n))
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null

    const strikePct = pitches.length > 0 ? ((strikes / pitches.length) * 100).toFixed(1) + '%' : '—'
    const swingTotal = swingMiss + foul + set.ab
    const whiffPct = swingTotal > 0 ? ((swingMiss / swingTotal) * 100).toFixed(1) + '%' : '—'

    const avg = set.ab > 0 ? (set.h / set.ab).toFixed(3) : '—'
    const pa = set.ab + set.bb + set.hbp + set.sf
    const obp = pa > 0 ? (set.h + set.bb + set.hbp) / pa : 0
    const slg = set.ab > 0 ? set.tb / set.ab : 0
    const ops = set.ab > 0 || pa > 0 ? (obp + slg).toFixed(3) : '—'

    result.push({
      pitch_type: pitchType,
      pitches: pitches.length,
      pct: total > 0 ? (pitches.length / total) * 100 : 0,
      avg_speed: avgSpeed,
      balls,
      strikes,
      strike_pct: strikePct,
      swing_miss: swingMiss,
      taken,
      foul,
      whiff_pct: whiffPct,
      ab: set.ab,
      h: set.h,
      hr: set.hr,
      so: set.so,
      bb: set.bb,
      hbp: set.hbp,
      tb: set.tb,
      avg,
      ops,
    })
  }

  return result.sort((a, b) => b.pitches - a.pitches)
}

/** ゾーン別成績（25マス） */
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
  /** Isolated power: (TB − H) / AB */
  isop: string
}

/** 決着球でゾーンに何か記録されるか（AB/BB/HBP/SF） */
function isZoneSettlement(r: string): boolean {
  return isSettlementPitchResultJa(r) || isWalkLikeResultText(r) || isHbpResultJa(r) || isSfResultJa(r)
}

/** 投球詳細からゾーン別成績を集計 */
export function aggregateByZone(
  plateAppearances: PlateAppearancePitches[]
): ZoneStats[] {
  const pitchCount = new Map<number, number>()
  const byZone = new Map<
    number,
    { ab: number; h: number; hr: number; tb: number; bb: number; hbp: number; sf: number }
  >()

  for (const pa of plateAppearances) {
    for (const p of pa.pitches) {
      const zid = parseInt(p.zone_id, 10)
      if (zid >= 1 && zid <= 25) {
        pitchCount.set(zid, (pitchCount.get(zid) ?? 0) + 1)
      }
    }
    if (pa.pitches.length > 0) {
      const last = pa.pitches[pa.pitches.length - 1]
      const zid = parseInt(last.zone_id, 10)
      if (zid >= 1 && zid <= 25 && isZoneSettlement(last.result)) {
        if (!byZone.has(zid)) {
          byZone.set(zid, { ab: 0, h: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0 })
        }
        const rec = byZone.get(zid)!
        if (isWalkLikeResultText(last.result)) {
          rec.bb += 1
        } else if (isHbpResultJa(last.result)) {
          rec.hbp += 1
        } else if (isSfResultJa(last.result)) {
          rec.sf += 1
        } else if (isSettlementPitchResultJa(last.result)) {
          rec.ab += 1
          if (isHitResultJa(last.result)) {
            rec.h += 1
            rec.tb += getTotalBasesFromResultJa(last.result)
            if (isHomeRunFromResultJa(last.result)) rec.hr += 1
          }
        }
      }
    }
  }

  const result: ZoneStats[] = []
  for (let z = 1; z <= 25; z++) {
    const pitches = pitchCount.get(z) ?? 0
    const rec = byZone.get(z) ?? {
      ab: 0,
      h: 0,
      hr: 0,
      tb: 0,
      bb: 0,
      hbp: 0,
      sf: 0,
    }
    const { ab, h, hr, tb, bb, hbp, sf } = rec
    const avg = ab > 0 ? (h / ab).toFixed(3) : '—'
    const isopStr = ab > 0 ? ((tb - h) / ab).toFixed(3) : '—'

    result.push({
      zoneId: z,
      pitches,
      ab: rec.ab,
      h: rec.h,
      hr: rec.hr,
      tb: rec.tb,
      bb: rec.bb,
      hbp: rec.hbp,
      sf: rec.sf,
      avg,
      isop: isopStr,
    })
  }
  return result
}

/** Phase 14 派生 JSON（canonical 由来の球種・ゾーン・球速帯） */
export type SpeedBandStatsRow = {
  /** Isolated Power: (TB − H) / AB */
  isop: string
  avg: string
  hr: number
  /** 二塁打（打席確定かつ最終球がストレートの帯に属する場合） */
  h2: number
  /** 全ストレート投球に占める当該球速帯の投球数の割合 */
  pitch_share_pct: string
  whiff_pct: string
}

export type SpeedBandStatsMap = Partial<Record<string, SpeedBandStatsRow>>

/** Phase14 JSON ルートに付く speedBandStats 内フィールドの日本語意味（ドキュメント用） */
export type Phase14SpeedBandStatsFieldJa = {
  /** 全ストレート投球に占める当該球速帯の投球数の割合 */
  pitch_share_pct: '投球割合'
}

export const PHASE14_SPEED_BAND_STATS_FIELD_JA: Phase14SpeedBandStatsFieldJa = {
  pitch_share_pct: '投球割合',
}

export type Phase14PitchFile = {
  schemaVersion?: string
  seasonYear?: string
  yahooBatterId?: string
  pitchTypeStats?: PitchTypeStats[]
  zoneStats?: ZoneStats[]
  speedBandStats?: SpeedBandStatsMap
  /** speedBandStats 各プロパティの意味（投球割合＝pitch_share_pct など） */
  speedBandStatsFieldJa?: Phase14SpeedBandStatsFieldJa
}

function phase14PitchJsonPath(yahooId: string, year: string): string {
  return path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_pitch_from_canonical',
    year,
    `yahoo_${yahooId}.json`
  )
}

export function loadPhase14PitchBundle(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Phase14PitchFile | null {
  const p = phase14PitchJsonPath(yahooId, year)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Phase14PitchFile
  } catch {
    return null
  }
}

export function normalizePitchTypeFromCanonical(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return '不明'
  if (/カット|スライダ|チェンジ|カーブ|フォーク|スプリット|縦カット|スラッ|ナックル/.test(s)) return s
  if (/ストレート|直球|フォーシーム|ファースト|ツーシーム|2シーム|二シーム|２シーム|速球/.test(s)) return 'ストレート'
  return s
}

export function canonicalPlateAppearanceToPilot(
  gameId: string,
  pa: PlateAppearance
): PlateAppearancePitches | null {
  const pe = pa.pitchEvents ?? []
  if (pe.length === 0) return null
  const batterId = (pa.yahooBatterId ?? '').trim()
  const pitches: PitchDetailRow[] = pe.map((ev, i) => ({
    game_id: gameId,
    inning: 0,
    top_bottom: '',
    bat_order: 0,
    pitcher_id: (ev.yahooPitcherId ?? pa.yahooPitcherId ?? '').trim(),
    batter_id: batterId,
    pitch_no: ev.pitchIndex ?? i + 1,
    pitch_type: normalizePitchTypeFromCanonical(ev.pitchTypeJa ?? '不明'),
    speed_kmh:
      ev.speedKmh != null && Number.isFinite(ev.speedKmh) ? String(Math.round(ev.speedKmh)) : '',
    result: (ev.resultJa ?? '').trim(),
    zone_top_px: '',
    zone_left_px: '',
    zone_row: '',
    zone_col: '',
    zone_id:
      ev.zoneId != null && ev.zoneId >= 1 && ev.zoneId <= 25 ? String(ev.zoneId) : '',
  }))
  return {
    game_id: gameId,
    inning: 0,
    top_bottom: '',
    bat_order: 0,
    pitches,
  }
}

export function isStraightPitchKind(pitchType: string): boolean {
  const s = (pitchType || '').trim()
  if (!s || s === '不明') return false
  if (/カット|スライダ|チェンジ|カーブ|フォーク|スプリット|縦カット|スラッ|ナックル/.test(s)) return false
  return /ストレート|直球|フォーシーム|ファースト|ツーシーム|2シーム|二シーム|２シーム|速球/.test(s)
}

export function aggregateSpeedBandsStraightOnly(
  plateAppearances: PlateAppearancePitches[]
): SpeedBandStatsMap {
  const byBand = new Map<string, PitchDetailRow[]>()
  for (const pa of plateAppearances) {
    for (const p of pa.pitches) {
      if (!isStraightPitchKind(p.pitch_type)) continue
      const kmh = parseInt(p.speed_kmh, 10)
      const band = kmhToStraightBandKey(kmh)
      if (!band) continue
      if (!byBand.has(band)) byBand.set(band, [])
      byBand.get(band)!.push(p)
    }
  }

  let totalStraightPitches = 0
  for (const arr of byBand.values()) totalStraightPitches += arr.length

  const settlementByBand = new Map<
    string,
    {
      ab: number
      h: number
      hr: number
      h2: number
      tb: number
      so: number
      bb: number
      hbp: number
      sf: number
    }
  >()

  for (const pa of plateAppearances) {
    if (pa.pitches.length === 0) continue
    const last = pa.pitches[pa.pitches.length - 1]
    if (!isStraightPitchKind(last.pitch_type)) continue
    const kmh = parseInt(last.speed_kmh, 10)
    const band = kmhToStraightBandKey(kmh)
    if (!band) continue
    if (!settlementByBand.has(band)) {
      settlementByBand.set(band, {
        ab: 0,
        h: 0,
        hr: 0,
        h2: 0,
        tb: 0,
        so: 0,
        bb: 0,
        hbp: 0,
        sf: 0,
      })
    }
    const rec = settlementByBand.get(band)!
    if (isSettlementPitchResultJa(last.result)) {
      rec.ab += 1
      if (isHitResultJa(last.result)) {
        rec.h += 1
        const tbAdd = getTotalBasesFromResultJa(last.result)
        rec.tb += tbAdd
        if (isHomeRunFromResultJa(last.result)) rec.hr += 1
        if (tbAdd === 2) rec.h2 += 1
      }
    }
    if (isStrikeoutResultJa(last.result)) rec.so += 1
    if (isWalkLikeResultText(last.result)) rec.bb += 1
    if (isHbpResultJa(last.result)) rec.hbp += 1
    if (isSfResultJa(last.result)) rec.sf += 1
  }

  const out: SpeedBandStatsMap = {}
  for (const band of STRAIGHT_SPEED_BAND_KEYS) {
    const pitches = byBand.get(band) ?? []
    const set = settlementByBand.get(band) ?? {
      ab: 0,
      h: 0,
      hr: 0,
      h2: 0,
      tb: 0,
      so: 0,
      bb: 0,
      hbp: 0,
      sf: 0,
    }
    if (pitches.length === 0 && set.ab === 0 && set.bb === 0 && set.hbp === 0 && set.sf === 0) {
      continue
    }

    let swingMiss = 0
    let taken = 0
    let foul = 0
    for (const p of pitches) {
      switch (bucketPitchResultForTypeRow(p.result)) {
        case 'swing_miss':
          swingMiss += 1
          break
        case 'taken':
          taken += 1
          break
        case 'foul':
          foul += 1
          break
      }
    }
    const swingTotal = swingMiss + foul + set.ab
    const whiffPct = swingTotal > 0 ? ((swingMiss / swingTotal) * 100).toFixed(1) + '%' : '—'
    const avg = set.ab > 0 ? (set.h / set.ab).toFixed(3) : '—'
    const isop = set.ab > 0 ? ((set.tb - set.h) / set.ab).toFixed(3) : '—'
    const pitchSharePct =
      totalStraightPitches > 0
        ? ((pitches.length / totalStraightPitches) * 100).toFixed(1) + '%'
        : '—'

    out[band] = {
      isop,
      avg,
      hr: set.hr,
      h2: set.h2,
      pitch_share_pct: pitchSharePct,
      whiff_pct: whiffPct,
    }
  }
  return out
}

export function loadPitchTypeStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): PitchTypeStats[] {
  const b = loadPhase14PitchBundle(yahooId, year)
  if (b?.pitchTypeStats && b.pitchTypeStats.length > 0) return b.pitchTypeStats
  const pas = loadPitchDetails(yahooId)
  return aggregateByPitchType(pas)
}

export function loadSpeedBandStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): SpeedBandStatsMap {
  const b = loadPhase14PitchBundle(yahooId, year)
  const raw = b?.speedBandStats
  if (!raw || Object.keys(raw).length === 0) return {}

  const out: SpeedBandStatsMap = {}
  for (const [band, row] of Object.entries(raw)) {
    const nk = resolveStraightSpeedBandKey(band)
    if (!nk) continue
    const r = row as Partial<SpeedBandStatsRow> & { ops?: string; strike_pct?: string }
    const next: SpeedBandStatsRow = {
      isop: typeof r.isop === 'string' ? r.isop : '—',
      avg: typeof r.avg === 'string' ? r.avg : '—',
      hr: typeof r.hr === 'number' ? r.hr : 0,
      h2: typeof r.h2 === 'number' ? r.h2 : 0,
      pitch_share_pct: typeof r.pitch_share_pct === 'string' ? r.pitch_share_pct : '—',
      whiff_pct: typeof r.whiff_pct === 'string' ? r.whiff_pct : '—',
    }
    const prev = out[nk]
    if (prev) {
      out[nk] = {
        isop: prev.isop,
        avg: prev.avg,
        hr: prev.hr + next.hr,
        h2: prev.h2 + next.h2,
        pitch_share_pct: prev.pitch_share_pct,
        whiff_pct: prev.whiff_pct,
      }
    } else {
      out[nk] = next
    }
  }
  return out
}

function migrateLegacyZoneStatsRow(raw: unknown): ZoneStats | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const zoneId = Number(r.zoneId)
  if (!Number.isFinite(zoneId)) return null
  const pitches = Number(r.pitches) || 0
  const ab = Number(r.ab) || 0
  const h = Number(r.h) || 0
  const hr = Number(r.hr) || 0
  const tb = typeof r.tb === 'number' && Number.isFinite(r.tb) ? r.tb : 0
  const bb = Number(r.bb) || 0
  const hbp = Number(r.hbp) || 0
  const sf = Number(r.sf) || 0
  const avg =
    typeof r.avg === 'string' ? r.avg : ab > 0 ? (h / ab).toFixed(3) : '—'
  let isop: string
  if (typeof r.isop === 'string') isop = r.isop
  else if (ab > 0 && typeof r.tb === 'number' && Number.isFinite(r.tb))
    isop = ((r.tb - h) / ab).toFixed(3)
  else isop = '—'
  return {
    zoneId,
    pitches,
    ab,
    h,
    hr,
    tb,
    bb,
    hbp,
    sf,
    avg,
    isop,
  }
}

/** ゾーン別成績：Phase 14 派生があれば優先 */
export function loadZoneStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): ZoneStats[] {
  const b = loadPhase14PitchBundle(yahooId, year)
  if (b?.zoneStats && b.zoneStats.length > 0) {
    return b.zoneStats
      .map(migrateLegacyZoneStatsRow)
      .filter((x): x is ZoneStats => x != null)
  }
  const pas = loadPitchDetails(yahooId)
  return aggregateByZone(pas)
}

type HandBucket = 'vsRight' | 'vsLeft'

function isZoneSettlementForPitch(r: string): boolean {
  return isSettlementPitchResultJa(r) || isWalkLikeResultText(r) || isHbpResultJa(r) || isSfResultJa(r)
}

/** ゾーン集計用: 両打は投手の投球腕に応じて対右 or 対左の片側のみ。腕不明の両打のみ従来どおり両ゾーンに配分 */
function handBucketsForZonePitcherVsBatter(
  bat: '左' | '右' | '両' | '',
  pitcherThrow: 'R' | 'L' | ''
): HandBucket[] {
  const b = effectiveVsHandBucketForPitcherSplit(bat, pitcherThrow)
  if (b === 'L') return ['vsLeft']
  if (b === 'R') return ['vsRight']
  if (bat === '両') return ['vsRight', 'vsLeft']
  if (bat === '左') return ['vsLeft']
  if (bat === '右') return ['vsRight']
  return ['vsRight']
}

/**
 * 投手個人ページ Phase 4: canonical の打席から対右・対左の 25 ゾーンを集計（fetch_pitcher_zone_stats.py と同趣旨）
 */
export function buildPitcherZoneStatsFromCanonicalPlateAppearances(
  gameId: string,
  yahooPitcherId: string,
  plateAppearances: PlateAppearance[],
  resolveBatHandJa: (batterId: string) => '左' | '右' | '両' | ''
): ZoneStatsResponse | null {
  const pid = yahooPitcherId.trim()
  if (!pid) return null
  const pitcherThrow = pitcherThrowHandRLFromYahooPitcherId(pid)

  let sawPitch = false
  for (const pa of plateAppearances) {
    const pilotProbe = canonicalPlateAppearanceToPilot(gameId, pa)
    if (!pilotProbe?.pitches.length) continue
    if (pilotProbe.pitches.some((p) => (p.pitcher_id ?? '').trim() === pid)) {
      sawPitch = true
      break
    }
  }
  if (!sawPitch) return null

  const pitchCount: Record<HandBucket, Map<number, number>> = {
    vsRight: new Map(),
    vsLeft: new Map(),
  }
  const byZone: Record<
    HandBucket,
    Map<number, { ab: number; h: number; hr: number; tb: number; bb: number; hbp: number; sf: number }>
  > = {
    vsRight: new Map(),
    vsLeft: new Map(),
  }

  const ensureRec = (hand: HandBucket, z: number) => {
    if (!byZone[hand].has(z)) {
      byZone[hand].set(z, { ab: 0, h: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0 })
    }
    return byZone[hand].get(z)!
  }

  for (const pa of plateAppearances) {
    const pilot = canonicalPlateAppearanceToPilot(gameId, pa)
    if (!pilot || pilot.pitches.length === 0) continue

    const pitchesForPid = pilot.pitches.filter((p) => (p.pitcher_id ?? '').trim() === pid)
    if (pitchesForPid.length === 0) continue

    const batterId = (pa.yahooBatterId ?? '').trim()
    const bat = resolveBatHandJa(batterId)
    const hands = handBucketsForZonePitcherVsBatter(bat, pitcherThrow)

    for (const p of pitchesForPid) {
      const zid = parseInt(p.zone_id, 10)
      if (zid < 1 || zid > 25) continue
      for (const h of hands) {
        pitchCount[h].set(zid, (pitchCount[h].get(zid) ?? 0) + 1)
      }
    }

    const sorted = [...pilot.pitches].sort((a, b) => (a.pitch_no ?? 0) - (b.pitch_no ?? 0))
    const finalPitch = sorted[sorted.length - 1]!
    if ((finalPitch.pitcher_id ?? '').trim() !== pid) continue
    /** 決着の結果は常に最終球。ゾーンだけ直前の有効マスを借りる（fetch_pitcher_zone_stats.py と同じ） */
    const settlementResult = finalPitch.result

    let zid = parseInt(finalPitch.zone_id, 10)
    if (zid < 1 || zid > 25) {
      for (let i = sorted.length - 2; i >= 0; i--) {
        const z = parseInt(sorted[i]!.zone_id, 10)
        if (z >= 1 && z <= 25) {
          zid = z
          break
        }
      }
    }
    if (zid < 1 || zid > 25) continue
    if (!isZoneSettlementForPitch(settlementResult)) continue

    for (const hb of hands) {
      const rec = ensureRec(hb, zid)
      if (isWalkLikeResultText(settlementResult)) {
        rec.bb += 1
      } else if (isHbpResultJa(settlementResult)) {
        rec.hbp += 1
      } else if (isSfResultJa(settlementResult)) {
        rec.sf += 1
      } else if (isSettlementPitchResultJa(settlementResult)) {
        rec.ab += 1
        if (isHitResultJa(settlementResult)) {
          rec.h += 1
          rec.tb += getTotalBasesFromResultJa(settlementResult)
          if (isHomeRunFromResultJa(settlementResult)) rec.hr += 1
        }
      }
    }
  }

  const buildSide = (hand: HandBucket): ZoneStat[] => {
    const out: ZoneStat[] = []
    for (let z = 1; z <= 25; z++) {
      const pitches = pitchCount[hand].get(z) ?? 0
      const rec = byZone[hand].get(z) ?? {
        ab: 0,
        h: 0,
        hr: 0,
        tb: 0,
        bb: 0,
        hbp: 0,
        sf: 0,
      }
      const { ab, h, hr, tb, bb, hbp, sf } = rec
      const avg = ab > 0 ? (h / ab).toFixed(3) : '—'
      const isop = ab > 0 ? ((tb - h) / ab).toFixed(3) : '—'
      const row: ZoneStat = { zoneId: z, pitches, ab, h, hr, isop, avg }
      if (tb > 0 || ab > 0) row.tb = tb
      out.push(row)
    }
    return out
  }

  return {
    game_id: gameId,
    pitcher_id: pid,
    vsRight: buildSide('vsRight'),
    vsLeft: buildSide('vsLeft'),
  }
}
