/**
 * Phase 4: パイロット今季成績
 * Yahoo games pilot (2026/3/4 オープン戦5試合) の batting_stats.csv から選手別スプリット成績を取得
 */

import fs from 'fs'
import path from 'path'
import {
  PILOT_FABIAN_NPB_PLAYER_ID,
  PILOT_FABIAN_YAHOO_BATTER_ID,
  PILOT_KIKUCHI_NPB_PLAYER_ID,
  PILOT_KIKUCHI_YAHOO_BATTER_ID,
} from '@/lib/pilotPlayerConstants'
import { createFielderPlaceholderTotalRow } from '@/lib/fielderSeasonPlaceholderRow'
import { findRosterPlayerByPublicId, getPlayerHandedness } from '@/lib/npbRoster'
import { invalidateYahooNpbBatterMapsCache, resolveYahooPilotIdForStats } from '@/lib/yahooNpbBatterIdMap'
import { formatWeekRangeTueToSunFromTuesdayYmd } from '@/lib/yahooGame/jstPeriodKeys'
import {
  aggregateBattingSeasonByYahooBatterFromBattingLines,
  buildEnrichedBattingSeasonRow,
  computeBattingTargetForGameAndBatter,
  emptyBattingSeasonAggYahoo,
  plateAppearanceLastResultText,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
  type BattingTargetForGameAndBatter,
} from '@/lib/yahooGame/canonicalBattingSeasonAgg'
import { loadCanonicalGames } from '@/lib/yahooGame/loadCanonicalGames'
import type { CanonicalGameDocument, PlateAppearance } from '@/lib/yahooGame/types'
import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import { isStrikeoutResultJa } from '@/lib/yahooGame/paOutcomeResultJa'
import { hitBases, isAtBat } from '@/lib/yahooGame/resultJaHitBases'
import { pitcherThrowHandRLFromYahooPitcherIdWithMentioned } from '@/lib/yahooGame/batterHandFromCanonical'
import { yahooPitcherIdForVsHandFromPa } from '@/lib/yahooGame/yahooPitcherIdForVsHandFromPa'
import { mergePhase10IntoCanonical, type Phase10PitchRow } from '@/lib/yahooGame/mergePhase10FromPitchRows'
import { getProjectRoot } from '@/lib/projectRoot'
import type { BattingVsHandTotalReconciliation, PilotBlocksData, SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
import {
  computeBattingVsHandTotalReconciliation,
  DERIVED_SEASON_YEAR_DEFAULT,
  enrichSeasonStatsRowSabermetrics,
} from '@/lib/seasonStatsPilotShared'

/** クライアントは `@/lib/seasonStatsPilotShared` を参照（fs を引き込まない） */
export type { BattingVsHandTotalReconciliation, PilotBlocksData, SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
export {
  computeBattingVsHandTotalReconciliation,
  DERIVED_SEASON_YEAR_DEFAULT,
  enrichSeasonStatsRowSabermetrics,
  mergeSeasonStatsRows,
} from '@/lib/seasonStatsPilotShared'

/** パイロット対象選手の Yahoo ID (菊池涼介: 広島) — 個人ページの問い合わせ ID と同一 */
export const PILOT_PLAYER_YAHOO_ID = PILOT_KIKUCHI_YAHOO_BATTER_ID

const PILOT_PLAYER_NPB_ID = PILOT_KIKUCHI_NPB_PLAYER_ID

/** 選手名・ID → Yahoo ID マッピング（パイロットテスト用） */
const NAME_TO_YAHOO_ID: Record<string, string> = {
  '菊池涼介': PILOT_PLAYER_YAHOO_ID,
  '菊池 涼介': PILOT_PLAYER_YAHOO_ID,
  '菊池　涼介': PILOT_PLAYER_YAHOO_ID,
  'Kikuchi Ryosuke': PILOT_PLAYER_YAHOO_ID,
  'KikuchiRyosuke': PILOT_PLAYER_YAHOO_ID,
  [PILOT_PLAYER_NPB_ID]: PILOT_PLAYER_YAHOO_ID,
  ファビアン: PILOT_FABIAN_YAHOO_BATTER_ID,
  'Ｓ．ファビアン': PILOT_FABIAN_YAHOO_BATTER_ID,
  [PILOT_FABIAN_NPB_PLAYER_ID]: PILOT_FABIAN_YAHOO_BATTER_ID,
  [PILOT_FABIAN_YAHOO_BATTER_ID]: PILOT_FABIAN_YAHOO_BATTER_ID,
}

function normalizeName(name: string): string {
  return (name || '').replace(/\s/g, '').replace(/　/g, '')
}

export function getYahooIdForPilot(playerIdOrName: string): string | null {
  if (!playerIdOrName) return null
  const trimmed = String(playerIdOrName).trim()
  if (trimmed === PILOT_PLAYER_YAHOO_ID) return PILOT_PLAYER_YAHOO_ID
  if (trimmed === PILOT_PLAYER_NPB_ID) return PILOT_PLAYER_YAHOO_ID
  const norm = normalizeName(trimmed)
  if (norm === '菊池涼介') return PILOT_PLAYER_YAHOO_ID
  if (norm === 'KikuchiRyosuke') return PILOT_PLAYER_YAHOO_ID
  if (norm === 'ファビアン' || norm === 'Ｓ．ファビアン') return PILOT_FABIAN_YAHOO_BATTER_ID
  for (const [name, id] of Object.entries(NAME_TO_YAHOO_ID)) {
    if (normalizeName(name) === norm) return id
  }
  const fromBridge = resolveYahooPilotIdForStats(trimmed)
  if (fromBridge) return fromBridge

  // 数値以外の URL（日本語名・英字名など）→ 名簿で NPB ID に落とし、橋渡し CSV で Yahoo に変換
  // （resolveYahooPilotIdForStats は数字のみのため、上記だけでは日本語パスが解決できなかった）
  const rosterPlayer = findRosterPlayerByPublicId(trimmed)
  if (rosterPlayer?.npb_player_id) {
    const y = resolveYahooPilotIdForStats(rosterPlayer.npb_player_id)
    if (y) return y
  }
  return null
}

function formatSplitLabel(splitType: string, splitValue: string): string {
  if (splitType === 'total') return '通算'
  if (splitType === 'day_night') return splitValue === 'day' ? 'デーゲーム' : 'ナイター'
  if (splitType === 'home_away') return splitValue === 'home' ? 'ホーム' : 'ビジター'
  if (splitType === 'vs_team') return splitValue.replace(/^vs_/, '')
  if (splitType === 'bat_order') {
    const n = splitValue.replace('bat_order_', '')
    return /^[1-9]$/.test(n) ? `${n}番` : `打順${n}`
  }
  if (splitType === 'stadium') return splitValue
  if (splitType === 'vs_hand') {
    if (splitValue === 'R') return '対右投手'
    if (splitValue === 'L') return '対左投手'
    return '対不明'
  }
  if (splitType === 'pa_round') {
    if (splitValue === '1') return '1巡目'
    if (splitValue === '2') return '2巡目'
    if (splitValue === '3') return '3巡目'
    if (splitValue === '4') return '4巡目'
    if (splitValue === '5') return '5巡目以上'
  }
  if (splitType === 'base_sit') {
    const m: Record<string, string> = {
      none: '無し',
      r1: '1塁',
      r2: '2塁',
      r3: '3塁',
      r12: '1・2塁',
      r13: '1・3塁',
      r23: '2・3塁',
      loaded: '満塁',
      risp: '得点圏',
      no_risp: '非得点圏',
    }
    return m[splitValue] ?? splitValue
  }
  if (splitType === 'calendar_month') {
    const m = splitValue.match(/^(\d{4})-(\d{2})$/)
    if (m) return `${parseInt(m[2], 10)}月`
  }
  if (splitType === 'calendar_week') {
    return formatWeekRangeTueToSunFromTuesdayYmd(splitValue)
  }
  return splitValue
}

function normalizeDerivedRowLabels(row: SeasonStatsRow): SeasonStatsRow {
  if (row.split_type === 'calendar_month') {
    try {
      return {
        ...row,
        split_label: formatSplitLabel('calendar_month', row.split_value),
      }
    } catch {
      return row
    }
  }
  const label = (row.split_label || '').trim()
  if (label) return row
  try {
    return {
      ...row,
      split_label: formatSplitLabel(row.split_type, row.split_value),
    }
  } catch {
    return row
  }
}

/** 対左右: canonical と同一の `updateBattingAggFromPa`。結果が空の打席は数えない（plateAppearanceLastResultText 強化で空を減らす）。 */
function updateVsHandFromPa(agg: BattingSeasonAggYahoo, gameId: string, pa: PlateAppearance): void {
  if (!plateAppearanceLastResultText(pa)) return
  updateBattingAggFromPa(agg, gameId, pa)
}

function aggToVsHandRow(splitValue: 'R' | 'L' | 'unknown', agg: BattingSeasonAggYahoo): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? (agg.h + agg.bb + agg.hbp) / obpDen : null
  const slg = agg.ab > 0 ? agg.tb / agg.ab : null
  const ops = obp != null ? obp + (agg.ab > 0 ? agg.tb / agg.ab : 0) : null
  return {
    split_type: 'vs_hand',
    split_value: splitValue,
    split_label: formatSplitLabel('vs_hand', splitValue),
    g: agg.gameIds.size,
    pa: agg.pa,
    ab: agg.ab,
    r: agg.r,
    h: agg.h,
    h1,
    h2: agg.h2,
    h3: agg.h3,
    hr: agg.hr,
    tb: agg.tb,
    rbi: agg.rbi,
    so: agg.so,
    bb: agg.bb,
    ibb: agg.ibb,
    hbp: agg.hbp,
    sh: agg.sh,
    sf: agg.sf,
    sb: agg.sb,
    cs: agg.cs,
    e: agg.e,
    gidp: agg.gidp,
    avg: fmtSlash3(avg),
    obp: fmtSlash3(obp),
    slg: fmtSlash3(slg),
    ops: fmtSlash3(ops),
    risp_avg: '.000',
    risp_ab: 0,
    risp_h: 0,
    sb_pct: '',
    isop: '.000',
    isod: '.000',
    babip: '.000',
    bb_pct: '.000',
    k_pct: '.000',
    bbk: '',
    gpa: '.000',
    rc: '.0',
    xr: '.0',
    seca: '.000',
    ta: '.000',
    noi: '.000',
  }
}

/** 個人ページの loadVsHand / phase15 と共通。phase10 derived があれば canonical にマージする。 */
export function mergePhase10RestoredIntoDocIfPresent(doc: CanonicalGameDocument): CanonicalGameDocument {
  const gameId = String(doc.gameId ?? '').trim()
  if (!/^\d+$/.test(gameId)) return doc
  if (doc.game?.pitchByPitchNote?.status === 'restored_phase10') return doc
  const phase10Path = path.join(
    getProjectRoot(),
    '_data',
    'scraped_games',
    'derived',
    `${gameId}_phase10_restored.json`,
  )
  if (!fs.existsSync(phase10Path)) return doc
  try {
    const raw = JSON.parse(fs.readFileSync(phase10Path, 'utf-8')) as {
      pitchRows?: Phase10PitchRow[]
      missingOrPartial?: string[]
    }
    const rows = Array.isArray(raw.pitchRows) ? raw.pitchRows : []
    const missing = Array.isArray(raw.missingOrPartial) ? raw.missingOrPartial : []
    if (rows.length === 0) return doc
    return mergePhase10IntoCanonical(doc, rows, missing)
  } catch {
    return doc
  }
}

/**
 * paId を `${gameId}-${回}-${表|裏}-${番号}` とみなせる打席について、番号を数値正規化したキーで重複を1件にまとめる。
 * canonical の打席と実況フォールバックで別 paId が立つと対左右の PA だけ膨らむため（loadVsHand 内コメント参照）。
 */
export function dedupePlateAppearancesByInningHalfOrder(
  pas: PlateAppearance[],
  gameId: string | undefined,
): PlateAppearance[] {
  const gid = String(gameId ?? '').trim()
  if (!gid || pas.length < 2) return pas

  const canonicalKey = (pa: PlateAppearance): string => {
    const id = String(pa.paId ?? '').trim()
    if (!id.startsWith(`${gid}-`)) return id
    const tail = id.slice(gid.length + 1)
    const parts = tail.split('-')
    if (parts.length < 3) return id
    const inn = parts[0]!
    const half = parts[1]!
    const orderStr = parts.slice(2).join('-')
    const ord = parseInt(orderStr, 10)
    if (!Number.isFinite(ord)) return id
    return `${gid}-${inn}-${half}-${ord}`
  }

  const richness = (pa: PlateAppearance): number => {
    const pe = Array.isArray(pa.pitchEvents) ? pa.pitchEvents.length : 0
    const r = String(pa.resultSummaryJa ?? '').trim().length
    return pe * 1000 + r
  }

  const best = new Map<string, PlateAppearance>()
  for (const pa of pas) {
    const k = canonicalKey(pa)
    const cur = best.get(k)
    if (!cur) {
      best.set(k, pa)
      continue
    }
    const ra = richness(pa)
    const rb = richness(cur)
    if (ra > rb) best.set(k, pa)
    else if (ra === rb && String(pa.paId ?? '').length < String(cur.paId ?? '').length) best.set(k, pa)
  }

  const sortParts = (k: string): [string, number, number, number] | null => {
    const p = k.split('-')
    if (p.length < 4) return null
    const ord = parseInt(p[p.length - 1]!, 10)
    const half = p[p.length - 2]!
    const inn = parseInt(p[p.length - 3]!, 10)
    const g = p.slice(0, -3).join('-')
    if (!Number.isFinite(ord) || !Number.isFinite(inn)) return null
    const ho = half === '表' ? 0 : half === '裏' ? 1 : 2
    return [g, inn, ho, ord]
  }

  const out = [...best.values()]
  out.sort((a, b) => {
    const ka = canonicalKey(a)
    const kb = canonicalKey(b)
    const pa = sortParts(ka)
    const pb = sortParts(kb)
    if (pa && pb) {
      for (let i = 0; i < 4; i++) {
        const c = pa[i]! < pb[i]! ? -1 : pa[i]! > pb[i]! ? 1 : 0
        if (c !== 0) return c
      }
      return 0
    }
    const c = ka.localeCompare(kb, 'ja')
    if (c !== 0) return c
    return String(a.paId ?? '').localeCompare(String(b.paId ?? ''), 'ja')
  })
  return out
}

/** `collectVsUnknownAbSamples` 用: 対不明に入った打数（isAtBat）の打席サンプル */
export type VsUnknownAbSample = {
  gameId: string
  paId: string
  /** 投手 ID 欠損のときは空文字 */
  yahooPitcherId: string
  reason: 'missing_pitcher_id' | 'pitcher_throw_hand_unknown'
  resultSummary: string
}

export type LoadVsHandFromCanonicalOptions = {
  /** phase15 等: 既に読んだ canonical を渡すとディスク再読込を省略 */
  preloadedCanonicalDocs?: CanonicalGameDocument[]
  /** gameId -> mergePhase10 済み doc（全打者ループで毎回マージしない） */
  mergedDocsByGameId?: Map<string, CanonicalGameDocument>
  /** true のとき、対不明に入った打数（isAtBat=true）の打席を最大40件まで収集（調査用） */
  collectVsUnknownAbSamples?: boolean
  /** 指定した gameId の打席だけ、vs_hand 判定を打席単位で収集（調査用） */
  collectPaDumpForGameId?: string
}

export type VsHandPaDumpRow = {
  gameId: string
  paId: string
  inningHalf: string
  vsHand: 'R' | 'L' | 'unknown'
  yahooPitcherId: string
  pitcherThrowHand: 'R' | 'L' | ''
  resultText: string
  isAtBat: boolean
  hitBases: number
}

/**
 * Phase 25/26: 通算（Phase 11）と R/L/unknown 合計の P0 不一致を、試合単位の Δ で
 * 不明バケツに寄せた結果のサマリ。`negativeDeltaSamples` は調査用（先頭最大 20 件）。
 */
export type VsHandReconciliationDebug = {
  /** 通算合計と R+L+unknown が乖離していて、Δ を不明バケツに寄せた試合数 */
  backfilledGames: number
  /** R+L+unknown が通算合計を超えている（=PA 経路で重複の疑い）試合数 */
  negativeDeltaGames: number
  /** Δ の各成分の合計（不明バケツに加算した量） */
  appliedDelta: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
  /** 負の Δ（重複疑い）の合計（参考） */
  negativeDelta: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
  /** Phase 26: 負の Δ を当該試合の不明バケツから差し引いた量の合計 */
  negativeAppliedDelta: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
  /** Phase 26: 負の Δ を不明バケツから差し引きしきれなかった残量（>0 のとき R/L 側に超過分が残ることがある） */
  negativeUnabsorbedDelta: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
  negativeDeltaSamples: Array<{
    gameId: string
    delta: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
  }>
  /**
   * Phase 27: 負の H/HR Δ を試合バケツから吸収した量。
   * - PA 経路の安打/本塁打が battingLines を超える試合で R/L/U から減算した量を記録する。
   * - HR を 1 引くと H-1 / TB-4、単打側を 1 引くと TB-1 を連動させる（aggToVsHandRow の H1/SLG 整合）。
   */
  negativeHrApplied: number
  negativeHApplied: number
  /**
   * Phase 27: 正の H/HR Δ を不明バケツに加算した量。
   * - HR を 1 加えると H+1 / TB+4、残りの H は単打仮定で TB+1。
   */
  positiveHrApplied: number
  positiveHApplied: number
}

type P0Counts = { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
function emptyP0(): P0Counts {
  return { pa: 0, ab: 0, bb: 0, hbp: 0, sh: 0, sf: 0 }
}
function p0FromAgg(a: BattingSeasonAggYahoo): P0Counts {
  return { pa: a.pa, ab: a.ab, bb: a.bb, hbp: a.hbp, sh: a.sh, sf: a.sf }
}
function p0Add(x: P0Counts, y: P0Counts): P0Counts {
  return { pa: x.pa + y.pa, ab: x.ab + y.ab, bb: x.bb + y.bb, hbp: x.hbp + y.hbp, sh: x.sh + y.sh, sf: x.sf + y.sf }
}
function p0FromTarget(t: BattingTargetForGameAndBatter): P0Counts {
  return { pa: t.pa, ab: t.ab, bb: t.bb, hbp: t.hbp, sh: t.sh, sf: t.sf }
}
function p0Delta(target: P0Counts, current: P0Counts): P0Counts {
  return {
    pa: target.pa - current.pa,
    ab: target.ab - current.ab,
    bb: target.bb - current.bb,
    hbp: target.hbp - current.hbp,
    sh: target.sh - current.sh,
    sf: target.sf - current.sf,
  }
}
function p0HasPositive(d: P0Counts): boolean {
  return d.pa > 0 || d.ab > 0 || d.bb > 0 || d.hbp > 0 || d.sh > 0 || d.sf > 0
}
function p0HasNegative(d: P0Counts): boolean {
  return d.pa < 0 || d.ab < 0 || d.bb < 0 || d.hbp < 0 || d.sh < 0 || d.sf < 0
}
/** Δ の正成分のみを不明バケツに加算する。負成分は触らない（取りこぼし”だけ”補完）。 */
function applyPositiveP0DeltaToAggUnknown(
  agg: BattingSeasonAggYahoo,
  delta: P0Counts,
  gameId: string,
): P0Counts {
  const pos: P0Counts = {
    pa: Math.max(0, delta.pa),
    ab: Math.max(0, delta.ab),
    bb: Math.max(0, delta.bb),
    hbp: Math.max(0, delta.hbp),
    sh: Math.max(0, delta.sh),
    sf: Math.max(0, delta.sf),
  }
  if (pos.pa === 0 && pos.ab === 0 && pos.bb === 0 && pos.hbp === 0 && pos.sh === 0 && pos.sf === 0) return pos
  agg.gameIds.add(gameId)
  agg.pa += pos.pa
  agg.ab += pos.ab
  agg.bb += pos.bb
  agg.hbp += pos.hbp
  agg.sh += pos.sh
  agg.sf += pos.sf
  return pos
}

/**
 * Phase 27: 正の H/HR Δ（=PA 経路で安打を battingLines より少なく判定）を不明バケツに加算する。
 *
 * - HR を 1 加える: agg.hr+=1, agg.h+=1, agg.tb+=4。
 * - 残った H 加算分は単打として agg.h+=1, agg.tb+=1（phase11 の集計は h2/h3 内訳を持たないため、TB は単打仮定で +1）。
 */
function applyPositiveHGapToAggUnknown(
  agg: BattingSeasonAggYahoo,
  /** target - current。`h` / `hr` どちらかが正のとき加算対象。 */
  delta: { h: number; hr: number },
): { h: number; hr: number } {
  const applied = { h: 0, hr: 0 }
  const addHr = delta.hr > 0 ? delta.hr : 0
  if (addHr > 0) {
    agg.hr += addHr
    agg.h += addHr
    agg.tb += 4 * addHr
    applied.hr += addHr
    applied.h += addHr
  }
  // 残りの H 取りこぼしを単打として加算（HR 増分は H 増分にも含まれているため、それを差し引く）。
  const addH = (delta.h > 0 ? delta.h : 0) - applied.h
  if (addH > 0) {
    agg.h += addH
    agg.tb += addH
    applied.h += addH
  }
  return applied
}
function p0NegativeOnly(d: P0Counts): P0Counts {
  return {
    pa: Math.min(0, d.pa),
    ab: Math.min(0, d.ab),
    bb: Math.min(0, d.bb),
    hbp: Math.min(0, d.hbp),
    sh: Math.min(0, d.sh),
    sf: Math.min(0, d.sf),
  }
}
/**
 * Phase 26: 負の Δ（=PA 経路で過剰計上）の分を、当該試合のバケツから差し引く。
 *
 * - 個別の H/HR は触らない（誤って実カウントを削るのを避けるため、P0 系列のみ）。
 * - 不明バケツ（gameU）→ 多い方の左右バケツ（gameR か gameL）→ もう片方の順で吸収する。
 *   R/L から削るのは "対右/対左の１打席を消す" ことになるが、
 *   battingLines が知らない過剰打席を残すよりは合計整合性を優先する。
 *   どの打席を消すか個別追跡はせず、集計値のみを引く。
 * - 在庫が足りず吸収しきれなかった残量は呼び出し元で記録する。
 *
 * 戻り値: 実際に減算できた量（aggR/aggL/aggU から引いた合計）。
 */
function applyNegativeP0DeltaFromGameBuckets(
  aggR: BattingSeasonAggYahoo,
  aggL: BattingSeasonAggYahoo,
  aggU: BattingSeasonAggYahoo,
  gameR: P0Counts,
  gameL: P0Counts,
  gameU: P0Counts,
  delta: P0Counts,
): P0Counts {
  const applied: P0Counts = emptyP0()
  const fields: Array<keyof P0Counts> = ["pa", "ab", "bb", "hbp", "sh", "sf"]
  // 多い方の R/L から先に削るために、列ごとの「優先順」を決める
  for (const k of fields) {
    if (delta[k] >= 0) continue
    let need = -delta[k]
    if (need <= 0) continue

    const order: Array<{ agg: BattingSeasonAggYahoo; game: P0Counts }> = [
      { agg: aggU, game: gameU },
    ]
    if ((gameR[k] ?? 0) >= (gameL[k] ?? 0)) {
      order.push({ agg: aggR, game: gameR })
      order.push({ agg: aggL, game: gameL })
    } else {
      order.push({ agg: aggL, game: gameL })
      order.push({ agg: aggR, game: gameR })
    }

    for (const { agg, game } of order) {
      if (need <= 0) break
      const have = Math.max(0, game[k] ?? 0)
      const sub = Math.min(need, have)
      if (sub > 0) {
        ;(agg as unknown as Record<string, number>)[k as string] -= sub
        applied[k] += sub
        need -= sub
        // game カウンタからも引いておく（同 game の他列の優先順決定で参照される）
        ;(game as Record<string, number>)[k as string] -= sub
      }
    }
  }
  return applied
}

/** Phase 27: 1試合のバケツの H/HR/TB スナップショット（負 Δ 吸収の優先順判定と在庫管理用） */
type HCounts = { h: number; hr: number; tb: number }
function hFromAgg(a: BattingSeasonAggYahoo): HCounts {
  return { h: a.h, hr: a.hr, tb: a.tb }
}
function hDelta(after: HCounts, before: HCounts): HCounts {
  return { h: after.h - before.h, hr: after.hr - before.hr, tb: after.tb - before.tb }
}
function hAdd(x: HCounts, y: HCounts): HCounts {
  return { h: x.h + y.h, hr: x.hr + y.hr, tb: x.tb + y.tb }
}

/**
 * Phase 27: 負の H/HR Δ（=PA 経路で安打を battingLines より多く判定）を試合のバケツから差し引く。
 *
 * 順序:
 *   1) HR の超過 (-hrDelta) を吸収。1 件ごとに `agg.hr--, agg.h--, agg.tb -= 4` と game の在庫を連動。
 *   2) HR を吸収した分は H の超過から控除し、残った H 超過分を「単打仮定」で `agg.h--, agg.tb -= 1` で吸収。
 *
 * 在庫優先順は P0 と同じ: 不明（gameU）→ 多い方の R/L → もう片方。
 *
 * 戻り値: 実際に吸収した量（H と HR）。
 */
function applyNegativeHGapFromGameBuckets(
  aggR: BattingSeasonAggYahoo,
  aggL: BattingSeasonAggYahoo,
  aggU: BattingSeasonAggYahoo,
  gameR: HCounts,
  gameL: HCounts,
  gameU: HCounts,
  /** target - current。`h` / `hr` どちらかが負のとき吸収対象。 */
  delta: { h: number; hr: number },
): { h: number; hr: number } {
  const applied = { h: 0, hr: 0 }

  let needHr = delta.hr < 0 ? -delta.hr : 0
  if (needHr > 0) {
    const order: Array<{ agg: BattingSeasonAggYahoo; game: HCounts }> = [
      { agg: aggU, game: gameU },
    ]
    if ((gameR.hr ?? 0) >= (gameL.hr ?? 0)) {
      order.push({ agg: aggR, game: gameR })
      order.push({ agg: aggL, game: gameL })
    } else {
      order.push({ agg: aggL, game: gameL })
      order.push({ agg: aggR, game: gameR })
    }
    for (const { agg, game } of order) {
      if (needHr <= 0) break
      const have = Math.max(0, game.hr)
      const sub = Math.min(needHr, have)
      if (sub > 0) {
        agg.hr -= sub
        agg.h -= sub
        agg.tb -= 4 * sub
        game.hr -= sub
        game.h -= sub
        game.tb -= 4 * sub
        applied.hr += sub
        applied.h += sub
        needHr -= sub
      }
    }
  }

  // H 超過は HR 吸収分を差し引いた残量だけ、単打として吸収する。
  let needH = (delta.h < 0 ? -delta.h : 0) - applied.h
  if (needH > 0) {
    const order: Array<{ agg: BattingSeasonAggYahoo; game: HCounts }> = [
      { agg: aggU, game: gameU },
    ]
    if ((gameR.h ?? 0) >= (gameL.h ?? 0)) {
      order.push({ agg: aggR, game: gameR })
      order.push({ agg: aggL, game: gameL })
    } else {
      order.push({ agg: aggL, game: gameL })
      order.push({ agg: aggR, game: gameR })
    }
    for (const { agg, game } of order) {
      if (needH <= 0) break
      const haveNonHr = Math.max(0, game.h - game.hr)
      const sub = Math.min(needH, haveNonHr)
      if (sub > 0) {
        agg.h -= sub
        agg.tb -= sub
        game.h -= sub
        game.tb -= sub
        applied.h += sub
        needH -= sub
      }
    }
  }

  return applied
}

export function loadVsHandRowsFromCanonicalWithDebug(
  yahooBatterId: string,
  options?: LoadVsHandFromCanonicalOptions,
): {
  rows: SeasonStatsRow[]
  unknownPitchers: Record<string, number>
  missingPitcherIdPas: number
  missingPitcherIdSamples: Array<{ gameId: string; paId: string; pitchEvents: number }>
  inferredPitcherIdPas: number
  inferredPitcherIdFromTextPas: number
  backfilledResultSamples: Array<{
    gameId: string
    paId: string
    vsHand: 'R' | 'L' | 'unknown'
    rawLine: string
    inferredResult: string
  }>
  unparsedAtBatSamples: Array<{
    gameId: string
    paId: string
    vsHand: 'R' | 'L' | 'unknown'
    resultText: string
  }>
  perGameMismatchSamples: Array<{
    gameId: string
    batterLine: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number } | null
    parsed: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number }
    suspectPa: Array<{ paId: string; vsHand: 'R' | 'L' | 'unknown'; resultText: string }>
  }>
  /** Phase 25: 通算（Phase 11）と R+L+unknown 合計の Δ を試合単位で不明バケツに寄せた結果 */
  reconciliation: VsHandReconciliationDebug
  /** `collectVsUnknownAbSamples` 指定時のみ */
  vsUnknownAbSamples?: VsUnknownAbSample[]
  /** `collectPaDumpForGameId` 指定時のみ */
  paDump?: VsHandPaDumpRow[]
} {
  // 橋渡し JSON をこのプロセスで更新した直後でも反映されるようにする（dev での調査・手直し用）
  invalidateYahooNpbBatterMapsCache()
  const emptyReconciliation = (): VsHandReconciliationDebug => ({
    backfilledGames: 0,
    negativeDeltaGames: 0,
    appliedDelta: emptyP0(),
    negativeDelta: emptyP0(),
    negativeAppliedDelta: emptyP0(),
    negativeUnabsorbedDelta: emptyP0(),
    negativeDeltaSamples: [],
    negativeHrApplied: 0,
    negativeHApplied: 0,
    positiveHrApplied: 0,
    positiveHApplied: 0,
  })
  const bid = (yahooBatterId || '').trim()
  if (!/^\d+$/.test(bid))
    return {
      rows: [],
      unknownPitchers: {},
      missingPitcherIdPas: 0,
      missingPitcherIdSamples: [],
      inferredPitcherIdPas: 0,
      inferredPitcherIdFromTextPas: 0,
      backfilledResultSamples: [],
      unparsedAtBatSamples: [],
      perGameMismatchSamples: [],
      reconciliation: emptyReconciliation(),
      vsUnknownAbSamples: options?.collectVsUnknownAbSamples ? [] : undefined,
    }
  const docs: CanonicalGameDocument[] =
    options?.preloadedCanonicalDocs && options.preloadedCanonicalDocs.length > 0
      ? options.preloadedCanonicalDocs
      : loadCanonicalGames(getProjectRoot())
  if (docs.length === 0)
    return {
      rows: [],
      unknownPitchers: {},
      missingPitcherIdPas: 0,
      missingPitcherIdSamples: [],
      inferredPitcherIdPas: 0,
      inferredPitcherIdFromTextPas: 0,
      backfilledResultSamples: [],
      unparsedAtBatSamples: [],
      perGameMismatchSamples: [],
      reconciliation: emptyReconciliation(),
      vsUnknownAbSamples: options?.collectVsUnknownAbSamples ? [] : undefined,
    }

  const aggR = emptyBattingSeasonAggYahoo()
  const aggL = emptyBattingSeasonAggYahoo()
  const aggU = emptyBattingSeasonAggYahoo()
  const reconciliation: VsHandReconciliationDebug = {
    backfilledGames: 0,
    negativeDeltaGames: 0,
    appliedDelta: emptyP0(),
    negativeDelta: emptyP0(),
    negativeAppliedDelta: emptyP0(),
    negativeUnabsorbedDelta: emptyP0(),
    negativeDeltaSamples: [],
    negativeHrApplied: 0,
    negativeHApplied: 0,
    positiveHrApplied: 0,
    positiveHApplied: 0,
  }
  const vsUnknownAbSamples: VsUnknownAbSample[] | undefined = options?.collectVsUnknownAbSamples
    ? []
    : undefined
  const dumpGameId = String(options?.collectPaDumpForGameId ?? '').trim()
  const paDump: VsHandPaDumpRow[] | undefined = dumpGameId ? [] : undefined
  const unknownPitchers: Record<string, number> = {}
  let missingPitcherIdPas = 0
  const missingPitcherIdSamples: Array<{ gameId: string; paId: string; pitchEvents: number }> = []
  let inferredPitcherIdPas = 0
  let inferredPitcherIdFromTextPas = 0
  const backfilledResultSamples: Array<{
    gameId: string
    paId: string
    vsHand: 'R' | 'L' | 'unknown'
    rawLine: string
    inferredResult: string
  }> = []
  const unparsedAtBatSamples: Array<{
    gameId: string
    paId: string
    vsHand: 'R' | 'L' | 'unknown'
    resultText: string
  }> = []
  const perGameMismatchSamples: Array<{
    gameId: string
    batterLine: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number } | null
    parsed: { ab: number; h: number; hr: number; bb: number; hbp: number; so: number }
    suspectPa: Array<{ paId: string; vsHand: 'R' | 'L' | 'unknown'; resultText: string }>
  }> = []

  const compact = (s: string): string => String(s ?? '').replace(/\s/g, '').replace(/　/g, '')

  const pregameText = (doc: CanonicalGameDocument): string => {
    const secs = doc.game?.textPlayByPlay ?? []
    const pre = secs.find((x) => String(x?.sectionTitle ?? '').trim() === '試合前情報')
    const lines: string[] = Array.isArray(pre?.lines) ? pre!.lines : []
    return lines.join(' ')
  }

  const resolveTeamsFromPregame = (preText: string): { visitorTeam: string; homeTeam: string } => {
    const mVis = preText.match(/先攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
    const mHome = preText.match(/後攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
    return {
      visitorTeam: mVis?.[1] ? String(mVis[1]).trim() : '',
      homeTeam: mHome?.[1] ? String(mHome[1]).trim() : '',
    }
  }

  const resolveStartersFromPregame = (
    preText: string,
    teams: { visitorTeam: string; homeTeam: string },
  ): { visitorStarter: string; homeStarter: string } => {
    const mStart = preText.match(/先発ピッチャーは(.+?)(?:先攻[:：]|$)/)
    const startText = mStart?.[1] ? String(mStart[1]) : ''
    const pickNameForTeam = (team: string): string => {
      if (!team || !startText) return ''
      // "オリックスが中8日で エスピノーザ" のようなパターンを想定
      const r = new RegExp(`${team}が[^\\s]*\\s*([^、,\\s]+)`, 'u')
      const mm = startText.match(r)
      return mm?.[1] ? String(mm[1]).trim() : ''
    }
    return {
      visitorStarter: pickNameForTeam(teams.visitorTeam),
      homeStarter: pickNameForTeam(teams.homeTeam),
    }
  }

  const splitPitchingLinesByTeamOrder = (
    doc: CanonicalGameDocument,
  ): { visitor: typeof doc.domain.pitchingLines; home: typeof doc.domain.pitchingLines } | null => {
    const lines = Array.isArray(doc.domain?.pitchingLines) ? doc.domain.pitchingLines : []
    if (lines.length === 0) return null

    // 1) まずは「試合前情報（テキスト）」から先発投手名を引いてチーム順を決める（従来）。
    const pre = pregameText(doc)
    const teams = resolveTeamsFromPregame(pre)
    const starters = resolveStartersFromPregame(pre, teams)
    const keyVisitor = compact(starters.visitorStarter)
    const keyHome = compact(starters.homeStarter)
    if (keyVisitor && keyHome) {
      const idxVisitor = lines.findIndex((l) => compact(String(l.playerName ?? '')) === keyVisitor)
      const idxHome = lines.findIndex((l) => compact(String(l.playerName ?? '')) === keyHome)
      if (idxVisitor >= 0 && idxHome >= 0) {
        // スポナビは通常「先攻チームの投手成績→後攻チームの投手成績」順で並ぶ想定
        if (idxVisitor < idxHome) {
          return { visitor: lines.slice(0, idxHome), home: lines.slice(idxHome) }
        }
        if (idxHome < idxVisitor) {
          return { visitor: lines.slice(idxVisitor), home: lines.slice(0, idxVisitor) }
        }
      }
    }

    // 2) フォールバック: `pitchingLines[].yahooPlayerId` とスタメン投手（投）のIDで分割する。
    // 「試合前情報」テキストが欠損/文字化けしても、統計表（stats_row_v0）がある限りこちらは機能する。
    try {
      const teamsArr = Array.isArray(doc.game?.teams) ? doc.game.teams : []
      const visitor = teamsArr[0]
      const home = teamsArr[1]
      const pickPitcherId = (t: any): string => {
        const lineup = Array.isArray(t?.startingLineup) ? t.startingLineup : []
        const p = lineup.find((x: any) => String(x?.fieldingPosition ?? '').trim() === '投')
        return String(p?.yahooPlayerId ?? '').trim()
      }
      const visitorStarterId = pickPitcherId(visitor)
      const homeStarterId = pickPitcherId(home)
      if (visitorStarterId && homeStarterId) {
        const idxVisitor = lines.findIndex((l: any) => String(l?.yahooPlayerId ?? '').trim() === visitorStarterId)
        const idxHome = lines.findIndex((l: any) => String(l?.yahooPlayerId ?? '').trim() === homeStarterId)
        if (idxVisitor >= 0 && idxHome >= 0) {
          if (idxVisitor < idxHome) return { visitor: lines.slice(0, idxHome), home: lines.slice(idxHome) }
          if (idxHome < idxVisitor) return { visitor: lines.slice(idxVisitor), home: lines.slice(0, idxVisitor) }
        }
      }
    } catch {
      // ignore
    }

    // 3) フォールバック: スタメン（teams）が欠損している試合向け。
    // `plateAppearances` に含まれる投手IDから、表/裏それぞれの「最初に確認できた投手ID」を seed にして分割する。
    try {
      const pas = Array.isArray(doc.domain?.plateAppearances) ? doc.domain.plateAppearances : []
      const pickSeed = (half: '表' | '裏'): string => {
        for (const pa of pas) {
          const paId = String((pa as any)?.paId ?? '')
          if (!paId.includes(`-${half}-`)) continue
          const pid = yahooPitcherIdForVsHandFromPa(pa as PlateAppearance)
          if (pid) return pid
        }
        return ''
      }
      const homePitcherId = pickSeed('表') // 表=visitor打撃→home投手
      const visitorPitcherId = pickSeed('裏') // 裏=home打撃→visitor投手
      if (homePitcherId && visitorPitcherId) {
        const idxHome = lines.findIndex((l: any) => String(l?.yahooPlayerId ?? '').trim() === homePitcherId)
        const idxVisitor = lines.findIndex((l: any) => String(l?.yahooPlayerId ?? '').trim() === visitorPitcherId)
        if (idxVisitor >= 0 && idxHome >= 0) {
          if (idxVisitor < idxHome) return { visitor: lines.slice(0, idxHome), home: lines.slice(idxHome) }
          if (idxHome < idxVisitor) return { visitor: lines.slice(idxVisitor), home: lines.slice(0, idxVisitor) }
        }
      }
    } catch {
      // ignore
    }

    return null
  }

  const assignPitcherNameByBf = (
    pas: PlateAppearance[],
    pitchers: Array<{ playerName: string; bf?: number | null }>,
  ): Map<string, string> => {
    const out = new Map<string, string>()
    if (pas.length === 0 || pitchers.length === 0) return out
    let i = 0
    let remain = Math.max(0, Math.trunc(Number(pitchers[0]?.bf ?? 0)))
    for (const pa of pas) {
      while (i < pitchers.length && remain <= 0) {
        i++
        remain = Math.max(0, Math.trunc(Number(pitchers[i]?.bf ?? 0)))
      }
      const name = String(pitchers[i]?.playerName ?? '').trim()
      if (name) out.set(String(pa.paId ?? ''), name)
      remain -= 1
    }
    return out
  }

  const throwHandFromPitcherName = (name: string): 'R' | 'L' | '' => {
    const th = getPlayerHandedness(String(name ?? '').trim()).throwHand
    return th === 'R' || th === 'L' ? th : ''
  }

  const rawYahooTextPathForGame = (gameId: string): string => {
    return path.join(getProjectRoot(), '_data', 'scraped_games', 'raw_yahoo_text', `${gameId}.html`)
  }

  const buildPitcherNameResolverFromRawYahooText = (gameId: string) => {
    const p = rawYahooTextPathForGame(gameId)
    if (!fs.existsSync(p)) return null
    let html = ''
    try {
      html = fs.readFileSync(p, 'utf-8')
    } catch {
      return null
    }
    return (yahooPitcherId: string): string => {
      const pid = String(yahooPitcherId ?? '').trim()
      if (!pid) return ''
      // `/npb/player/{id}/top` のアンカーテキスト（例: "藤井" / "渡辺翔"）を拾う
      const m = html.match(new RegExp(`href="/npb/player/${pid}/top"[^>]*>([^<]+)</a>`, 'u'))
      return m?.[1] ? String(m[1]).trim() : ''
    }
  }

  const paTextLine = (doc: CanonicalGameDocument, paId?: string): string => {
    const s = String(paId ?? '').trim()
    const m = s.match(/^\d+-(\d+)-(表|裏)-(\d+)$/)
    if (!m) return ''
    const inning = m[1]
    const half = m[2]
    const order = m[3]
    const secTitle = `${inning}回${half}`
    const secs = doc.game?.textPlayByPlay ?? []
    const sec = secs.find((x) => String(x?.sectionTitle ?? '').trim() === secTitle)
    const lines: string[] = Array.isArray(sec?.lines) ? sec!.lines : []
    return lines.find((l) => new RegExp(`^\\s*${order}\\s*[：:]`).test(String(l))) ?? ''
  }

  const resultFromPaTextLine = (line: string): string => {
    const s = String(line ?? '')
    if (!s) return ''
    // 牽制・盗塁など「打席が完了していない」イベント行が混ざることがある。
    // 例: "... 一塁けん制:ランナー ... 盗塁失敗 3アウト"（打者結果が無い）
    // これらは PA として数えない（通算/公式打席のズレ原因になる）。
    if (/(けん制|牽制)/.test(s) && /(盗塁成功|盗塁失敗)/.test(s)) {
      // 打者結果が同一行に併記されているケースを除外する（例: "…の間に盗塁成功、打者は四球" 等）
      if (
        !/(四球|申告敬遠|敬遠|死球|犠打|送りバント|犠飛|犠牲フライ|犠牲飛|三振|本塁打|二塁打|三塁打|安打|ヒット|ゴロ|フライ|ライナー)/.test(
          s,
        )
      ) {
        return ''
      }
    }
    if (/四球/.test(s)) return '四球'
    // 申告敬遠/敬遠（walk-like）
    if (/申告敬遠|敬遠/.test(s)) return '四球'
    if (/死球/.test(s)) return '死球'
    // `isSacBunt` は「送りバント」も犠打扱い。実況だけが「送りバント」で `犠打` 語が無い行の補完で落ちないよう揃える。
    if (/犠打|捕犠打|送りバント/.test(s)) return '犠打'
    if (/犠飛|犠牲フライ|犠牲飛/.test(s)) return '犠飛'
    if (/見逃し三振|空振り三振|三振/.test(s)) return '三振'
    if (/本塁打|ホームラン|HR|[左右中]本/.test(s)) return '本塁打'
    if (/三塁打|３塁打|スリーベース|[左右中]３/.test(s)) return '三塁打'
    if (/二塁打|ツーベース|エンタイトルツーベース|２塁打|[左右中]２/.test(s)) return '二塁打'
    if (/安打|ヒット|内野安打|内安|左安|中安|右安/.test(s)) return '安打'
    if (/[一二三遊左中右投捕]安/.test(s)) return '安打'
    if (/(左|中|右)(前|線)打|前打|単打/.test(s)) return '安打'
    if (/(タイムリー|適時打)/.test(s) && !/失策|エラー|野選/.test(s)) return '安打'
    return 'アウト'
  }

  const inferPitcherIdFromText = (doc: CanonicalGameDocument, paId?: string): string => {
    const s = String(paId ?? '').trim()
    const m = s.match(/^\d+-(\d+)-(表|裏)-(\d+)$/)
    if (!m) return ''
    const inning = m[1]
    const half = m[2]
    const order = m[3]

    const mentioned = doc.game?.yahooPlayersMentioned ?? {}
    const nameToId = new Map<string, string>()
    for (const [id, name] of Object.entries(mentioned)) {
      const k = compact(String(name ?? '').trim())
      if (k && !nameToId.has(k)) nameToId.set(k, String(id).trim())
    }

    const secs = doc.game?.textPlayByPlay ?? []
    const line = paTextLine(doc, paId)
    // まず行中に pitcher 明示があればそれを優先
    if (line) {
      const lm = String(line).match(/ピッチャー\s*([^\s]+?)(?:\s|に代わって|→|$)/)
      const pname = lm?.[1] ? String(lm[1]).trim() : ''
      if (pname) {
        const key = compact(pname)
        const direct = nameToId.get(key)
        if (direct) return direct
        for (const [k, id] of nameToId.entries()) {
          if (k && key && (k === key || k.includes(key))) return id
        }
      }
    }

    // pitcher 明示が無い場合は「先発ピッチャーは…」から当該表裏の先発を使う（投手交代は別途改善）
    const pre = secs.find((x) => String(x?.sectionTitle ?? '').trim() === '試合前情報')
    const preText = Array.isArray(pre?.lines) ? pre!.lines.join(' ') : ''
    if (!preText) return ''
    // 先攻/後攻チーム名（先攻=表の攻撃側）
    const mVis = preText.match(/先攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
    const mHome = preText.match(/後攻[:：]\s*([^\sの]+?)のスターティングラインアップ/)
    const visitorTeam = mVis?.[1] ? String(mVis[1]).trim() : ''
    const homeTeam = mHome?.[1] ? String(mHome[1]).trim() : ''
    // 先発ピッチャーの文（例: "先発ピッチャーはオリックスが… エスピノーザ 、日本ハムが… 伊藤"）
    const mStart = preText.match(/先発ピッチャーは(.+?)(?:先攻[:：]|$)/)
    const startText = mStart?.[1] ? String(mStart[1]) : ''
    if (!startText) return ''
    const pickNameForTeam = (team: string): string => {
      if (!team) return ''
      const r = new RegExp(`${team}が[^\\s]*\\s*([^、,\\s]+)`, 'u')
      const mm = startText.match(r)
      return mm?.[1] ? String(mm[1]).trim() : ''
    }
    const homeStarterName = pickNameForTeam(homeTeam)
    const visitorStarterName = pickNameForTeam(visitorTeam)
    const wantPitcherName = half === '表' ? homeStarterName : visitorStarterName
    const key = compact(wantPitcherName)
    if (!key) return ''
    const direct = nameToId.get(key)
    if (direct) return direct
    for (const [k, id] of nameToId.entries()) {
      if (k && (k === key || k.includes(key))) return id
    }
    return ''
  }

  /**
   * 実況（textPlayByPlay）を時系列に走査し、各打席（paId）に対応する投手IDを割り当てる。
   * - 投手交代（例: "投手交代: 宮城 → 山田"）を反映
   * - 初期値は「試合前情報」の先発投手（表=home投手、裏=visitor投手）
   * - 投手名→ID は `yahooPlayersMentioned` を参照（部分一致も許容）
   */
  const buildPitcherIdByPaIdFromTextTimeline = (doc: CanonicalGameDocument): Map<string, string> => {
    const out = new Map<string, string>()
    const gameId = String(doc.gameId ?? '').trim()
    if (!gameId) return out

    const mentioned = doc.game?.yahooPlayersMentioned ?? {}
    const nameToId = new Map<string, string>()
    for (const [id, name] of Object.entries(mentioned)) {
      const k = compact(String(name ?? '').trim())
      if (k && !nameToId.has(k)) nameToId.set(k, String(id).trim())
    }
    const resolveNameToId = (pname: string): string => {
      const key = compact(pname)
      if (!key) return ''
      const direct = nameToId.get(key)
      if (direct) return direct
      for (const [k, id] of nameToId.entries()) {
        if (k && (k === key || k.includes(key) || key.includes(k))) return id
      }
      return ''
    }

    const pre = pregameText(doc)
    const teams = resolveTeamsFromPregame(pre)
    const starters = resolveStartersFromPregame(pre, teams)
    const homeStarterId = starters.homeStarter ? resolveNameToId(starters.homeStarter) : ''
    const visitorStarterId = starters.visitorStarter ? resolveNameToId(starters.visitorStarter) : ''

    // 表（先攻=visitor打撃）→ home投手、裏（後攻=home打撃）→ visitor投手
    let currentTop = homeStarterId
    let currentBottom = visitorStarterId

    const secs = doc.game?.textPlayByPlay ?? []
    for (const sec of secs) {
      const title = String(sec?.sectionTitle ?? '').trim()
      const m = title.match(/^(\d+)回(表|裏)$/)
      if (!m) continue
      const inning = m[1]
      const half = m[2] // 表/裏
      const lines: string[] = Array.isArray(sec?.lines) ? sec!.lines : []
      for (const line of lines) {
        const s = String(line ?? '')

        // 投手交代: A → B
        const ch =
          s.match(/投手交代\s*[:：]\s*[^→]+?→\s*([^\s、,]+)\b/u) ??
          s.match(/投手交代\s*[:：]\s*[^→]+?→\s*([^\s、,]+)\s*/u)
        if (ch?.[1]) {
          const pid = resolveNameToId(String(ch[1]).trim())
          if (pid) {
            if (half === '表') currentTop = pid
            else currentBottom = pid
          }
        }

        // ピッチャー明示（稀に出る）
        const pm = s.match(/ピッチャー\s*([^\s]+?)(?:\s|に代わって|→|$)/u)
        if (pm?.[1]) {
          const pid = resolveNameToId(String(pm[1]).trim())
          if (pid) {
            if (half === '表') currentTop = pid
            else currentBottom = pid
          }
        }

        // 打席行: "3： ..." の先頭番号を paId に対応付け
        const om = s.match(/^\s*(\d+)\s*[：:]/u)
        if (om?.[1]) {
          const order = String(om[1])
          const paId = `${gameId}-${inning}-${half}-${order}`
          const pid = half === '表' ? currentTop : currentBottom
          if (pid) out.set(paId, pid)
        }
      }
    }
    return out
  }

  for (const doc of docs) {
    const gid = String(doc.gameId ?? '').trim()
    const mergedDoc =
      options?.mergedDocsByGameId?.get(gid) ?? mergePhase10RestoredIntoDocIfPresent(doc)
    const gameId = mergedDoc.gameId
    const mentioned = mergedDoc.game?.yahooPlayersMentioned ?? {}
    // Phase 25: 試合単位の R/L/U を記録するため、PA ループ前後で aggR/aggL/aggU をスナップショットする。
    const snapBeforeR = p0FromAgg(aggR)
    const snapBeforeL = p0FromAgg(aggL)
    const snapBeforeU = p0FromAgg(aggU)
    // Phase 27: H/HR/TB も負 Δ 吸収のためにスナップショット
    const snapBeforeHR = hFromAgg(aggR)
    const snapBeforeHL = hFromAgg(aggL)
    const snapBeforeHU = hFromAgg(aggU)
    const pitcherIdByPaIdFromText = buildPitcherIdByPaIdFromTextTimeline(mergedDoc)
    const pitcherNameFromRawYahooText = buildPitcherNameResolverFromRawYahooText(gameId)
    const batterName = String(mentioned[bid] ?? '').trim()

    const buildTextFallbackPlateAppearances = (): PlateAppearance[] => {
      if (!batterName) return []
      const keyBatter = compact(batterName)
      if (!keyBatter) return []
      const secs = mergedDoc.game?.textPlayByPlay ?? []
      const out: PlateAppearance[] = []
      for (const sec of secs) {
        const title = String(sec?.sectionTitle ?? '').trim()
        const m = title.match(/^(\d+)回(表|裏)$/)
        if (!m) continue
        const inning = m[1]
        const half = m[2]
        const lines: string[] = Array.isArray(sec?.lines) ? sec!.lines : []
        for (const line of lines) {
          const s = String(line ?? '')
          const om = s.match(/^\s*(\d+)\s*[：:]/u)
          if (!om?.[1]) continue
          // "1番 桑原 将志" のような表記を想定（スペース揺れに強く）
          const mName = s.match(/^\s*\d+\s*[：:]\s*\d+番\s*([^\s]+)\s*([^\s]+)/u)
          const joined =
            mName?.[1] && mName?.[2] ? compact(`${mName[1]}${mName[2]}`) : compact(s)
          if (!joined.includes(keyBatter)) continue
          const inferred = resultFromPaTextLine(s)
          if (!inferred) continue
          const order = String(om[1])
          const paId = `${String(gameId)}-${inning}-${half}-${order}`
          const pid = pitcherIdByPaIdFromText.get(paId) ?? ''
          out.push({
            paId,
            inningHalf: `${inning}回${half}`,
            yahooBatterId: bid,
            yahooPitcherId: pid,
            pitchEvents: [],
            resultSummaryJa: inferred,
          } as any)
        }
      }
      return out
    }

    const paMap = new Map<string, PlateAppearance>()
    for (const pa of mergedDoc.domain?.plateAppearances ?? []) {
      const id = String(pa?.paId ?? '').trim()
      if (!id) continue
      // batter のみを保持（無駄なメモリを避ける）
      if (String(pa.yahooBatterId ?? '').trim() !== bid) continue
      paMap.set(id, pa)
    }
    // 当該打者に出場成績行がある試合では Phase11 通算が battingLines 優先（canonicalBattingSeasonAgg）。
    // このとき実況からの打席復元も重ねると、同一内容が別 paId で二重に載り対左右だけ PA が膨らむことがある（例: Ｆ．レイエス）。
    //
    // Phase 26 追加: domain.battingLines に行が無くても、一球ログ側に当該打者の plateAppearances が既にある場合は
    // 実況フォールバックを載せない。投手の打撃が stats の game 側テーブルにだけあり domain.battingLines に載らない試合で、
    // 実況マッチが幽霊 PA を増やすのを防ぐ（例: 中川 颯 yahoo_2000099）。
    const hasBattingLineForBid = (mergedDoc.domain?.battingLines ?? []).some(
      (line) => String(line.yahooPlayerId ?? '').trim() === bid,
    )
    const hasPitchingLineForBid = (mergedDoc.domain?.pitchingLines ?? []).some(
      (line) => String(line.yahooPlayerId ?? '').trim() === bid,
    )
    // Phase 26c: その試合で投手成績行はあるが打席ログに打者として現れない場合、実況に名前だけ出ると
    // buildTextFallback が幽霊 PA を足し、対左右だけ通算を上回る（例: 中川 颯 が先発のみの試合×複数）。
    const skipTextFallbackLikelyPitcherOnlyGhost =
      hasPitchingLineForBid && paMap.size === 0 && !hasBattingLineForBid
    if (!hasBattingLineForBid && paMap.size === 0 && !skipTextFallbackLikelyPitcherOnlyGhost) {
      // plateAppearances が欠損している試合向けに、実況から打席を復元して補う
      for (const pa of buildTextFallbackPlateAppearances()) {
        const id = String(pa.paId ?? '').trim()
        if (!id) continue
        if (!paMap.has(id)) paMap.set(id, pa)
      }
    }
    let pas = [...paMap.values()].sort((a, b) =>
      String(a.paId ?? '').localeCompare(String(b.paId ?? ''))
    )
    pas = dedupePlateAppearancesByInningHalfOrder(pas, gameId)
    // BF による投手割当（実況ベースの補助。pitcherId が無い打席向け）
    const paTop = pas.filter((p) => String(p.inningHalf ?? '').includes('表'))
    const paBottom = pas.filter((p) => String(p.inningHalf ?? '').includes('裏'))
    const pitchSplit = splitPitchingLinesByTeamOrder(mergedDoc)
    const pitcherNameByPaIdTop = pitchSplit ? assignPitcherNameByBf(paTop, pitchSplit.home ?? []) : new Map()
    const pitcherNameByPaIdBottom = pitchSplit ? assignPitcherNameByBf(paBottom, pitchSplit.visitor ?? []) : new Map()
    // 同一試合内の「表／裏」ごとに、直前の投手IDを carry-forward する（実況補完などで pitcherId が欠けるケース用）
    const lastPitcherByHalf: Record<'top' | 'bottom', string> = { top: '', bottom: '' }
    let lastPitcherAny = ''

    // plateAppearances が投手ID欠損でも、先発投手はスタメン（投）から取れることがあるため seed する
    try {
      const teams = mergedDoc.game?.teams ?? []
      const visitor = teams[0]
      const home = teams[1]
      const pickPitcher = (t: any): string => {
        const lineup = Array.isArray(t?.startingLineup) ? t.startingLineup : []
        const p = lineup.find((x: any) => String(x?.fieldingPosition ?? '').trim() === '投')
        return String(p?.yahooPlayerId ?? '').trim()
      }
      const visitorPitcherId = pickPitcher(visitor)
      const homePitcherId = pickPitcher(home)
      // 表=先攻（visitor 打撃）→ home 投手、裏=home 打撃→ visitor 投手
      if (homePitcherId) lastPitcherByHalf.top = homePitcherId
      if (visitorPitcherId) lastPitcherByHalf.bottom = visitorPitcherId
      lastPitcherAny = homePitcherId || visitorPitcherId || lastPitcherAny
    } catch {
      // ignore
    }
    const halfKeyFromPaId = (paId?: string): 'top' | 'bottom' | null => {
      const s = String(paId ?? '').trim()
      if (!s) return null
      // canonical の paId は `${gameId}-${inning}-表|裏-${seq}` 形式
      if (s.includes('-表-')) return 'top'
      if (s.includes('-裏-')) return 'bottom'
      return null
    }

    for (const pa of pas) {
      // 結果欠損の打席は実況行から補完する。BF 名簿で左右だけ決めて early-return する経路でも
      // 同じ pa を使わないと、通算(Phase11)と対左右の合計安打が食い違う（例: 黒川 1900113）。
      // 要約・一球のいずれでも結果が取れないときは実況行から補完（pitchEvents だけあるが最終球が空、等）
      const needBackfill = !plateAppearanceLastResultText(pa).trim()
      const rawLine = needBackfill ? paTextLine(mergedDoc, pa.paId) : ''
      const inferredResult = needBackfill ? resultFromPaTextLine(rawLine) : ''
      const paForAgg: PlateAppearance =
        needBackfill && inferredResult ? { ...pa, resultSummaryJa: inferredResult } : pa

      const recordVsUnknownAbIfAtBat = (
        reason: VsUnknownAbSample['reason'],
        yahooPitcherIdForSample: string,
      ) => {
        if (!vsUnknownAbSamples || vsUnknownAbSamples.length >= 40) return
        const rtAgg = plateAppearanceLastResultText(paForAgg)
        if (!isAtBat(rtAgg)) return
        vsUnknownAbSamples.push({
          gameId,
          paId: String(pa.paId ?? ''),
          yahooPitcherId: yahooPitcherIdForSample,
          reason,
          resultSummary: rtAgg,
        })
      }

      const hk = halfKeyFromPaId(pa.paId)
      const pidFromAny = yahooPitcherIdForVsHandFromPa(pa)
      if (pidFromAny && hk) lastPitcherByHalf[hk] = pidFromAny
      if (pidFromAny) lastPitcherAny = pidFromAny

      let pid = pidFromAny
      if (!pid && hk && lastPitcherByHalf[hk]) {
        pid = lastPitcherByHalf[hk]
        inferredPitcherIdPas += 1
      }
      if (!pid && !hk && lastPitcherAny) {
        pid = lastPitcherAny
        inferredPitcherIdPas += 1
      }
      // 投手IDが欠損している打席は、まず BF（打者数）割当で投手名→名簿利き腕で左右を確定させる。
      // 実況テキストから投手IDを推定すると、交代文の欠落等で誤った投手に吸い込まれやすく、
      // vs_hand の R/L が 1打席単位でズレる原因になるため、ここでは「左右の確定」を優先する。
      if (!pid) {
        const paIdKey = String(pa.paId ?? '')
        const pname =
          pitcherNameByPaIdTop.get(paIdKey) ??
          pitcherNameByPaIdBottom.get(paIdKey) ??
          ''
        const thName = pname ? throwHandFromPitcherName(pname) : ''
        if (thName === 'R') {
          updateVsHandFromPa(aggR, gameId, paForAgg)
          if (needBackfill && backfilledResultSamples.length < 30) {
            backfilledResultSamples.push({
              gameId,
              paId: String(pa.paId ?? ''),
              vsHand: 'R',
              rawLine,
              inferredResult,
            })
          }
          continue
        }
        if (thName === 'L') {
          updateVsHandFromPa(aggL, gameId, paForAgg)
          if (needBackfill && backfilledResultSamples.length < 30) {
            backfilledResultSamples.push({
              gameId,
              paId: String(pa.paId ?? ''),
              vsHand: 'L',
              rawLine,
              inferredResult,
            })
          }
          continue
        }
      }
      if (!pid) {
        const fromTimeline = pitcherIdByPaIdFromText.get(String(pa.paId ?? '')) ?? ''
        if (fromTimeline) {
          pid = fromTimeline
          inferredPitcherIdFromTextPas += 1
        }
      }
      if (!pid) {
        const fromText = inferPitcherIdFromText(mergedDoc, pa.paId)
        if (fromText) {
          pid = fromText
          inferredPitcherIdFromTextPas += 1
        }
      }
      if (!pid) {
        missingPitcherIdPas += 1
        if (missingPitcherIdSamples.length < 10) {
          missingPitcherIdSamples.push({
            gameId,
            paId: String(pa.paId ?? ''),
            pitchEvents: pa.pitchEvents?.length ?? 0,
          })
        }
        recordVsUnknownAbIfAtBat('missing_pitcher_id', '')
        updateVsHandFromPa(aggU, gameId, paForAgg)
        if (needBackfill && backfilledResultSamples.length < 30) {
          backfilledResultSamples.push({
            gameId,
            paId: String(pa.paId ?? ''),
            vsHand: 'unknown',
            rawLine,
            inferredResult,
          })
        }
        continue
      }
      let th = pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, mentioned)
      // 投手IDはあるが橋渡し/mentioned が無いケース（sportsnavi canonical の yahooPlayersMentioned 空など）では
      // BF割当で投手名を引いて名簿から左右を解決する。
      if (!th) {
        const paIdKey = String(pa.paId ?? '')
        const pname =
          pitcherNameByPaIdTop.get(paIdKey) ??
          pitcherNameByPaIdBottom.get(paIdKey) ??
          ''
        const thName = pname ? throwHandFromPitcherName(pname) : ''
        if (thName === 'R' || thName === 'L') th = thName
      }
      // それでも不明なら、実況HTML（raw_yahoo_text）から投手名を拾って名簿で左右を解決する
      if (!th && pitcherNameFromRawYahooText) {
        const pname = pitcherNameFromRawYahooText(pid)
        const thName = pname ? throwHandFromPitcherName(pname) : ''
        if (thName === 'R' || thName === 'L') th = thName
      }
      const vsHand: 'R' | 'L' | 'unknown' = th === 'R' ? 'R' : th === 'L' ? 'L' : 'unknown'
      if (paDump && gameId === dumpGameId) {
        const rtAgg = plateAppearanceLastResultText(paForAgg)
        paDump.push({
          gameId,
          paId: String(pa.paId ?? ''),
          inningHalf: String((pa as any)?.inningHalf ?? ''),
          vsHand,
          yahooPitcherId: String(pid ?? ''),
          pitcherThrowHand: th === 'R' || th === 'L' ? th : '',
          resultText: rtAgg,
          isAtBat: Boolean(rtAgg && isAtBat(rtAgg)),
          hitBases: rtAgg ? hitBases(rtAgg) : 0,
        })
      }
      if (needBackfill && backfilledResultSamples.length < 30) {
        backfilledResultSamples.push({
          gameId,
          paId: String(pa.paId ?? ''),
          vsHand,
          rawLine,
          inferredResult,
        })
      }
      // ヒット種別の判定が追いつかないケースをサンプル収集（H が少なくなる原因）
      const rt = plateAppearanceLastResultText(paForAgg)
      if (
        unparsedAtBatSamples.length < 30 &&
        rt &&
        isAtBat(rt) &&
        hitBases(rt) === 0 &&
        // 何らかの「打った」ニュアンスがあるのに安打/長打として拾えていない可能性
        /(打|飛|ゴロ|ライナー|線|前|間|スタンド)/.test(rt) &&
        !/(四球|申告敬遠|敬遠|死球|犠打|犠飛|犠牲フライ|犠牲飛)/.test(rt)
      ) {
        unparsedAtBatSamples.push({
          gameId,
          paId: String(pa.paId ?? ''),
          vsHand,
          resultText: rt,
        })
      }
      if (vsHand === 'R') updateVsHandFromPa(aggR, gameId, paForAgg)
      else if (vsHand === 'L') updateVsHandFromPa(aggL, gameId, paForAgg)
      else {
        unknownPitchers[pid] = (unknownPitchers[pid] ?? 0) + 1
        recordVsUnknownAbIfAtBat('pitcher_throw_hand_unknown', pid)
        updateVsHandFromPa(aggU, gameId, paForAgg)
      }
    }

    // ゲーム単位で battingLines（出場成績）と、PA 解析の合計がズレている試合を特定する
    if (perGameMismatchSamples.length < 30) {
      const bl = (mergedDoc.domain?.battingLines ?? []).find(
        (x: any) => String(x?.yahooPlayerId ?? '').trim() === bid
      ) as any
      const batterLine = bl
        ? {
            ab: Math.max(0, Math.trunc(Number(bl.ab ?? 0))),
            h: Math.max(0, Math.trunc(Number(bl.h ?? 0))),
            hr: Math.max(0, Math.trunc(Number(bl.hr ?? 0))),
            bb: Math.max(0, Math.trunc(Number(bl.bb ?? 0))),
            hbp: Math.max(0, Math.trunc(Number(bl.hbp ?? 0))),
            so: Math.max(0, Math.trunc(Number(bl.so ?? 0))),
          }
        : null

      const parsed = { ab: 0, h: 0, hr: 0, bb: 0, hbp: 0, so: 0 }
      const suspectPa: Array<{ paId: string; vsHand: 'R' | 'L' | 'unknown'; resultText: string }> = []
      for (const pa of pas) {
        // ここでは投手の左右ではなく、打席の結果分類が合っているかを見たい
        const rt = plateAppearanceLastResultText(pa)
        if (!rt) continue
        if (isWalkLikeResultText(rt)) parsed.bb += 1
        if (isStrikeoutResultJa(rt)) parsed.so += 1
        if (/死球/.test(rt)) parsed.hbp += 1
        if (isAtBat(rt)) {
          parsed.ab += 1
          const bases = hitBases(rt)
          if (bases > 0) parsed.h += 1
          if (bases === 4) parsed.hr += 1
          // 打ったっぽいのに安打として拾えていない候補を貯める
          if (suspectPa.length < 20 && bases === 0 && !/四球|申告敬遠|敬遠|死球|犠打|犠飛|犠牲フライ|犠牲飛/.test(rt)) {
            const paId = String(pa.paId ?? '')
            const pid = yahooPitcherIdForVsHandFromPa(pa)
            const th = pid ? pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, mentioned) : ''
            const vsHand: 'R' | 'L' | 'unknown' = th === 'R' ? 'R' : th === 'L' ? 'L' : 'unknown'
            suspectPa.push({ paId, vsHand, resultText: rt })
          }
        }
      }

      if (batterLine) {
        const mismatch =
          batterLine.ab !== parsed.ab ||
          batterLine.h !== parsed.h ||
          batterLine.hr !== parsed.hr ||
          batterLine.bb !== parsed.bb ||
          batterLine.hbp !== parsed.hbp ||
          batterLine.so !== parsed.so
        if (mismatch) {
          perGameMismatchSamples.push({
            gameId,
            batterLine,
            parsed,
            suspectPa,
          })
        }
      }
    }

    // Phase 25/26: 試合単位の Δ 検算。
    // 当該打者に battingLines（出場成績）行があれば、通算（Phase 11）と同一のハイブリッド
    // 集計で得られる P0 を “正” として、PA 経路で出した R/L/unknown の合計と差分を取る。
    //
    // - 取りこぼし（target > current, Phase 25）: 不明バケツへ加算し合計を通算と一致させる。
    // - 二重計上（target < current, Phase 26）: 当該試合の不明バケツから |Δ| を差し引く。
    //   不明バケツに在庫が無い分は R/L には触らず「未吸収（negativeUnabsorbedDelta）」として記録。
    //   これは canonical の plateAppearances に「実体のない幽霊 PA」（yahooPitcherId・pitchEvents・
    //   resultSummaryJa が無い空エントリ）が混入し、textPlayByPlay バックフィルで結果だけ復元され、
    //   battingLines が知らない 1 PA が vs_hand に積まれるパターンに効く（佐藤 都志也の試合 2021038786 等）。
    const target = computeBattingTargetForGameAndBatter(mergedDoc, bid)
    if (target) {
      const snapAfterR = p0FromAgg(aggR)
      const snapAfterL = p0FromAgg(aggL)
      const snapAfterU = p0FromAgg(aggU)
      const gameR = p0Delta(snapAfterR, snapBeforeR)
      const gameL = p0Delta(snapAfterL, snapBeforeL)
      const gameU = p0Delta(snapAfterU, snapBeforeU)
      const current = p0Add(p0Add(gameR, gameL), gameU)
      const delta = p0Delta(p0FromTarget(target), current)
      if (p0HasPositive(delta)) {
        const applied = applyPositiveP0DeltaToAggUnknown(aggU, delta, gameId)
        reconciliation.backfilledGames += 1
        reconciliation.appliedDelta = p0Add(reconciliation.appliedDelta, applied)
      }
      if (p0HasNegative(delta)) {
        reconciliation.negativeDeltaGames += 1
        const neg = p0NegativeOnly(delta)
        reconciliation.negativeDelta = p0Add(reconciliation.negativeDelta, neg)
        const subtracted = applyNegativeP0DeltaFromGameBuckets(
          aggR,
          aggL,
          aggU,
          gameR,
          gameL,
          gameU,
          delta,
        )
        reconciliation.negativeAppliedDelta = p0Add(reconciliation.negativeAppliedDelta, subtracted)
        const unabsorbed: P0Counts = {
          pa: -neg.pa - subtracted.pa,
          ab: -neg.ab - subtracted.ab,
          bb: -neg.bb - subtracted.bb,
          hbp: -neg.hbp - subtracted.hbp,
          sh: -neg.sh - subtracted.sh,
          sf: -neg.sf - subtracted.sf,
        }
        reconciliation.negativeUnabsorbedDelta = p0Add(reconciliation.negativeUnabsorbedDelta, unabsorbed)
        if (reconciliation.negativeDeltaSamples.length < 20) {
          reconciliation.negativeDeltaSamples.push({ gameId, delta: { ...delta } })
        }
      }

      // Phase 27: 当該試合の H/HR を target に揃える。
      // - 過剰（hGapDelta < 0）: R/L/U バケツから整合的に減算（hr→h→tb 連動）。
      // - 不足（hGapDelta > 0）: 不明バケツに加算（hr→h+4tb / 残り単打→h+1tb）。
      // P0 の負 Δ 吸収を済ませた後にスナップショットを取り直す。
      const snapAfterHR = hFromAgg(aggR)
      const snapAfterHL = hFromAgg(aggL)
      const snapAfterHU = hFromAgg(aggU)
      const gameHR = hDelta(snapAfterHR, snapBeforeHR)
      const gameHL = hDelta(snapAfterHL, snapBeforeHL)
      const gameHU = hDelta(snapAfterHU, snapBeforeHU)
      const currentH = hAdd(hAdd(gameHR, gameHL), gameHU)
      const hGapDelta = { h: target.h - currentH.h, hr: target.hr - currentH.hr }
      if (hGapDelta.h < 0 || hGapDelta.hr < 0) {
        const applied = applyNegativeHGapFromGameBuckets(
          aggR,
          aggL,
          aggU,
          gameHR,
          gameHL,
          gameHU,
          hGapDelta,
        )
        reconciliation.negativeHrApplied += applied.hr
        reconciliation.negativeHApplied += applied.h
      }
      if (hGapDelta.h > 0 || hGapDelta.hr > 0) {
        const applied = applyPositiveHGapToAggUnknown(aggU, hGapDelta)
        reconciliation.positiveHrApplied += applied.hr
        reconciliation.positiveHApplied += applied.h
      }
    }
  }
  const rows: SeasonStatsRow[] = []
  // Phase 27: PA=0 でも H/HR が補完されるケース（target.pa は揃っているが HR/H だけ phase11 が上回る）
  // を行として出力するため、`pa > 0` だけでなく H/HR が積まれている場合も rows に含める。
  const hasAnyAgg = (a: BattingSeasonAggYahoo): boolean => a.pa > 0 || a.h > 0 || a.hr > 0
  if (hasAnyAgg(aggR)) rows.push(aggToVsHandRow('R', aggR))
  if (hasAnyAgg(aggL)) rows.push(aggToVsHandRow('L', aggL))
  if (hasAnyAgg(aggU)) rows.push(aggToVsHandRow('unknown', aggU))
  return {
    rows,
    unknownPitchers,
    missingPitcherIdPas,
    missingPitcherIdSamples,
    inferredPitcherIdPas,
    inferredPitcherIdFromTextPas,
    backfilledResultSamples,
    unparsedAtBatSamples,
    perGameMismatchSamples,
    reconciliation,
    vsUnknownAbSamples,
    paDump: dumpGameId ? paDump : undefined,
  }
}

/**
 * `docs/plan_unified_ranking_personal_stats_phases.md` Phase 2 — SSOT
 *
 * ランキング Phase 12 と同じ `aggregateBattingSeasonByYahooBatter` →
 * `buildEnrichedBattingSeasonRow`（`lib/yahooGame/canonicalBattingSeasonAgg.ts`）の結果を、
 * 個人 API の通算として使う。実行時に canonical を再走査しないため、Phase 11 が書いた JSON の total 行をそのまま採用する。
 */
export type BattingTotalRowSource = 'phase11' | 'csv' | 'batting_lines_fallback' | null

export function resolveBattingTotalRowForProfileApi(
  phase11Rows: SeasonStatsRow[],
  csvAll: SeasonStatsRow[]
): { row: SeasonStatsRow | null; source: BattingTotalRowSource } {
  const phase11Total = phase11Rows.find(
    (r) => r.split_type === 'total' && r.split_value === 'total'
  )
  if (phase11Total) {
    return { row: normalizeDerivedRowLabels(phase11Total), source: 'phase11' }
  }
  const csvTotal = csvAll.find(
    (r) => r.split_type === 'total' && r.split_value === 'total'
  )
  if (csvTotal) return { row: csvTotal, source: 'csv' }
  return { row: null, source: null }
}

/**
 * Phase 11（一球由来）が無いとき、canonical の出場成績行だけで通算を組む（個人 API 用）。
 * 球種・コース・得点圏などは揃わない。
 */
function computeBattingTotalFromBattingLinesFallback(yahooId: string): SeasonStatsRow | null {
  const docs = loadCanonicalGames(getProjectRoot())
  const byBatter = aggregateBattingSeasonByYahooBatterFromBattingLines(docs)
  const agg = byBatter.get(yahooId)
  if (!agg) return null
  if (agg.pa === 0 && agg.ab === 0) return null
  return buildEnrichedBattingSeasonRow(agg)
}

/** `_data/derived/player_season_batting/{year}/yahoo_*.json`（Phase 11） */
export function loadPhase11DerivedBattingRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_season_batting',
    year,
    `yahoo_${yahooId}.json`
  )
  if (!fs.existsSync(jsonPath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { rows?: SeasonStatsRow[] }
    const rows = raw.rows ?? []
    return rows.map(normalizeDerivedRowLabels)
  } catch {
    return []
  }
}

/** `_data/derived/player_season_batting_context/{year}/yahoo_*.json`（Phase 13） */
export function loadPhase13ContextBattingRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_season_batting_context',
    year,
    `yahoo_${yahooId}.json`
  )
  if (!fs.existsSync(jsonPath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { rows?: SeasonStatsRow[] }
    const rows = raw.rows ?? []
    return rows.map(normalizeDerivedRowLabels)
  } catch {
    return []
  }
}

/** `_data/derived/player_season_batting_splits/{year}/yahoo_*.json`（Phase 15: 打席別巡目等） */
export function loadPhase15BattingSplitRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_season_batting_splits',
    year,
    `yahoo_${yahooId}.json`
  )
  if (!fs.existsSync(jsonPath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { rows?: SeasonStatsRow[] }
    const rows = raw.rows ?? []
    return rows.map(normalizeDerivedRowLabels)
  } catch {
    return []
  }
}

/** `_data/derived/player_season_batting_count/{year}/yahoo_*.json`（Phase 16: カウント別） */
export function loadPhase16BattingCountRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_season_batting_count',
    year,
    `yahoo_${yahooId}.json`
  )
  if (!fs.existsSync(jsonPath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { rows?: SeasonStatsRow[] }
    const rows = raw.rows ?? []
    return rows.map(normalizeDerivedRowLabels)
  } catch {
    return []
  }
}

/** `_data/derived/player_season_batting_period/{year}/yahoo_*.json`（Phase 17: 月間・週間） */
export function loadPhase17BattingPeriodRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    getProjectRoot(),
    '_data',
    'derived',
    'player_season_batting_period',
    year,
    `yahoo_${yahooId}.json`
  )
  if (!fs.existsSync(jsonPath)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as { rows?: SeasonStatsRow[] }
    const rows = raw.rows ?? []
    return rows.map(normalizeDerivedRowLabels)
  } catch {
    return []
  }
}

/**
 * 通算行（split_type=total）は Phase 11（canonical 派生）を唯一の正とする（ランキング Phase 12 と同一 aggregate）。
 * パイロット CSV の通算行は無視する。CSV には通算以外の行だけが残る場合がある。
 * Phase 11 が無いときのみ CSV の通算をフォールバック（canonical 未収録のオープン戦のみ等）。
 *
 * Phase 2（`docs/plan_unified_ranking_personal_stats_phases.md`）: 通算・基本指標は Phase 11 ファイル上の
 * `buildEnrichedBattingSeasonRow` 出力をそのまま使い、二重の `enrichSeasonStatsRowSabermetrics` をかけない。
 * 派生行のマージ（CSV と Phase 13/15/16/17）のみ本関数の責務とする。
 *
 * Phase 13 のコンテキスト行（球場・対チーム・ホーム/ビジター。vs_hand は含まない）は CSV とキーが重ならない分だけ付与する。
 * Phase 15 の打席別（巡目）・打順別行は CSV とキーが重なる場合は Phase 15 を優先する。
 * Phase 16 のカウント別行も同様。
 * Phase 17 の月間・週間行も同様。
 *
 * 通算が Phase 11 / CSV のどちらにも無いときは **canonical の出場成績行**でフォールバックし、
 * `battingTotalRowSource === 'batting_lines_fallback'` とする（UI で「一球未連携」を明示）。
 */
export type MergePilotSeasonStatsResult = {
  rows: SeasonStatsRow[]
  battingTotalRowSource: BattingTotalRowSource
  /** 通算と対左右合算の pa/ab/h 突合。null は total または vs_hand が無いとき */
  battingVsHandReconciliation: BattingVsHandTotalReconciliation | null
}

export function mergePilotSeasonStatsWithDerived(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): MergePilotSeasonStatsResult {
  const csvAll = loadPilotBattingStats(yahooId)
  const csvNonTotal = csvAll.filter(
    (r) => !(r.split_type === 'total' && r.split_value === 'total')
  )
  const phase11 = loadPhase11DerivedBattingRows(yahooId, year)
  const phase13 = loadPhase13ContextBattingRows(yahooId, year)
  const phase15 = loadPhase15BattingSplitRows(yahooId, year)
  const phase16 = loadPhase16BattingCountRows(yahooId, year)
  const phase17 = loadPhase17BattingPeriodRows(yahooId, year)

  // 実務方針: 打撃の表示は canonical→derived（Phase11/13/15/16/17）を唯一の正とする。
  // pilot CSV は欠損・更新遅延があり得るため、Phase11 がある限り UI 集計に混ぜない。
  // （Phase11 が無いときのみ、従来どおり CSV 非通算をフォールバックとして使う）
  let out: SeasonStatsRow[] = []
  if (phase11.length > 0) {
    out = phase11
      .filter((r) => !(r.split_type === 'total' && r.split_value === 'total'))
      .map(normalizeDerivedRowLabels)
  } else {
    out = [...csvNonTotal]
  }

  // 対左右別（vs_hand）は現状 canonical 派生（Phase11/13/15/16/17）側に無い場合がある。
  // UI 側は split_type=vs_hand を参照するため、派生に無いときのみ pilot CSV から最小限フォールバックする。
  const hasVsHand = out.some((r) => r.split_type === 'vs_hand')
  if (!hasVsHand) {
    const vsHandRows = csvNonTotal.filter((r) => r.split_type === 'vs_hand')
    for (const row of vsHandRows) out.push(normalizeDerivedRowLabels(row))
  }
  const phase13KeySet = new Set(phase13.map((r) => `${r.split_type}\t${r.split_value}`))
  out = out.filter((r) => !phase13KeySet.has(`${r.split_type}\t${r.split_value}`))
  for (const row of phase13) {
    out.push(normalizeDerivedRowLabels(row))
  }
  const phase15KeySet = new Set(phase15.map((r) => `${r.split_type}\t${r.split_value}`))
  out = out.filter((r) => !phase15KeySet.has(`${r.split_type}\t${r.split_value}`))
  for (const row of phase15) {
    out.push(normalizeDerivedRowLabels(row))
  }
  const phase16KeySet = new Set(phase16.map((r) => `${r.split_type}\t${r.split_value}`))
  out = out.filter((r) => !phase16KeySet.has(`${r.split_type}\t${r.split_value}`))
  for (const row of phase16) {
    out.push(normalizeDerivedRowLabels(row))
  }
  const phase17KeySet = new Set(phase17.map((r) => `${r.split_type}\t${r.split_value}`))
  out = out.filter((r) => !phase17KeySet.has(`${r.split_type}\t${r.split_value}`))
  for (const row of phase17) {
    out.push(normalizeDerivedRowLabels(row))
  }

  // root fix: 対左右別（vs_hand）は実況/一球ログ由来（canonical）から再構築する。
  // 既に Phase 13 等の派生に vs_hand が入っていても、投手交代の取り込み差などでズレる可能性があるため、
  // プロファイル API では常にランタイム再集計を優先し、取得できた分だけ置き換える。
  // ただしランタイム再集計は重く、個人ページ表示（特に開発時）をタイムアウトさせ得るため、
  // 既定では無効。必要なときのみ環境変数で有効化する。
  if (process.env.TOPPAGE_ENABLE_RUNTIME_VS_HAND === '1') {
    const runtimeVsHand = loadVsHandRowsFromCanonicalWithDebug(yahooId).rows.map(normalizeDerivedRowLabels)
    if (runtimeVsHand.length > 0) {
      out = out.filter((r) => r.split_type !== 'vs_hand')
      for (const row of runtimeVsHand) out.push(row)
    }
  }

  let { row: totalRow, source: totalSource } = resolveBattingTotalRowForProfileApi(
    phase11,
    csvAll
  )
  if (!totalRow) {
    const fb = computeBattingTotalFromBattingLinesFallback(yahooId)
    if (fb) {
      totalRow = fb
      totalSource = 'batting_lines_fallback'
    }
  }

  const total = totalRow ? [totalRow] : []
  const rest = out
    .filter((r) => !(r.split_type === 'total' && r.split_value === 'total'))
    .sort((a, b) => {
      if (a.split_type !== b.split_type) return a.split_type.localeCompare(b.split_type)
      return a.split_value.localeCompare(b.split_value)
    })
  const merged = [...total, ...rest].map((r) => {
    return enrichSeasonStatsRowSabermetrics(r)
  })
  const battingVsHandReconciliation = computeBattingVsHandTotalReconciliation(merged)
  return { rows: merged, battingTotalRowSource: totalSource, battingVsHandReconciliation }
}

function fmtSlash3(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '.000'
  const s = n.toFixed(3)
  return s.startsWith('0') ? s.slice(1) : s
}

function int(v: unknown): number {
  const n = parseInt(String(v ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

function computeBattingFromPaRows(rows: Array<Record<string, string>>) {
  const paRows = rows.filter((r) => r.is_pa === '1')
  const gameIds = new Set(paRows.map((r) => r.game_id).filter(Boolean))

  const ab = paRows.reduce((acc, r) => acc + int(r.ab), 0)
  const h2 = paRows.reduce((acc, r) => acc + int(r.h2), 0)
  const h3 = paRows.reduce((acc, r) => acc + int(r.h3), 0)
  const hr = paRows.reduce((acc, r) => acc + int(r.hr), 0)
  const h =
    paRows.reduce((acc, r) => acc + int(r.h), 0) +
    h2 +
    h3 +
    hr
  const h1 = Math.max(0, h - h2 - h3 - hr)

  const bb = paRows.reduce((acc, r) => acc + int(r.bb), 0)
  const ibb = paRows.reduce((acc, r) => acc + int(r.ibb), 0)
  const hbp = paRows.reduce((acc, r) => acc + int(r.hbp), 0)
  const so = paRows.reduce((acc, r) => acc + int(r.so), 0)
  const sh = paRows.reduce((acc, r) => acc + int(r.sh), 0)
  const sf = paRows.reduce((acc, r) => acc + int(r.sf), 0)
  const gidp = paRows.reduce((acc, r) => acc + int(r.gidp), 0)
  const rbi = paRows.reduce((acc, r) => acc + int(r.rbi), 0)
  const r = paRows.reduce((acc, r) => acc + int(r.r), 0)
  const sb = paRows.reduce((acc, r) => acc + int(r.sb), 0)
  const cs = paRows.reduce((acc, r) => acc + int(r.cs), 0)

  const pa = paRows.length
  const tb = h1 + h2 * 2 + h3 * 3 + hr * 4

  const avg = ab > 0 ? h / ab : null
  const obpDen = ab + bb + hbp + sf
  const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null
  const slg = ab > 0 ? tb / ab : null
  const ops = obp != null ? obp + (ab > 0 ? tb / ab : 0) : null

  return {
    g: gameIds.size,
    pa,
    ab,
    r,
    h,
    h2,
    h3,
    hr,
    tb,
    rbi,
    so,
    bb,
    ibb,
    hbp,
    sh,
    sf,
    sb,
    cs,
    gidp,
    avg: fmtSlash3(avg),
    obp: fmtSlash3(obp),
    slg: fmtSlash3(slg),
    ops: fmtSlash3(ops),
  }
}

export function loadPilotRispStats(yahooId: string, date: string) {
  if (yahooId !== PILOT_PLAYER_YAHOO_ID) return null
  const csvPath = path.join(getProjectRoot(), '_data', 'yahoo_games_pilot', 'plate_appearances_normalized.csv')
  if (!fs.existsSync(csvPath)) return null

  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const headers = lines[0].split(',').map((h) => h.trim())

  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    if (row.batter_id !== yahooId) continue
    if (row.date !== date) continue
    rows.push(row)
  }

  const rispRows = rows.filter((r) => r.risp === '1')
  const noRispRows = rows.filter((r) => r.risp !== '1')
  return {
    risp: computeBattingFromPaRows(rispRows),
    no_risp: computeBattingFromPaRows(noRispRows),
  }
}

export function loadPilotBattingStats(yahooId: string): SeasonStatsRow[] {
  const csvPath = path.join(
    getProjectRoot(),
    '_data',
    'yahoo_games_pilot',
    'batting_stats.csv'
  )
  if (!fs.existsSync(csvPath)) return []

  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: SeasonStatsRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    if (row.player_id !== yahooId) continue

    const splitType = row.split_type || ''
    const splitValue = row.split_value || ''
    const h1 = parseInt(row.h1 || '0', 10)
    const h2 = parseInt(row.h2 || '0', 10)
    const h3 = parseInt(row.h3 || '0', 10)
    const hr = parseInt(row.hr || '0', 10)
    const tb = h1 + h2 * 2 + h3 * 3 + hr * 4
    rows.push({
      split_type: splitType,
      split_value: splitValue,
      split_label: formatSplitLabel(splitType, splitValue),
      g: parseInt(row.g || '0', 10),
      pa: parseInt(row.pa || '0', 10),
      ab: parseInt(row.ab || '0', 10),
      r: parseInt(row.r || '0', 10),
      h: parseInt(row.h || '0', 10),
      h1,
      h2,
      h3,
      hr,
      tb,
      rbi: parseInt(row.rbi || '0', 10),
      so: parseInt(row.so || '0', 10),
      bb: parseInt(row.bb || '0', 10),
      ibb: parseInt(row.ibb || '0', 10),
      hbp: parseInt(row.hbp || '0', 10),
      sh: parseInt(row.sh || '0', 10),
      sf: parseInt(row.sf || '0', 10),
      sb: parseInt(row.sb || '0', 10),
      cs: parseInt(row.cs || '0', 10),
      e: parseInt(row.e || '0', 10),
      gidp: parseInt(row.gidp || '0', 10),
      avg: row.avg || '.000',
      obp: row.obp || '.000',
      slg: row.slg || '.000',
      ops: row.ops || '.000',
      risp_avg: row.risp_avg ?? '',
      risp_ab: parseInt(row.risp_ab || '0', 10),
      risp_h: parseInt(row.risp_h || '0', 10),
      sb_pct: row.sb_pct ?? '',
      isop: row.isop ?? '',
      isod: row.isod ?? '',
      babip: row.babip ?? '',
      bb_pct: row.bb_pct ?? '',
      k_pct: row.k_pct ?? '',
      bbk: row.bbk ?? '',
      gpa: row.gpa ?? '',
      rc: row.rc ?? '',
      xr: row.xr ?? '',
      seca: row.seca ?? '',
      ta: row.ta ?? '',
      noi: row.noi ?? '',
    })
  }

  // 通算を先頭に、それ以外は split_type, split_value 順
  const total = rows.filter((r) => r.split_type === 'total')
  const rest = rows
    .filter((r) => r.split_type !== 'total')
    .sort((a, b) => {
      if (a.split_type !== b.split_type) return a.split_type.localeCompare(b.split_type)
      return a.split_value.localeCompare(b.split_value)
    })
  return [...total, ...rest]
}

export function loadPilotBlocksData(yahooId: string): PilotBlocksData | null {
  if (yahooId !== PILOT_PLAYER_YAHOO_ID) return null
  const jsonPath = path.join(getProjectRoot(), '_data', 'yahoo_games_pilot', 'kikuchi_20260304_blocks.json')
  if (!fs.existsSync(jsonPath)) return null
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8')
    return JSON.parse(raw) as PilotBlocksData
  } catch {
    return null
  }
}

/** 名簿野手で Yahoo パイロット未連携のとき、見出し・表用の空の通算行 */
export function createPlaceholderTotalSeasonRow(): SeasonStatsRow {
  return createFielderPlaceholderTotalRow() as SeasonStatsRow
}