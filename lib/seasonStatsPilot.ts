/**
 * Phase 4: パイロット今季成績
 * 個人ページ向けシーズン成績のマージ（正は Phase11/13/15/16/17 派生 JSON）。旧 pilot CSV は廃止。
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
import { findRosterPlayerByPublicId } from '@/lib/npbRoster'
import { resolvePlayerSlugEntry } from '@/lib/playerSlug.server'
import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from '@/lib/derived/fetchDerivedJsonServer'
import { invalidateYahooNpbBatterMapsCache, resolveYahooPilotIdForStats, resolveYahooPilotIdForStatsAsync } from '@/lib/yahooNpbBatterIdMap'
import { formatWeekRangeTueToSunFromTuesdayYmd } from '@/lib/yahooGame/jstPeriodKeys'
import {
  aggregateBattingSeasonByYahooBatterFromBattingLines,
  buildEnrichedBattingSeasonRow,
  computeBattingTargetForGameAndBatter,
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  plateAppearanceResultTextForVsHand,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
  type BattingTargetForGameAndBatter,
} from '@/lib/yahooGame/canonicalBattingSeasonAgg'
import { loadCanonicalGames } from '@/lib/yahooGame/loadCanonicalGames'
import type { CanonicalGameDocument, PlateAppearance } from '@/lib/yahooGame/types'
import { isWalkLikeResultText } from '@/lib/baseballWalkResult'
import { isStrikeoutResultJa } from '@/lib/yahooGame/paOutcomeResultJa'
import { hitBases, isAtBat } from '@/lib/yahooGame/resultJaHitBases'
import {
  pitcherThrowHandFromJaNameHint,
  pitcherThrowHandRLFromYahooPitcherIdWithMentioned,
} from '@/lib/yahooGame/batterHandFromCanonical'
import { defendingTeamFullNameFromPlateAppearance } from '@/lib/yahooGame/inferTeamsFromTextPbp'
import { parseCellResultToContribution } from '@/lib/yahooGame/cellResultToContribution'
import { resolvePitchersForBatterInning } from '@/lib/yahooGame/pitcherIntervalsFromPitchingLines'
import { parsePaId, teamForYahooPlayerId } from '@/lib/yahooGame/pitcherPocHelpers'
import { injectTeamsFromTextPbpIfMissing } from '@/lib/yahooGame/inferTeamsFromTextPbp'
import { yahooPitcherIdForVsHandFromPa } from '@/lib/yahooGame/yahooPitcherIdForVsHandFromPa'
import {
  buildPitcherIdByPaIdFromTextTimeline,
  enrichPlateAppearancesWithResolvedPitcherIds,
  resolvePitcherIdForPlateAppearance,
} from '@/lib/yahooGame/resolvePitcherIdByPaId'
import { mergePhase10IntoCanonical, type Phase10PitchRow } from '@/lib/yahooGame/mergePhase10FromPitchRows'
import { inferStrictResultJaFromSportsnaviPlayLineForVsHand } from '@/lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay'
import { dedupePlateAppearancesByInningHalfOrder } from '@/lib/yahooGame/dedupePlateAppearances'
export { dedupePlateAppearancesByInningHalfOrder }
import { getProjectRoot } from '@/lib/projectRoot'
import type { BattingVsHandTotalReconciliation, PilotBlocksData, SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
import {
  computeBattingVsHandTotalReconciliation,
  DERIVED_SEASON_YEAR_DEFAULT,
  enrichSeasonStatsRowSabermetrics,
} from '@/lib/seasonStatsPilotShared'
import { battingSlashRatesFromCounts, slashRate3FromCounts } from '@/lib/battingRateFormat'

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
  const slugEntry = resolvePlayerSlugEntry(trimmed)
  if (slugEntry?.npbPlayerId) {
    const y = resolveYahooPilotIdForStats(slugEntry.npbPlayerId)
    if (y) return y
  }
  return null
}

/** Vercel 本番: ローカル bridge CSV が無いとき R2 meta から NPB→Yahoo を解決 */
export async function getYahooIdForPilotAsync(playerIdOrName: string): Promise<string | null> {
  const sync = getYahooIdForPilot(playerIdOrName)
  if (sync) return sync
  const trimmed = String(playerIdOrName || '').trim()
  if (!trimmed) return null
  const fromBridge = await resolveYahooPilotIdForStatsAsync(trimmed)
  if (fromBridge) return fromBridge
  const rosterPlayer = findRosterPlayerByPublicId(trimmed)
  if (rosterPlayer?.npb_player_id) {
    return resolveYahooPilotIdForStatsAsync(rosterPlayer.npb_player_id)
  }
  const slugEntry = resolvePlayerSlugEntry(trimmed)
  if (slugEntry?.npbPlayerId) {
    return resolveYahooPilotIdForStatsAsync(slugEntry.npbPlayerId)
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
  if (splitType === 'starter_field') return splitValue
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
        split_label: formatSplitLabel(row.split_type, row.split_value),
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

/** 対左右: 出場成績 zip を正としつつ、欠損打席は実況／要約へ限定フォールバック（Phase 11 通算は変更しない）。 */
function updateVsHandFromPa(
  agg: BattingSeasonAggYahoo,
  gameId: string,
  pa: PlateAppearance,
  doc: CanonicalGameDocument,
): void {
  const result = plateAppearanceResultTextForVsHand(doc, pa)
  if (!result) return
  agg.gameIds.add(gameId)
  agg.pa += 1
  updateBattingAggFromResultJa(agg, result)
}

function aggToVsHandRow(splitValue: 'R' | 'L' | 'unknown', agg: BattingSeasonAggYahoo): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
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
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
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
  /**
   * Phase 28: 出場成績テーブルの cells[14..]（回ごとの打席結果列）と
   * pitchingLines（ip 累積）を使って、不明バケツに行く前に R/L へ振り分けた量。
   * - `cellResolvedR/L`: 振り分けに成功した PA・AB・H・HR・BB・HBP・SH・SF の合計。
   * - `cellAmbiguousPas`: 該当回に複数投手登板で曖昧と判定し不明にフォールバックした PA 数。
   * - `cellPitcherHandUnknownPas`: 投手 ID は特定したが利き腕が取れなかった PA 数。
   * - `cellMissingTextPas`: cells 自体が空で text を取れなかった不明 PA 数（戻り場所が無い）。
   */
  cellResolvedR: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number; h: number; hr: number; tb: number }
  cellResolvedL: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number; h: number; hr: number; tb: number }
  cellAmbiguousPas: number
  cellPitcherHandUnknownPas: number
  cellMissingTextPas: number
  /** Phase 28: 打者のチーム自体が判定できず投手区間を引けなかった PA 数 */
  cellTeamUnresolvedPas: number
  /** Phase 28 (追加): teamUnresolved の発生サンプル（最大 10 件、原因切り分け用） */
  cellTeamUnresolvedSamples: Array<{
    gameId: string
    inning: number
    cellText: string
    rosterTeam: string
    scoreboardVisitor: string
    scoreboardHome: string
    paCountForBatter: number
  }>
  /** Phase 30 (追加): cellAmbiguous の発生サンプル（最大 10 件、原因切り分け用） */
  cellAmbiguousSamples: Array<{
    gameId: string
    inning: number
    cellText: string
    batterTeam: string
    candidatePitchers: Array<{ id: string; hand: 'R' | 'L' | '' }>
  }>
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
  const emptyCellResolved = () => ({ pa: 0, ab: 0, bb: 0, hbp: 0, sh: 0, sf: 0, h: 0, hr: 0, tb: 0 })
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
    cellResolvedR: emptyCellResolved(),
    cellResolvedL: emptyCellResolved(),
    cellAmbiguousPas: 0,
    cellPitcherHandUnknownPas: 0,
    cellMissingTextPas: 0,
    cellTeamUnresolvedPas: 0,
    cellTeamUnresolvedSamples: [],
    cellAmbiguousSamples: [],
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
  const reconciliation: VsHandReconciliationDebug = emptyReconciliation()
  let seasonTargetP0 = emptyP0()
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

  const throwHandFromPitcherName = (
    name: string,
    defendingTeamFullName: string,
  ): 'R' | 'L' | '' =>
    pitcherThrowHandFromJaNameHint(String(name ?? '').trim(), {
      defendingTeamFullName,
    })

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

  const resultFromPaTextLine = (line: string): string =>
    inferStrictResultJaFromSportsnaviPlayLineForVsHand(line)

  const docHasBatterSignal = (doc: CanonicalGameDocument): boolean => {
    for (const pa of doc.domain?.plateAppearances ?? []) {
      if (String(pa?.yahooBatterId ?? '').trim() === bid) return true
    }
    for (const line of doc.domain?.battingLines ?? []) {
      if (String(line?.yahooPlayerId ?? '').trim() === bid) return true
    }
    for (const row of doc.game?.statsPlayerLinkedRows ?? []) {
      if (String(row?.yahooPlayerId ?? '').trim() === bid) return true
    }
    const mentioned = doc.game?.yahooPlayersMentioned ?? {}
    return Boolean(String((mentioned as Record<string, unknown>)[bid] ?? '').trim())
  }

  for (const doc of docs) {
    if (!docHasBatterSignal(doc)) continue
    const gid = String(doc.gameId ?? '').trim()
    // Phase 28: canonical の scoreboard / teams は現行ビルダーが空のまま生成するため、
    // 試合前情報テキスト（"先攻:X..." / "後攻:Y..."）から軽量パースして補強する。
    // 既に埋まっている場合は idempotent（元の doc が返る）。
    const baseMerged =
      options?.mergedDocsByGameId?.get(gid) ?? mergePhase10RestoredIntoDocIfPresent(doc)
    const mergedDoc = enrichPlateAppearancesWithResolvedPitcherIds(
      injectTeamsFromTextPbpIfMissing(baseMerged),
    )
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

    for (const pa of pas) {
      // 結果欠損の打席は実況行から補完する。
      // 同じ pa を使わないと、通算(Phase11)と対左右の合計安打が食い違う（例: 黒川 1900113）。
      // 要約・一球のいずれでも結果が取れないときは実況行から補完（pitchEvents だけあるが最終球が空、等）
      const needBackfill = !plateAppearanceResolvedResultText(mergedDoc, pa).trim()
      const rawLine = needBackfill ? paTextLine(mergedDoc, pa.paId) : ''
      const inferredResult = needBackfill ? resultFromPaTextLine(rawLine) : ''
      const paForAgg: PlateAppearance =
        needBackfill && inferredResult ? { ...pa, resultSummaryJa: inferredResult } : pa

      const recordVsUnknownAbIfAtBat = (
        reason: VsUnknownAbSample['reason'],
        yahooPitcherIdForSample: string,
      ) => {
        if (!vsUnknownAbSamples || vsUnknownAbSamples.length >= 40) return
        const rtAgg = plateAppearanceResultTextForVsHand(mergedDoc, paForAgg)
        if (!isAtBat(rtAgg)) return
        vsUnknownAbSamples.push({
          gameId,
          paId: String(pa.paId ?? ''),
          yahooPitcherId: yahooPitcherIdForSample,
          reason,
          resultSummary: rtAgg,
        })
      }

      const resolved = resolvePitcherIdForPlateAppearance(
        mergedDoc,
        paForAgg,
        pitcherIdByPaIdFromText,
      )
      let pid = resolved.pitcherId
      if (resolved.source === 'text_timeline' || resolved.source === 'pa_line') {
        inferredPitcherIdFromTextPas += 1
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
        updateVsHandFromPa(aggU, gameId, paForAgg, mergedDoc)
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
      const defendingTeam = defendingTeamFullNameFromPlateAppearance(mergedDoc, paForAgg)
      let th = pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, mentioned, {
        defendingTeamFullName: defendingTeam,
      })
      // 橋渡し/mentioned が無いときは raw_yahoo_text の投手名で名簿照合
      if (!th && pitcherNameFromRawYahooText) {
        const pname = pitcherNameFromRawYahooText(pid)
        const thName = pname ? throwHandFromPitcherName(pname, defendingTeam) : ''
        if (thName === 'R' || thName === 'L') th = thName
      }
      const vsHand: 'R' | 'L' | 'unknown' = th === 'R' ? 'R' : th === 'L' ? 'L' : 'unknown'
      if (paDump && gameId === dumpGameId) {
        const rtAgg = plateAppearanceResultTextForVsHand(mergedDoc, paForAgg)
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
      const rt = plateAppearanceResultTextForVsHand(mergedDoc, paForAgg)
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
      if (vsHand === 'R') updateVsHandFromPa(aggR, gameId, paForAgg, mergedDoc)
      else if (vsHand === 'L') updateVsHandFromPa(aggL, gameId, paForAgg, mergedDoc)
      else {
        unknownPitchers[pid] = (unknownPitchers[pid] ?? 0) + 1
        recordVsUnknownAbIfAtBat('pitcher_throw_hand_unknown', pid)
        updateVsHandFromPa(aggU, gameId, paForAgg, mergedDoc)
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
        const rt = plateAppearanceResultTextForVsHand(mergedDoc, pa)
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
            const th = pid
              ? pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, mentioned, {
                  defendingTeamFullName: defendingTeamFullNameFromPlateAppearance(mergedDoc, pa),
                })
              : ''
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
      seasonTargetP0 = p0Add(seasonTargetP0, p0FromTarget(target))
      let snapAfterR = p0FromAgg(aggR)
      let snapAfterL = p0FromAgg(aggL)
      let snapAfterU = p0FromAgg(aggU)
      let gameR = p0Delta(snapAfterR, snapBeforeR)
      let gameL = p0Delta(snapAfterL, snapBeforeL)
      let gameU = p0Delta(snapAfterU, snapBeforeU)
      let current = p0Add(p0Add(gameR, gameL), gameU)
      let delta = p0Delta(p0FromTarget(target), current)

      // Phase 28: 正の Δ を不明バケツへ流し込む手前で、出場成績テーブルの cells[14..]
      // （回ごとの打席結果列）から「不明 PA の発生回」を特定し、その回に登板していた
      // 投手を pitchingLines + ip 累積 で逆引きして R/L へ振り分ける。
      // - 同じ回に複数投手登板（半回中の交代）は曖昧なので不明にフォールバック。
      // - 投手 ID は取れたが利き腕未登録のケースも不明にフォールバック。
      // - cells[14+i] が空のときは復元できないので不明にフォールバック。
      if (p0HasPositive(delta)) {
        const cellRow = (mergedDoc.game?.statsPlayerLinkedRows ?? []).find(
          (r) => String(r?.yahooPlayerId ?? '').trim() === bid,
        )
        const cells = Array.isArray(cellRow?.cells) ? (cellRow!.cells as string[]).slice(14) : []
        if (cells.length > 0) {
          const existingByInning = new Map<number, number>()
          for (const pa of pas) {
            const parsed = parsePaId(String(pa.paId ?? ''))
            if (parsed) {
              existingByInning.set(parsed.inning, (existingByInning.get(parsed.inning) ?? 0) + 1)
            }
          }
          // 打者のチーム判定: スタメン外（代打のみ等）でも判定できるよう、複数経路で推定する。
          // 0) battingLines の登場順序から「visitor block / home block」の連続性で判定
          //    （Sportsnavi の battingLines は visitor → home の順で並ぶ慣例があり、
          //     直前の team を継承することで井上広大のような roster.team 不一致 batter も救える）
          // 1) startingLineup（teams[]）から
          // 2) この試合の plateAppearances の半回 × scoreboard.teamName から
          // 3) roster CSV（npb_roster_2026.csv）の team フィールドから
          // 4) 試合の plateAppearances の attack-side fallback
          // 5) visitor/home 両方を試して片方のみ resolve できる場合に採用
          const battingLineTeamByYid = (() => {
            const map = new Map<string, string>()
            const board = mergedDoc.game?.scoreboard ?? []
            const visitor = String(board[0]?.teamName ?? '').trim()
            const home = String(board[1]?.teamName ?? '').trim()
            if (!visitor || !home) return map
            let lastTeam = ''
            for (const bl of mergedDoc.domain?.battingLines ?? []) {
              const yid = String(bl.yahooPlayerId ?? '').trim()
              if (!yid) continue
              const r = findRosterPlayerByPublicId(yid)
              const rt = String(r?.team ?? '').trim()
              let team = ''
              if (rt && (rt === visitor || rt === home)) team = rt
              else if (lastTeam) team = lastTeam
              if (team) {
                map.set(yid, team)
                lastTeam = team
              }
            }
            return map
          })()
          let batterTeam = battingLineTeamByYid.get(bid) || teamForYahooPlayerId(mergedDoc, bid)
          if (!batterTeam) {
            const board = mergedDoc.game?.scoreboard ?? []
            if (board.length >= 2) {
              const visitor = String(board[0]?.teamName ?? '').trim()
              const home = String(board[1]?.teamName ?? '').trim()
              for (const pa of pas) {
                const parsed = parsePaId(String(pa.paId ?? ''))
                if (!parsed) continue
                if (parsed.half === 0 && visitor) {
                  batterTeam = visitor
                  break
                }
                if (parsed.half === 1 && home) {
                  batterTeam = home
                  break
                }
              }
            }
          }
          if (!batterTeam) {
            const rosterRow = findRosterPlayerByPublicId(bid)
            const rosterTeam = String(rosterRow?.team ?? '').trim()
            // scoreboard が visitor/home の 2 つを返している場合、roster.team は visitor/home の
            // どちらかと厳密一致する想定（移籍シーズンを除く）。
            const board = mergedDoc.game?.scoreboard ?? []
            if (rosterTeam && board.length >= 2) {
              const visitor = String(board[0]?.teamName ?? '').trim()
              const home = String(board[1]?.teamName ?? '').trim()
              if (rosterTeam === visitor || rosterTeam === home) {
                batterTeam = rosterTeam
              }
            }
          }
          if (!batterTeam) {
            // 4) 最後の砦: cells に打席結果があるイニングについて、試合全体の plateAppearances
            //    から「その inning の攻撃側半回」を引き、 visitor/home へ写像する。
            //    宮本丈のように本人の PA は空でも、他 batter の PA から半回が確定できれば
            //    batter team を特定できる（移籍打者・roster.team 不一致のケースも救済）。
            const board = mergedDoc.game?.scoreboard ?? []
            if (board.length >= 2) {
              const visitor = String(board[0]?.teamName ?? '').trim()
              const home = String(board[1]?.teamName ?? '').trim()
              const targetInnings = new Set<number>()
              for (let i = 0; i < cells.length; i++) {
                const t = String(cells[i] ?? '').trim()
                if (t) targetInnings.add(i + 1)
              }
              const allPas = mergedDoc.domain?.plateAppearances ?? []
              const halvesByInning = new Map<number, Set<number>>()
              for (const pa of allPas) {
                const parsed = parsePaId(String(pa.paId ?? ''))
                if (!parsed) continue
                if (!targetInnings.has(parsed.inning)) continue
                const set = halvesByInning.get(parsed.inning) ?? new Set<number>()
                set.add(parsed.half)
                halvesByInning.set(parsed.inning, set)
              }
              let candidate = ''
              let consistent = true
              for (const inn of targetInnings) {
                const halves = halvesByInning.get(inn)
                if (!halves || halves.size === 0) continue
                // 同一 inning で top/bottom 両方が混在することは通常ありえないが、
                // 念のため複数なら曖昧扱いで skip。
                if (halves.size > 1) {
                  consistent = false
                  break
                }
                const half = [...halves][0]
                const team = half === 0 && visitor ? visitor : half === 1 && home ? home : ''
                if (!team) continue
                if (!candidate) candidate = team
                else if (candidate !== team) {
                  consistent = false
                  break
                }
              }
              if (consistent && candidate) batterTeam = candidate
            }
          }
          if (!batterTeam) {
            // Phase 30: 5) 5 段目 fallback。 visitor/home の両方を仮定して `resolvePitchersForBatterInning`
            //    を試し、 cells を持つすべての target inning で **片方のみ resolve できる**なら、
            //    その方を batter team として採用。両方とも resolve できる場合は判定不能で skip。
            //    1900045 (rosterTeam=阪神 だが試合は西武vsロッテ) のような交流戦/不整合に対応。
            const board = mergedDoc.game?.scoreboard ?? []
            if (board.length >= 2) {
              const visitor = String(board[0]?.teamName ?? '').trim()
              const home = String(board[1]?.teamName ?? '').trim()
              const targetInnings = new Set<number>()
              for (let i = 0; i < cells.length; i++) {
                const t = String(cells[i] ?? '').trim()
                if (t) targetInnings.add(i + 1)
              }
              if (targetInnings.size > 0 && visitor && home) {
                let visOk = true
                let homeOk = true
                for (const inn of targetInnings) {
                  const reVis = resolvePitchersForBatterInning(mergedDoc, visitor, inn)
                  const reHome = resolvePitchersForBatterInning(mergedDoc, home, inn)
                  if (!reVis) visOk = false
                  if (!reHome) homeOk = false
                }
                if (visOk && !homeOk) batterTeam = visitor
                else if (!visOk && homeOk) batterTeam = home
              }
            }
          }
          const pitcherNameById = new Map<string, string>()
          for (const pl of mergedDoc.domain?.pitchingLines ?? []) {
            const pid = String(pl?.yahooPlayerId ?? '').trim()
            const name = String(pl?.playerName ?? '').trim()
            if (pid && name) pitcherNameById.set(pid, name)
          }
          for (let i = 0; i < cells.length; i++) {
            const text = String(cells[i] ?? '').trim()
            const inning = i + 1
            const existingCount = existingByInning.get(inning) ?? 0
            // 1 セル = 1 PA 前提。既存 PA があるイニングはスキップ（二重計上回避）。
            if (existingCount >= 1) continue
            if (!text) continue
            // batterTeam が空（スタメン名簿外でかつ PA も無いレア試合）→ チーム不明
            if (!batterTeam) {
              reconciliation.cellTeamUnresolvedPas += 1
              if (reconciliation.cellTeamUnresolvedSamples.length < 10) {
                const board = mergedDoc.game?.scoreboard ?? []
                const rosterRow = findRosterPlayerByPublicId(bid)
                reconciliation.cellTeamUnresolvedSamples.push({
                  gameId,
                  inning,
                  cellText: text,
                  rosterTeam: String(rosterRow?.team ?? ''),
                  scoreboardVisitor: String(board[0]?.teamName ?? ''),
                  scoreboardHome: String(board[1]?.teamName ?? ''),
                  paCountForBatter: pas.length,
                })
              }
              continue
            }
            const reso = resolvePitchersForBatterInning(mergedDoc, batterTeam, inning)
            if (!reso) {
              reconciliation.cellTeamUnresolvedPas += 1
              if (reconciliation.cellTeamUnresolvedSamples.length < 10) {
                const board = mergedDoc.game?.scoreboard ?? []
                const rosterRow = findRosterPlayerByPublicId(bid)
                reconciliation.cellTeamUnresolvedSamples.push({
                  gameId,
                  inning,
                  cellText: text,
                  rosterTeam: String(rosterRow?.team ?? ''),
                  scoreboardVisitor: String(board[0]?.teamName ?? ''),
                  scoreboardHome: String(board[1]?.teamName ?? ''),
                  paCountForBatter: pas.length,
                })
              }
              continue
            }
            // 投手 ID → 利き腕の解決は Yahoo ID 経由の roster lookup を優先（外国籍投手の
            // 表記揺れで playerName マッチが外れるのを避ける）。失敗したら playerName ベース。
            const handFromPitcherId = (pid: string): 'R' | 'L' | '' => {
              const r = findRosterPlayerByPublicId(pid)
              const th = String(r?.throw_hand ?? '').trim()
              if (th === 'R' || th === 'L') return th
              const pname = pitcherNameById.get(pid) ?? ''
              return pname ? throwHandFromPitcherName(pname) : ''
            }
            // 1 投手のみの半回 → 確定。複数投手の半回でも候補全員の利き腕が一致するなら確定（推測ではない）。
            let hand: 'R' | 'L' | '' = ''
            if (reso.kind === 'unique') {
              hand = handFromPitcherId(reso.pitcherId)
            } else {
              const hands = new Set<'R' | 'L' | ''>()
              for (const pid of reso.candidates) hands.add(handFromPitcherId(pid))
              // 候補の中に利き腕不明が混じっていたら、その混じりが空文字 '' で 1 件入る。
              // 厳密に「全員 R」または「全員 L」のとき以外は採用しない。
              if (hands.size === 1) {
                const only = [...hands][0]
                if (only === 'R' || only === 'L') hand = only
              }
              // Phase 30 (a): 候補の利き腕が混在で確定できない場合、同じ半回の plateAppearances
              // から **最後の PA の yahooPitcherId** を取り出して採用する（代打は通常その回の
              // 終盤に立つため、半回の最後の投手に対峙した可能性が極めて高い）。
              // 厳密ではないがヒューリスティクスとして妥当。
              if (hand !== 'R' && hand !== 'L') {
                const board = mergedDoc.game?.scoreboard ?? []
                const visitorName = String(board[0]?.teamName ?? '').trim()
                const targetHalf = batterTeam === visitorName ? 0 : 1
                const halfPas = (mergedDoc.domain?.plateAppearances ?? []).filter((pa) => {
                  const parsed = parsePaId(String(pa.paId ?? ''))
                  return parsed?.inning === inning && parsed?.half === targetHalf
                })
                for (let i = halfPas.length - 1; i >= 0; i--) {
                  const lastPid = String(
                    (halfPas[i] as { yahooPitcherId?: string }).yahooPitcherId ?? '',
                  ).trim()
                  if (!lastPid) continue
                  // 候補集合の中の投手のときだけ採用（候補外を勝手に推測しない）
                  if (!reso.candidates.includes(lastPid)) continue
                  const h = handFromPitcherId(lastPid)
                  if (h === 'R' || h === 'L') {
                    hand = h
                    break
                  }
                }
              }
              // Phase 30 (b): plateAppearances 由来の解決でも取れない場合、 候補リストは
              // 登板順 (= 半回内での登板順) に並んでいるので、 **最後の候補** = 半回の
              // 最後に登板した投手を採用する。代打は通常半回の終盤に立つため、 厳密ではない
              // がベストエフォートとして妥当な近似。
              if (hand !== 'R' && hand !== 'L' && reso.candidates.length > 0) {
                const lastPid = reso.candidates[reso.candidates.length - 1]
                if (lastPid) {
                  const h = handFromPitcherId(lastPid)
                  if (h === 'R' || h === 'L') hand = h
                }
              }
            }
            if (hand !== 'R' && hand !== 'L') {
              if (reso.kind === 'ambiguous') {
                reconciliation.cellAmbiguousPas += 1
                if (reconciliation.cellAmbiguousSamples.length < 10) {
                  reconciliation.cellAmbiguousSamples.push({
                    gameId,
                    inning,
                    cellText: text,
                    batterTeam,
                    candidatePitchers: reso.candidates.map((pid) => ({
                      id: pid,
                      hand: handFromPitcherId(pid),
                    })),
                  })
                }
              } else {
                reconciliation.cellPitcherHandUnknownPas += 1
              }
              continue
            }
            const contribution = parseCellResultToContribution(text)
            if (!contribution) {
              reconciliation.cellMissingTextPas += 1
              continue
            }
            const targetAgg = hand === 'R' ? aggR : aggL
            targetAgg.pa += contribution.pa
            targetAgg.ab += contribution.ab
            targetAgg.bb += contribution.bb
            targetAgg.hbp += contribution.hbp
            targetAgg.sh += contribution.sh
            targetAgg.sf += contribution.sf
            targetAgg.h += contribution.h
            targetAgg.hr += contribution.hr
            targetAgg.tb += contribution.tb
            if (contribution.hitBases === 2) targetAgg.h2 += 1
            if (contribution.hitBases === 3) targetAgg.h3 += 1
            // gameIds は各回ごとに加算しないので set のまま（試合数 g に影響しないよう注意）
            targetAgg.gameIds.add(gameId)
            const bucket = hand === 'R' ? reconciliation.cellResolvedR : reconciliation.cellResolvedL
            bucket.pa += contribution.pa
            bucket.ab += contribution.ab
            bucket.bb += contribution.bb
            bucket.hbp += contribution.hbp
            bucket.sh += contribution.sh
            bucket.sf += contribution.sf
            bucket.h += contribution.h
            bucket.hr += contribution.hr
            bucket.tb += contribution.tb
          }
          // cells で R/L に振り分けた分だけスナップショットと Δ を取り直す
          snapAfterR = p0FromAgg(aggR)
          snapAfterL = p0FromAgg(aggL)
          snapAfterU = p0FromAgg(aggU)
          gameR = p0Delta(snapAfterR, snapBeforeR)
          gameL = p0Delta(snapAfterL, snapBeforeL)
          gameU = p0Delta(snapAfterU, snapBeforeU)
          current = p0Add(p0Add(gameR, gameL), gameU)
          delta = p0Delta(p0FromTarget(target), current)
        }
      }
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

  // Phase 31: target が null の試合で PA が積まれた等により R+L+U が「全試合 target 合計」を上回るとき、
  // シーズン単位で Phase 26 と同様に過剰分を吸収する（通算 Phase 11 との P0 一致を優先）。
  const seasonActualP0 = p0Add(p0Add(p0FromAgg(aggR), p0FromAgg(aggL)), p0FromAgg(aggU))
  const seasonDelta = p0Delta(seasonTargetP0, seasonActualP0)
  if (p0HasNegative(seasonDelta)) {
    reconciliation.negativeDeltaGames += 1
    const neg = p0NegativeOnly(seasonDelta)
    reconciliation.negativeDelta = p0Add(reconciliation.negativeDelta, neg)
    const seasonR = p0FromAgg(aggR)
    const seasonL = p0FromAgg(aggL)
    const seasonU = p0FromAgg(aggU)
    const subtracted = applyNegativeP0DeltaFromGameBuckets(
      aggR,
      aggL,
      aggU,
      seasonR,
      seasonL,
      seasonU,
      seasonDelta,
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
      reconciliation.negativeDeltaSamples.push({ gameId: '__season__', delta: { ...seasonDelta } })
    }
  }
  if (p0HasPositive(seasonDelta)) {
    const applied = applyPositiveP0DeltaToAggUnknown(aggU, seasonDelta, '__season__')
    if (p0HasPositive(applied)) reconciliation.backfilledGames += 1
    reconciliation.appliedDelta = p0Add(reconciliation.appliedDelta, applied)
  }

  const rows: SeasonStatsRow[] = []
  // Phase 27: PA=0 でも H/HR が補完されるケース（target.pa は揃っているが HR/H だけ phase11 が上回る）
  // を行として出力するため、`pa > 0` だけでなく H/HR が積まれている場合も rows に含める。
  // Phase 30: 行出力条件を緩和。Phase 25 の P0 取りこぼし吸収 (`appliedDelta.bb` 等) で
  // 不明バケツに BB / HBP / SH / SF だけ加算されるケースがあり、 PA や H/HR がゼロでも
  // 行を出さないと validate:vs-hand-vs-phase11 で BB ミスマッチを起こす。
  const hasAnyAgg = (a: BattingSeasonAggYahoo): boolean =>
    a.pa > 0 || a.h > 0 || a.hr > 0 || a.bb > 0 || a.hbp > 0 || a.sh > 0 || a.sf > 0
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
export type BattingTotalRowSource = 'phase11' | 'rankings' | 'csv' | 'batting_lines_fallback' | null

type RankingBattingRow = Record<string, unknown>

function readRankingTotalRow(yahooId: string, year: string): RankingBattingRow | null {
  const root = getProjectRoot()
  const leagues = ['CL', 'PL'] as const
  const fileNames = ['OPS_all.json', '打率_all.json', '安打_all.json'] as const
  for (const league of leagues) {
    for (const fileName of fileNames) {
      const p = path.join(root, 'public', 'data', 'rankings', year, league, fileName)
      if (!fs.existsSync(p)) continue
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
        if (!Array.isArray(raw)) continue
        const row = raw.find((item) => String((item as RankingBattingRow)?.playerId ?? '').trim() === yahooId)
        if (row && typeof row === 'object') return row as RankingBattingRow
      } catch {
        // ignore malformed rankings snapshot and continue to the next candidate
      }
    }
  }
  return null
}

function intFromRankingRow(value: unknown, fallback: number = 0): number {
  const n = parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(n) ? n : fallback
}

function stringFromRankingMetric(value: unknown, fallback: string = ''): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

function buildTotalRowFromRankings(
  yahooId: string,
  year: string,
  fallback: SeasonStatsRow | null,
): SeasonStatsRow | null {
  const ranking = readRankingTotalRow(yahooId, year)
  if (!ranking) return null
  const hits = intFromRankingRow(ranking.hits ?? ranking.h, fallback?.h ?? 0)
  const doubles = intFromRankingRow(ranking.doubles ?? ranking.h2, fallback?.h2 ?? 0)
  const triples = intFromRankingRow(ranking.triples ?? ranking.h3, fallback?.h3 ?? 0)
  const homers = intFromRankingRow(ranking.hr, fallback?.hr ?? 0)
  const singles = intFromRankingRow(
    ranking.singles,
    Math.max(0, hits - doubles - triples - homers),
  )
  return {
    split_type: 'total',
    split_value: 'total',
    split_label: fallback?.split_label || '通算',
    g: intFromRankingRow(ranking.games ?? ranking.g, fallback?.g ?? 0),
    pa: intFromRankingRow(ranking.pa, fallback?.pa ?? 0),
    ab: intFromRankingRow(ranking.ab, fallback?.ab ?? 0),
    r: intFromRankingRow(ranking.runs ?? ranking.r, fallback?.r ?? 0),
    h: hits,
    h1: singles,
    h2: doubles,
    h3: triples,
    hr: homers,
    tb: intFromRankingRow(ranking.tb, fallback?.tb ?? 0),
    rbi: intFromRankingRow(ranking.rbi, fallback?.rbi ?? 0),
    so: intFromRankingRow(ranking.so, fallback?.so ?? 0),
    bb: intFromRankingRow(ranking.bb, fallback?.bb ?? 0),
    ibb: intFromRankingRow(ranking.ibb, fallback?.ibb ?? 0),
    hbp: intFromRankingRow(ranking.hbp, fallback?.hbp ?? 0),
    sh: intFromRankingRow(ranking.sh, fallback?.sh ?? 0),
    sf: intFromRankingRow(ranking.sf, fallback?.sf ?? 0),
    sb: intFromRankingRow(ranking.sb, fallback?.sb ?? 0),
    cs: intFromRankingRow(ranking.cs, fallback?.cs ?? 0),
    e: intFromRankingRow(ranking.e, fallback?.e ?? 0),
    gidp: intFromRankingRow(ranking.gidp, fallback?.gidp ?? 0),
    avg: stringFromRankingMetric(ranking.avg, fallback?.avg ?? ''),
    obp: stringFromRankingMetric(ranking.obp, fallback?.obp ?? ''),
    slg: stringFromRankingMetric(ranking.slg, fallback?.slg ?? ''),
    ops: stringFromRankingMetric(ranking.ops, fallback?.ops ?? ''),
    risp_avg: fallback?.risp_avg ?? '—',
    risp_ab: fallback?.risp_ab ?? 0,
    risp_h: fallback?.risp_h ?? 0,
    sb_pct: fallback?.sb_pct ?? '',
    isop: stringFromRankingMetric(ranking.isop, fallback?.isop ?? ''),
    isod: stringFromRankingMetric(ranking.isod, fallback?.isod ?? ''),
    babip: stringFromRankingMetric(ranking.babip, fallback?.babip ?? ''),
    bb_pct: stringFromRankingMetric(ranking.bbPct ?? ranking.bb_pct, fallback?.bb_pct ?? ''),
    k_pct: stringFromRankingMetric(ranking.kPct ?? ranking.k_pct, fallback?.k_pct ?? ''),
    bbk: stringFromRankingMetric(ranking.bbk ?? ranking.bb_k, fallback?.bbk ?? ''),
    gpa: stringFromRankingMetric(ranking.gpa, fallback?.gpa ?? ''),
    rc: stringFromRankingMetric(ranking.rc, fallback?.rc ?? ''),
    xr: stringFromRankingMetric(ranking.xr, fallback?.xr ?? ''),
    seca: stringFromRankingMetric(ranking.seca, fallback?.seca ?? ''),
    ta: stringFromRankingMetric(ranking.ta, fallback?.ta ?? ''),
    noi: stringFromRankingMetric(ranking.noi, fallback?.noi ?? ''),
  }
}

/** Phase11 通算の risp_ab が 0 のとき、Phase15 base_sit「得点圏」行から補完（appearance_slots 既存 JSON 向け） */
function backfillTotalRispFromBaseSitSplit(
  totalRow: SeasonStatsRow,
  phase15: SeasonStatsRow[]
): SeasonStatsRow {
  if (totalRow.risp_ab > 0) return totalRow
  const rispSit = phase15.find(
    (r) => r.split_type === 'base_sit' && r.split_value === 'risp' && r.ab > 0
  )
  if (!rispSit) return totalRow
  return {
    ...totalRow,
    risp_ab: rispSit.ab,
    risp_h: rispSit.h,
    risp_avg:
      rispSit.avg && rispSit.avg !== '—'
        ? rispSit.avg
        : slashRate3FromCounts(rispSit.h, rispSit.ab),
  }
}

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
function parseDerivedBattingRowsFile(raw: { rows?: SeasonStatsRow[] } | null): SeasonStatsRow[] {
  if (!raw) return []
  return (raw.rows ?? []).map(normalizeDerivedRowLabels)
}

async function loadDerivedBattingRowsAsync(
  category: string,
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  const raw = await fetchDerivedJsonServer<{ rows?: SeasonStatsRow[] }>(
    category,
    year,
    `yahoo_${yahooId}.json`
  )
  return parseDerivedBattingRowsFile(raw)
}

function loadDerivedBattingRowsSync(
  category: string,
  yahooId: string,
  year: string
): SeasonStatsRow[] {
  const raw = readDerivedJsonLocalSync<{ rows?: SeasonStatsRow[] }>(
    category,
    year,
    `yahoo_${yahooId}.json`
  )
  return parseDerivedBattingRowsFile(raw)
}

export function loadPhase11DerivedBattingRows(yahooId: string, year: string): SeasonStatsRow[] {
  return loadDerivedBattingRowsSync('player_season_batting', yahooId, year)
}

export async function loadPhase11DerivedBattingRowsAsync(
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  return loadDerivedBattingRowsAsync('player_season_batting', yahooId, year)
}

/** `_data/derived/player_season_batting_context/{year}/yahoo_*.json`（Phase 13） */
export function loadPhase13ContextBattingRows(yahooId: string, year: string): SeasonStatsRow[] {
  return loadDerivedBattingRowsSync('player_season_batting_context', yahooId, year)
}

export async function loadPhase13ContextBattingRowsAsync(
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  return loadDerivedBattingRowsAsync('player_season_batting_context', yahooId, year)
}

/** `_data/derived/player_season_batting_splits/{year}/yahoo_*.json`（Phase 15: 打席別巡目等） */
export function loadPhase15BattingSplitRows(yahooId: string, year: string): SeasonStatsRow[] {
  return loadDerivedBattingRowsSync('player_season_batting_splits', yahooId, year)
}

export async function loadPhase15BattingSplitRowsAsync(
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  return loadDerivedBattingRowsAsync('player_season_batting_splits', yahooId, year)
}

/** `_data/derived/player_season_batting_count/{year}/yahoo_*.json`（Phase 16: カウント別） */
export function loadPhase16BattingCountRows(yahooId: string, year: string): SeasonStatsRow[] {
  return loadDerivedBattingRowsSync('player_season_batting_count', yahooId, year)
}

export async function loadPhase16BattingCountRowsAsync(
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  return loadDerivedBattingRowsAsync('player_season_batting_count', yahooId, year)
}

/** `_data/derived/player_season_batting_period/{year}/yahoo_*.json`（Phase 17: 月間・週間） */
export function loadPhase17BattingPeriodRows(yahooId: string, year: string): SeasonStatsRow[] {
  return loadDerivedBattingRowsSync('player_season_batting_period', yahooId, year)
}

export async function loadPhase17BattingPeriodRowsAsync(
  yahooId: string,
  year: string
): Promise<SeasonStatsRow[]> {
  return loadDerivedBattingRowsAsync('player_season_batting_period', yahooId, year)
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

function mergePilotSeasonStatsCore(
  yahooId: string,
  year: string,
  csvAll: SeasonStatsRow[],
  phase11: SeasonStatsRow[],
  phase13: SeasonStatsRow[],
  phase15: SeasonStatsRow[],
  phase16: SeasonStatsRow[],
  phase17: SeasonStatsRow[]
): MergePilotSeasonStatsResult {
  const csvNonTotal = csvAll.filter(
    (r) => !(r.split_type === 'total' && r.split_value === 'total')
  )

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
  const rankingTotal = buildTotalRowFromRankings(yahooId, year, totalRow)
  if (rankingTotal) {
    totalRow = rankingTotal
    totalSource = 'rankings'
  }
  if (!totalRow) {
    const fb = computeBattingTotalFromBattingLinesFallback(yahooId)
    if (fb) {
      totalRow = fb
      totalSource = 'batting_lines_fallback'
    }
  }
  if (totalRow) {
    totalRow = backfillTotalRispFromBaseSitSplit(totalRow, phase15)
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

export function mergePilotSeasonStatsWithDerived(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): MergePilotSeasonStatsResult {
  const csvAll = loadPilotBattingStats(yahooId)
  return mergePilotSeasonStatsCore(
    yahooId,
    year,
    csvAll,
    loadPhase11DerivedBattingRows(yahooId, year),
    loadPhase13ContextBattingRows(yahooId, year),
    loadPhase15BattingSplitRows(yahooId, year),
    loadPhase16BattingCountRows(yahooId, year),
    loadPhase17BattingPeriodRows(yahooId, year)
  )
}

export async function mergePilotSeasonStatsWithDerivedAsync(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): Promise<MergePilotSeasonStatsResult> {
  const csvAll = loadPilotBattingStats(yahooId)
  const [phase11, phase13, phase15, phase16, phase17] = await Promise.all([
    loadPhase11DerivedBattingRowsAsync(yahooId, year),
    loadPhase13ContextBattingRowsAsync(yahooId, year),
    loadPhase15BattingSplitRowsAsync(yahooId, year),
    loadPhase16BattingCountRowsAsync(yahooId, year),
    loadPhase17BattingPeriodRowsAsync(yahooId, year),
  ])
  return mergePilotSeasonStatsCore(yahooId, year, csvAll, phase11, phase13, phase15, phase16, phase17)
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

  const slash = battingSlashRatesFromCounts({ h, ab, tb, bb, hbp, sf })

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
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
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
