/**
 * Phase 4: 投球詳細パイロット
 * pitch_details_kikuchi.csv から菊池涼介の打席別球種・コース情報を取得
 */

import fs from 'fs'
import path from 'path'
import type { PlateAppearance } from '@/lib/yahooGame/types'
import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import type { ZoneStat, ZoneStatsResponse } from '@/lib/yahooGame/gamePitcherPilotFiles'
import { DERIVED_SEASON_YEAR_DEFAULT, getYahooIdForPilot } from './seasonStatsPilot'

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
  if (yahooId !== '1100082') return []

  const csvPath = path.join(
    process.cwd(),
    '_data',
    'yahoo_games_pilot',
    'pitch_details_kikuchi.csv'
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

/** 打席の決着球か（打数にカウント） */
function isSettlementResult(r: string): boolean {
  const s = (r || '').trim()
  // 飛球系: Yahoo は括弧付き・番号付き（一飛／二飛／邪飛）など多様。行末 $ は使わない
  if (
    /^(左飛|中飛|右飛|一飛|二飛|三飛|遊飛|左邪飛|三邪飛|レフトフライ|センターフライ|ライトフライ|フライ)/.test(
      s
    )
  )
    return true
  // 内野直球（遊直 等）
  if (/遊直|一塁直|二塁直|三塁直/.test(s)) return true
  if (/ゴロ|ライナー|併殺/.test(s)) return true
  if (/^(空振り|見逃し)/.test(s)) return true
  if (/三振|空三振|見三振/.test(s)) return true
  // 左安・右安・中安・遊安、略号の 右２／左３（全角数字）は「安打」文字列が無い
  if (/^(左安|右安|中安|遊安|二塁|三塁|本塁|ソロ|満塁)/.test(s)) return true
  if (/^(右|左|中)[２2]/.test(s) || /^(右|左|中)[３3]/.test(s)) return true
  if (/安打|ヒット|二塁打|三塁打|本塁打/.test(s)) return true
  return false
}

/** 安打か */
function isHit(r: string): boolean {
  const s = (r || '').trim()
  if (/^(左安|右安|中安|遊安|二塁|三塁|本塁|ソロ|満塁)/.test(s)) return true
  // Yahoo: 右２・左３（二塁打・三塁打の略、全角数字）
  if (/^(右|左|中)[２2]/.test(s) || /^(右|左|中)[３3]/.test(s)) return true
  return /安打|ヒット/.test(s)
}

/** 塁打数を取得（単打=1, 二塁=2, 三塁=3, 本塁打=4） */
function getTotalBases(r: string): number {
  const s = (r || '').trim()
  if (/本塁打|ホームラン|HR/i.test(s)) return 4
  if (/三塁打/.test(s)) return 3
  if (/二塁打/.test(s)) return 2
  if (/^(右|左|中)[３3]/.test(s)) return 3
  if (/^(右|左|中)[２2]/.test(s)) return 2
  if (isHit(s)) return 1
  return 0
}

/** 本塁打か */
function isHomeRun(r: string): boolean {
  return getTotalBases(r) === 4
}

/** 死球か */
function isHBP(r: string): boolean {
  return /死球/.test((r || '').trim())
}

/** 犠飛・犠打（投犠打／捕犠打。ゾーン集計では sf 欄に寄せる） */
function isSF(r: string): boolean {
  return /犠飛|投犠打|捕犠打/.test((r || '').trim())
}

/** 三振か（決着球が空振り・見逃し） */
function isStrikeout(r: string): boolean {
  const s = (r || '').trim()
  return /^空振り|^見逃し|三振|空三振|見三振/.test(s)
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
    if (isSettlementResult(last.result)) {
      rec.ab += 1
      if (isHit(last.result)) {
        rec.h += 1
        rec.tb += getTotalBases(last.result)
        if (isHomeRun(last.result)) rec.hr += 1
      }
    }
    if (isStrikeout(last.result)) rec.so += 1
    if (isWalkLikeResultText(last.result)) rec.bb += 1
    if (isHBP(last.result)) rec.hbp += 1
    if (isSF(last.result)) rec.sf += 1
  }

  const result: PitchTypeStats[] = []
  for (const [pitchType, pitches] of byType.entries()) {
    const balls = pitches.filter((p) => /^ボール/.test(p.result)).length
    const swingMiss = pitches.filter((p) => /^空振り/.test(p.result)).length
    const taken = pitches.filter((p) => /^見逃し/.test(p.result)).length
    const foul = pitches.filter((p) => /^ファウル/.test(p.result)).length
    const set = settlementByType.get(pitchType) || { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 }
    // ストライク = 空振り+見逃し+ファウル+インプレイ（打数でアウト/安打＝三振以外のAB）
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
  ops: string
}

/** 決着球でゾーンに何か記録されるか（AB/BB/HBP/SF） */
function isZoneSettlement(r: string): boolean {
  return isSettlementResult(r) || isWalkLikeResultText(r) || isHBP(r) || isSF(r)
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
        } else if (isHBP(last.result)) {
          rec.hbp += 1
        } else if (isSF(last.result)) {
          rec.sf += 1
        } else if (isSettlementResult(last.result)) {
          rec.ab += 1
          if (isHit(last.result)) {
            rec.h += 1
            rec.tb += getTotalBases(last.result)
            if (isHomeRun(last.result)) rec.hr += 1
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
    const pa = ab + bb + hbp + sf
    const obp = pa > 0 ? (h + bb + hbp) / pa : 0
    const slg = ab > 0 ? tb / ab : 0
    const opsVal = obp + slg
    const ops = pa > 0 ? opsVal.toFixed(3) : '—'

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
      ops,
    })
  }
  return result
}

/** Phase 14 派生 JSON（canonical 由来の球種・ゾーン・球速帯） */
export type SpeedBandStatsRow = {
  ops: string
  avg: string
  hr: number
  strike_pct: string
  whiff_pct: string
}

export type SpeedBandStatsMap = Partial<Record<string, SpeedBandStatsRow>>

export type Phase14PitchFile = {
  schemaVersion?: string
  seasonYear?: string
  yahooBatterId?: string
  pitchTypeStats?: PitchTypeStats[]
  zoneStats?: ZoneStats[]
  speedBandStats?: SpeedBandStatsMap
}

export const STRAIGHT_SPEED_BAND_KEYS = [
  '160-',
  '155-159',
  '150-154',
  '145-149',
  '140-144',
  '-139',
] as const

function phase14PitchJsonPath(yahooId: string, year: string): string {
  return path.join(
    process.cwd(),
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

function kmhToStraightBand(kmh: number): string | null {
  if (!Number.isFinite(kmh)) return null
  if (kmh >= 160) return '160-'
  if (kmh >= 155) return '155-159'
  if (kmh >= 150) return '150-154'
  if (kmh >= 145) return '145-149'
  if (kmh >= 140) return '140-144'
  return '-139'
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
      const band = kmhToStraightBand(kmh)
      if (!band) continue
      if (!byBand.has(band)) byBand.set(band, [])
      byBand.get(band)!.push(p)
    }
  }

  const settlementByBand = new Map<
    string,
    { ab: number; h: number; hr: number; tb: number; so: number; bb: number; hbp: number; sf: number }
  >()

  for (const pa of plateAppearances) {
    if (pa.pitches.length === 0) continue
    const last = pa.pitches[pa.pitches.length - 1]
    if (!isStraightPitchKind(last.pitch_type)) continue
    const kmh = parseInt(last.speed_kmh, 10)
    const band = kmhToStraightBand(kmh)
    if (!band) continue
    if (!settlementByBand.has(band)) {
      settlementByBand.set(band, { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 })
    }
    const rec = settlementByBand.get(band)!
    if (isSettlementResult(last.result)) {
      rec.ab += 1
      if (isHit(last.result)) {
        rec.h += 1
        rec.tb += getTotalBases(last.result)
        if (isHomeRun(last.result)) rec.hr += 1
      }
    }
    if (isStrikeout(last.result)) rec.so += 1
    if (isWalkLikeResultText(last.result)) rec.bb += 1
    if (isHBP(last.result)) rec.hbp += 1
    if (isSF(last.result)) rec.sf += 1
  }

  const out: SpeedBandStatsMap = {}
  for (const band of STRAIGHT_SPEED_BAND_KEYS) {
    const pitches = byBand.get(band) ?? []
    const set = settlementByBand.get(band) ?? {
      ab: 0,
      h: 0,
      hr: 0,
      tb: 0,
      so: 0,
      bb: 0,
      hbp: 0,
      sf: 0,
    }
    if (pitches.length === 0 && set.ab === 0 && set.bb === 0 && set.hbp === 0 && set.sf === 0) {
      continue
    }

    const swingMiss = pitches.filter((p) => /^空振り/.test(p.result)).length
    const taken = pitches.filter((p) => /^見逃し/.test(p.result)).length
    const foul = pitches.filter((p) => /^ファウル/.test(p.result)).length
    const inPlay = set.ab - set.so
    const strikes = swingMiss + taken + foul + inPlay
    const strikePct =
      pitches.length > 0 ? ((strikes / pitches.length) * 100).toFixed(1) + '%' : '—'
    const swingTotal = swingMiss + foul + set.ab
    const whiffPct = swingTotal > 0 ? ((swingMiss / swingTotal) * 100).toFixed(1) + '%' : '—'
    const avg = set.ab > 0 ? (set.h / set.ab).toFixed(3) : '—'
    const paTot = set.ab + set.bb + set.hbp + set.sf
    const obp = paTot > 0 ? (set.h + set.bb + set.hbp) / paTot : 0
    const slg = set.ab > 0 ? set.tb / set.ab : 0
    const ops = set.ab > 0 || paTot > 0 ? (obp + slg).toFixed(3) : '—'

    out[band] = {
      ops,
      avg,
      hr: set.hr,
      strike_pct: strikePct,
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
  if (b?.speedBandStats && Object.keys(b.speedBandStats).length > 0) return b.speedBandStats
  return {}
}

/** ゾーン別成績：Phase 14 派生があれば優先 */
export function loadZoneStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): ZoneStats[] {
  const b = loadPhase14PitchBundle(yahooId, year)
  if (b?.zoneStats && b.zoneStats.length > 0) return b.zoneStats
  const pas = loadPitchDetails(yahooId)
  return aggregateByZone(pas)
}

type HandBucket = 'vsRight' | 'vsLeft'

function isZoneSettlementForPitch(r: string): boolean {
  return isSettlementResult(r) || isWalkLikeResultText(r) || isHBP(r) || isSF(r)
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
    if ((pa.yahooPitcherId ?? '').trim() !== pid) continue
    if ((pa.pitchEvents?.length ?? 0) > 0) {
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
    if ((pa.yahooPitcherId ?? '').trim() !== pid) continue
    const pilot = canonicalPlateAppearanceToPilot(gameId, pa)
    if (!pilot || pilot.pitches.length === 0) continue

    const batterId = (pa.yahooBatterId ?? '').trim()
    const bat = resolveBatHandJa(batterId)
    const hands = handBucketsForZonePitcherVsBatter(bat, pitcherThrow)

    for (const p of pilot.pitches) {
      const zid = parseInt(p.zone_id, 10)
      if (zid < 1 || zid > 25) continue
      for (const h of hands) {
        pitchCount[h].set(zid, (pitchCount[h].get(zid) ?? 0) + 1)
      }
    }

    const sorted = [...pilot.pitches].sort((a, b) => (a.pitch_no ?? 0) - (b.pitch_no ?? 0))
    const finalPitch = sorted[sorted.length - 1]!
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
      } else if (isHBP(settlementResult)) {
        rec.hbp += 1
      } else if (isSF(settlementResult)) {
        rec.sf += 1
      } else if (isSettlementResult(settlementResult)) {
        rec.ab += 1
        if (isHit(settlementResult)) {
          rec.h += 1
          rec.tb += getTotalBases(settlementResult)
          if (isHomeRun(settlementResult)) rec.hr += 1
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
      const paTot = ab + bb + hbp + sf
      const obp = paTot > 0 ? (h + bb + hbp) / paTot : 0
      const slg = ab > 0 ? tb / ab : 0
      const ops = paTot > 0 ? (obp + slg).toFixed(3) : '—'
      out.push({ zoneId: z, pitches, ab, h, hr, ops, avg })
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
