/**
 * Phase 4: 投球詳細パイロット
 * Phase14 派生が無い場合のフォールバック: pitch_details.csv（batter_id 一致）
 */

import fs from 'fs'
import path from 'path'
import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from '@/lib/derived/fetchDerivedJsonServer'
import type { CanonicalGameDocument, PlateAppearance } from '@/lib/yahooGame/types'
import { plateAppearanceResolvedResultText } from '@/lib/yahooGame/canonicalBattingSeasonAgg'
import { pickResultSummaryJaFromPitchEvents } from '@/lib/yahooGame/mergePhase10FromPitchRows'
import {
  aggregatePitchTypeRateCounts,
  formatStrikePct,
  formatWhiffPct,
  formatWhiffPctPerPitch,
  strikeCountFromRateCounts,
  swingCountFromRateCounts,
} from '@/lib/yahooGame/pitchTypeRateStats'
import {
  isHbpResultJa,
  isSfResultJa,
} from '@/lib/yahooGame/paSettlementStatsFromResultJa'
import { isStrikeoutResultJa } from '@/lib/yahooGame/paOutcomeResultJa'
import { hitBases, isAtBat } from '@/lib/yahooGame/resultJaHitBases'
import { slashOps3FromCounts, slashRate3FromCounts } from '@/lib/battingRateFormat'
import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import type { ZoneStat, ZoneStatsResponse } from '@/lib/yahooGame/gamePitcherPilotFiles'
import {
  effectiveVsHandBucketForPitcherSplit,
  pitcherThrowHandRLFromYahooPitcherId,
} from '@/lib/yahooGame/batterHandFromCanonical'
import { getProjectRoot } from '@/lib/projectRoot'
import { loadCanonicalGameDocument } from '@/lib/yahooGame/loadCanonicalGame'
import { loadCanonicalGamesMergedForDerivedPipeline } from '@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline'
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
  /**
   * 打席の決着結果（Phase11 の `plateAppearanceResolvedResultText` 等）。
   * 未設定時は一球 `result` 列から §6a・§6b で要約する。
   * 球種・ゾーン・球速帯への「付与」は最終球の pitch_type / zone / speed のまま。
   */
  settlement_result?: string
}

/** 打席の AB/H/BB 等に使う決着テキスト（最終球の生 resultJa だけに依存しない） */
export function settlementResultForPa(pa: PlateAppearancePitches): string {
  const explicit = (pa.settlement_result ?? '').trim()
  if (explicit) return explicit
  if (pa.pitches.length === 0) return ''
  return (
    pickResultSummaryJaFromPitchEvents(
      pa.pitches.map((p, i) => ({
        pitchIndex: p.pitch_no ?? i + 1,
        resultJa: p.result,
      }))
    ) ??
    (pa.pitches[pa.pitches.length - 1]?.result ?? '').trim()
  )
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

  for (const pa of paMap.values()) {
    pa.pitches.sort((a, b) => (a.pitch_no ?? 0) - (b.pitch_no ?? 0))
    const settlement = settlementResultForPa(pa)
    if (settlement) pa.settlement_result = settlement
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

export type PitchTypeHandSplitStats = {
  vsRight: PitchTypeStats[]
  vsLeft: PitchTypeStats[]
}

/** 投球詳細から球種別成績を集計 */
export type AggregateByPitchTypeOptions = {
  /** Whiff% の分母。既定は swings（スイング企図）。pitches は SwStr% 参考用 */
  whiffDenominator?: 'swings' | 'pitches'
}

export function aggregateByPitchType(
  plateAppearances: PlateAppearancePitches[],
  options?: AggregateByPitchTypeOptions,
): PitchTypeStats[] {
  const whiffDenominator = options?.whiffDenominator ?? 'swings'
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
    const settlement = settlementResultForPa(pa)
    const t = last.pitch_type || '不明'
    if (!settlementByType.has(t)) settlementByType.set(t, { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 })
    const rec = settlementByType.get(t)!
    if (isAtBat(settlement)) {
      rec.ab += 1
      const bases = hitBases(settlement)
      if (bases > 0) {
        rec.h += 1
        rec.tb += bases
        if (bases === 4) rec.hr += 1
      }
    }
    if (isStrikeoutResultJa(settlement)) rec.so += 1
    if (isWalkLikeResultText(settlement)) rec.bb += 1
    if (isHbpResultJa(settlement)) rec.hbp += 1
    if (isSfResultJa(settlement)) rec.sf += 1
  }

  const result: PitchTypeStats[] = []
  for (const [pitchType, pitches] of byType.entries()) {
    const rateCounts = aggregatePitchTypeRateCounts(pitches.map((p) => p.result))
    const { balls, swingMiss, taken, foul } = rateCounts
    const set = settlementByType.get(pitchType) || { ab: 0, h: 0, hr: 0, tb: 0, so: 0, bb: 0, hbp: 0, sf: 0 }
    const strikes = strikeCountFromRateCounts(rateCounts)
    const swings = swingCountFromRateCounts(rateCounts)

    const speeds = pitches.map((p) => parseInt(p.speed_kmh, 10)).filter((n) => !isNaN(n))
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null

    const strikePct = formatStrikePct(strikes, pitches.length)
    const whiffPct =
      whiffDenominator === 'pitches'
        ? formatWhiffPctPerPitch(swingMiss, pitches.length)
        : formatWhiffPct(swingMiss, swings)

    const avg = set.ab > 0 ? slashRate3FromCounts(set.h, set.ab) : '—'
    const pa = set.ab + set.bb + set.hbp + set.sf
    const ops =
      set.ab > 0 || pa > 0
        ? slashOps3FromCounts({
            h: set.h,
            ab: set.ab,
            tb: set.tb,
            bb: set.bb,
            hbp: set.hbp,
            sf: set.sf,
          })
        : '—'

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

function pitcherThrowHandForPlateAppearance(pa: PlateAppearancePitches): "R" | "L" | "" {
  for (let i = pa.pitches.length - 1; i >= 0; i--) {
    const pid = (pa.pitches[i]?.pitcher_id ?? "").trim()
    if (!pid) continue
    const hand = pitcherThrowHandRLFromYahooPitcherId(pid)
    if (hand === "R" || hand === "L") return hand
  }
  return ""
}

export function aggregateByPitchTypePitcherHand(
  plateAppearances: PlateAppearancePitches[],
  options?: AggregateByPitchTypeOptions,
): PitchTypeHandSplitStats {
  const vsRightPas: PlateAppearancePitches[] = []
  const vsLeftPas: PlateAppearancePitches[] = []

  for (const pa of plateAppearances) {
    const hand = pitcherThrowHandForPlateAppearance(pa)
    if (hand === "R") vsRightPas.push(pa)
    else if (hand === "L") vsLeftPas.push(pa)
  }

  return {
    vsRight: aggregateByPitchType(vsRightPas, options),
    vsLeft: aggregateByPitchType(vsLeftPas, options),
  }
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

/** 決着球でゾーンに何か記録されるか（AB/BB/HBP/SF）— Phase11 と同じ isAtBat */
function isZoneSettlement(r: string): boolean {
  return isAtBat(r) || isWalkLikeResultText(r) || isHbpResultJa(r) || isSfResultJa(r)
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
      const settlement = settlementResultForPa(pa)
      const zid = parseInt(last.zone_id, 10)
      if (zid >= 1 && zid <= 25 && isZoneSettlement(settlement)) {
        if (!byZone.has(zid)) {
          byZone.set(zid, { ab: 0, h: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0 })
        }
        const rec = byZone.get(zid)!
        if (isWalkLikeResultText(settlement)) {
          rec.bb += 1
        } else if (isHbpResultJa(settlement)) {
          rec.hbp += 1
        } else if (isSfResultJa(settlement)) {
          rec.sf += 1
        } else if (isAtBat(settlement)) {
          rec.ab += 1
          const bases = hitBases(settlement)
          if (bases > 0) {
            rec.h += 1
            rec.tb += bases
            if (bases === 4) rec.hr += 1
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
  source?: { canonicalGames?: string[] }
  pitchTypeStats?: PitchTypeStats[]
  pitchTypeHandSplit?: PitchTypeHandSplitStats
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
  return readDerivedJsonLocalSync<Phase14PitchFile>(
    'player_pitch_from_canonical',
    year,
    `yahoo_${yahooId}.json`
  )
}

export async function loadPhase14PitchBundleAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<Phase14PitchFile | null> {
  return fetchDerivedJsonServer<Phase14PitchFile>(
    'player_pitch_from_canonical',
    year,
    `yahoo_${yahooId}.json`
  )
}

/**
 * canonical の pitchTypeJa を球種別打撃表の行ラベルに揃える。
 * Yahoo 個人ページの球種別表に合わせ、ツーシーム・ワンシームはストレートへ潰さない。
 * 4 シーム系（ストレート／直球／フォーシーム等）のみ「ストレート」に統合する。
 */
export function normalizePitchTypeFromCanonical(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return '不明'
  if (/ツーシーム|2シーム|二シーム|２シーム/.test(s)) {
    if (/ツーシーム/.test(s)) return 'ツーシーム'
    if (/２シーム/.test(s)) return '２シーム'
    if (/2シーム/.test(s)) return '2シーム'
    return '二シーム'
  }
  if (/ワンシーム/.test(s)) return 'ワンシーム'
  if (/カット|スライダ|チェンジ|カーブ|フォーク|スプリット|縦カット|スラッ|ナックル/.test(s)) return s
  if (/ストレート|直球|フォーシーム|ファースト|速球/.test(s)) return 'ストレート'
  return s
}

export function canonicalPlateAppearanceToPilot(
  gameId: string,
  pa: PlateAppearance,
  options?: { settlementResult?: string }
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
  const settlement =
    (options?.settlementResult ?? '').trim() ||
    (pa.resultSummaryJa ?? '').trim() ||
    pickResultSummaryJaFromPitchEvents(pe) ||
    ''

  return {
    game_id: gameId,
    inning: 0,
    top_bottom: '',
    bat_order: 0,
    pitches,
    settlement_result: settlement || undefined,
  }
}

/**
 * 球速帯集計の「ストレート」＝正規化後の 4 シーム行のみ（ツーシーム・ワンシームは含めない）。
 */
export function isStraightPitchKind(pitchType: string): boolean {
  return (pitchType || '').trim() === 'ストレート'
}

export function aggregateSpeedBandsStraightOnly(
  plateAppearances: PlateAppearancePitches[]
): SpeedBandStatsMap {
  const byBand = new Map<string, PitchDetailRow[]>()
  for (const pa of plateAppearances) {
    for (const p of pa.pitches) {
      if (!isStraightPitchKind(p.pitch_type)) continue
      const kmh = parseInt(p.speed_kmh, 10)
      const band = kmhToStraightBandKey(kmh) ?? 'unknown'
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
    const settlement = settlementResultForPa(pa)
    const kmh = parseInt(last.speed_kmh, 10)
    const band = kmhToStraightBandKey(kmh) ?? 'unknown'
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
    if (isAtBat(settlement)) {
      rec.ab += 1
      const tbAdd = hitBases(settlement)
      if (tbAdd > 0) {
        rec.h += 1
        rec.tb += tbAdd
        if (tbAdd === 4) rec.hr += 1
        if (tbAdd === 2) rec.h2 += 1
      }
    }
    if (isStrikeoutResultJa(settlement)) rec.so += 1
    if (isWalkLikeResultText(settlement)) rec.bb += 1
    if (isHbpResultJa(settlement)) rec.hbp += 1
    if (isSfResultJa(settlement)) rec.sf += 1
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

    const rateCounts = aggregatePitchTypeRateCounts(pitches.map((p) => p.result))
    const whiffPct = formatWhiffPct(
      rateCounts.swingMiss,
      swingCountFromRateCounts(rateCounts),
    )
    const avg = set.ab > 0 ? slashRate3FromCounts(set.h, set.ab) : '—'
    const isop =
      set.ab > 0 ? slashRate3FromCounts(Math.max(0, set.tb - set.h), set.ab) : '—'
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

/** canonical から打者の打席×投球ブロックを構築（Phase14・API フォールバック共通） */
export function loadPlateAppearancePitchesForYahooBatter(
  yahooBatterId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT,
  options?: { gameIds?: string[] }
): PlateAppearancePitches[] {
  const bid = yahooBatterId.trim()
  if (!bid) return []

  const root = getProjectRoot()
  const docs =
    options?.gameIds?.length ?
      options.gameIds
        .map((gameId) => loadCanonicalGameDocument(root, gameId))
        .filter((d): d is CanonicalGameDocument => d != null)
    : loadCanonicalGamesMergedForDerivedPipeline(root)

  const pas: PlateAppearancePitches[] = []
  for (const doc of docs) {
    const gameId = doc.gameId
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? '').trim() !== bid) continue
      const resolved = plateAppearanceResolvedResultText(doc, pa).trim()
      const settlement =
        resolved ||
        pickResultSummaryJaFromPitchEvents(pa.pitchEvents) ||
        (pa.resultSummaryJa ?? '').trim() ||
        ''
      const block = canonicalPlateAppearanceToPilot(gameId, pa, {
        settlementResult: settlement || undefined,
      })
      if (block) pas.push(block)
    }
  }
  return pas
}

function normalizeSpeedBandStatsMap(raw: SpeedBandStatsMap): SpeedBandStatsMap {
  const out: SpeedBandStatsMap = {}
  for (const [band, row] of Object.entries(raw)) {
    const nk = resolveStraightSpeedBandKey(band)
    if (!nk) continue
    const r = row as Partial<SpeedBandStatsRow>
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

export function loadPitchTypeStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): PitchTypeStats[] {
  const b = loadPhase14PitchBundle(yahooId, year)
  if (b?.pitchTypeStats && b.pitchTypeStats.length > 0) return b.pitchTypeStats
  const pas = loadPitchDetails(yahooId)
  return aggregateByPitchType(pas)
}

export async function loadPitchTypeStatsAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<PitchTypeStats[]> {
  const b = await loadPhase14PitchBundleAsync(yahooId, year)
  if (b?.pitchTypeStats && b.pitchTypeStats.length > 0) return b.pitchTypeStats
  const pas = loadPitchDetails(yahooId)
  return aggregateByPitchType(pas)
}

function resolvePitchTypeHandSplitForBatter(
  yahooId: string,
  year: string,
  bundle: Phase14PitchFile | null,
): PitchTypeHandSplitStats {
  if (bundle?.pitchTypeHandSplit) {
    const vsRight = Array.isArray(bundle.pitchTypeHandSplit.vsRight)
      ? bundle.pitchTypeHandSplit.vsRight
      : []
    const vsLeft = Array.isArray(bundle.pitchTypeHandSplit.vsLeft)
      ? bundle.pitchTypeHandSplit.vsLeft
      : []
    if (vsRight.length > 0 || vsLeft.length > 0) {
      return { vsRight, vsLeft }
    }
  }
  const gameIds = bundle?.source?.canonicalGames
  const pas =
    Array.isArray(gameIds) && gameIds.length > 0
      ? loadPlateAppearancePitchesForYahooBatter(yahooId, year, { gameIds })
      : loadPitchDetails(yahooId)
  if (pas.length === 0) {
    return { vsRight: [], vsLeft: [] }
  }
  return aggregateByPitchTypePitcherHand(pas)
}

export function loadPitchTypeHandSplitStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT,
): PitchTypeHandSplitStats {
  const b = loadPhase14PitchBundle(yahooId, year)
  return resolvePitchTypeHandSplitForBatter(yahooId, year, b)
}

export async function loadPitchTypeHandSplitStatsAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT,
): Promise<PitchTypeHandSplitStats> {
  const b = await loadPhase14PitchBundleAsync(yahooId, year)
  return resolvePitchTypeHandSplitForBatter(yahooId, year, b)
}

function resolveSpeedBandStatsForBatter(
  yahooId: string,
  year: string,
  bundle: Phase14PitchFile | null
): SpeedBandStatsMap {
  const raw = bundle?.speedBandStats
  if (raw && Object.keys(raw).length > 0) {
    return normalizeSpeedBandStatsMap(raw)
  }
  const gameIds = bundle?.source?.canonicalGames
  const pas = loadPlateAppearancePitchesForYahooBatter(yahooId, year, {
    gameIds: Array.isArray(gameIds) ? gameIds : undefined,
  })
  if (pas.length === 0) return {}
  return aggregateSpeedBandsStraightOnly(pas)
}

export function loadSpeedBandStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): SpeedBandStatsMap {
  const b = loadPhase14PitchBundle(yahooId, year)
  return resolveSpeedBandStatsForBatter(yahooId, year, b)
}

export async function loadSpeedBandStatsAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<SpeedBandStatsMap> {
  const b = await loadPhase14PitchBundleAsync(yahooId, year)
  return resolveSpeedBandStatsForBatter(yahooId, year, b)
}

function zoneStatsFromPhase14Bundle(b: Phase14PitchFile | null): ZoneStats[] {
  if (b?.zoneStats && b.zoneStats.length > 0) {
    return b.zoneStats
      .map(migrateLegacyZoneStatsRow)
      .filter((x): x is ZoneStats => x != null)
  }
  return []
}

/** ゾーン別成績：Phase 14 派生があれば優先 */
export function loadZoneStats(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): ZoneStats[] {
  const fromBundle = zoneStatsFromPhase14Bundle(loadPhase14PitchBundle(yahooId, year))
  if (fromBundle.length > 0) return fromBundle
  const pas = loadPitchDetails(yahooId)
  return aggregateByZone(pas)
}

export async function loadZoneStatsAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<ZoneStats[]> {
  const fromBundle = zoneStatsFromPhase14Bundle(await loadPhase14PitchBundleAsync(yahooId, year))
  if (fromBundle.length > 0) return fromBundle
  const pas = loadPitchDetails(yahooId)
  return aggregateByZone(pas)
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


type HandBucket = 'vsRight' | 'vsLeft'

function isZoneSettlementForPitch(r: string): boolean {
  return isAtBat(r) || isWalkLikeResultText(r) || isHbpResultJa(r) || isSfResultJa(r)
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
  resolveBatHandJa: (batterId: string) => '左' | '右' | '両' | '',
  options?: { doc?: CanonicalGameDocument }
): ZoneStatsResponse | null {
  const pid = yahooPitcherId.trim()
  if (!pid) return null
  const pitcherThrow = pitcherThrowHandRLFromYahooPitcherId(pid)

  let sawPitch = false
  const settlementForPa = (pa: PlateAppearance): string | undefined => {
    const doc = options?.doc
    if (!doc) return undefined
    const resolved = plateAppearanceResolvedResultText(doc, pa).trim()
    return (
      resolved ||
      pickResultSummaryJaFromPitchEvents(pa.pitchEvents) ||
      (pa.resultSummaryJa ?? '').trim() ||
      undefined
    )
  }

  for (const pa of plateAppearances) {
    const pilotProbe = canonicalPlateAppearanceToPilot(gameId, pa, {
      settlementResult: settlementForPa(pa),
    })
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
    const pilot = canonicalPlateAppearanceToPilot(gameId, pa, {
      settlementResult: settlementForPa(pa),
    })
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
    /** 決着の結果は打席要約（出場成績 zip 優先）。ゾーンだけ最終球のマスを借りる */
    const settlementResult = settlementResultForPa(pilot)

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
      } else if (isAtBat(settlementResult)) {
        rec.ab += 1
        const bases = hitBases(settlementResult)
        if (bases > 0) {
          rec.h += 1
          rec.tb += bases
          if (bases === 4) rec.hr += 1
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
