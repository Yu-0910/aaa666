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
import { findRosterPlayerByPublicId } from '@/lib/npbRoster'
import { resolveYahooPilotIdForStats } from '@/lib/yahooNpbBatterIdMap'
import { formatWeekRangeTueToSunFromTuesdayYmd } from '@/lib/yahooGame/jstPeriodKeys'
import type { PilotBlocksData, SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
import { DERIVED_SEASON_YEAR_DEFAULT, enrichSeasonStatsRowSabermetrics } from '@/lib/seasonStatsPilotShared'

/** クライアントは `@/lib/seasonStatsPilotShared` を参照（fs を引き込まない） */
export type { PilotBlocksData, SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
export {
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

/** 個人ページ表示項目整理 ブロックA・D 準拠 */
export type SeasonStatsRow = {
  split_type: string
  split_value: string
  split_label: string
  // ブロックA: 基本
  g: number
  pa: number
  ab: number
  r: number
  h: number
  h1: number
  h2: number
  h3: number
  hr: number
  tb: number
  rbi: number
  so: number
  bb: number
  ibb: number
  hbp: number
  sh: number
  sf: number
  sb: number
  cs: number
  gidp: number
  avg: string
  obp: string
  slg: string
  ops: string
  risp_avg: string
  risp_ab: number
  risp_h: number
  sb_pct: string
  // ブロックD: セイバーメトリクス
  isop: string
  isod: string
  babip: string
  bb_pct: string
  k_pct: string
  bbk: string
  gpa: string
  rc: string
  xr: string
  seca: string
  ta: string
  noi: string
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

/** `_data/derived/player_season_batting/{year}/yahoo_*.json`（Phase 11） */
export function loadPhase11DerivedBattingRows(yahooId: string, year: string): SeasonStatsRow[] {
  const jsonPath = path.join(
    process.cwd(),
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
    process.cwd(),
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
    process.cwd(),
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
    process.cwd(),
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
    process.cwd(),
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
 * パイロット CSV（batting_stats）を優先し、無いときは Phase 11 通算を補完。
 * Phase 13 のコンテキスト行は CSV とキーが重ならない分だけ付与する。
 * Phase 15 の打席別（巡目）・打順別行は CSV とキーが重なる場合は Phase 15 を優先する。
 * Phase 16 のカウント別行も同様。
 * Phase 17 の月間・週間行も同様。
 */
export function mergePilotSeasonStatsWithDerived(
  yahooId: string,
  year: string = DERIVED_SEASON_YEAR_DEFAULT
): SeasonStatsRow[] {
  const csv = loadPilotBattingStats(yahooId)
  const csvKeys = new Set(csv.map((r) => `${r.split_type}\t${r.split_value}`))
  const phase11 = loadPhase11DerivedBattingRows(yahooId, year)
  const phase13 = loadPhase13ContextBattingRows(yahooId, year)
  const phase15 = loadPhase15BattingSplitRows(yahooId, year)
  const phase16 = loadPhase16BattingCountRows(yahooId, year)
  const phase17 = loadPhase17BattingPeriodRows(yahooId, year)

  let out: SeasonStatsRow[] = [...csv]
  if (out.length === 0 && phase11.length > 0) {
    out = [...phase11]
  } else {
    const hasTotal = out.some((r) => r.split_type === 'total' && r.split_value === 'total')
    if (!hasTotal) {
      const t = phase11.find((r) => r.split_type === 'total' && r.split_value === 'total')
      if (t) out = [normalizeDerivedRowLabels(t), ...out]
    }
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
  for (const row of phase16) {
    const k = `${row.split_type}\t${row.split_value}`
    if (!csvKeys.has(k)) out.push(normalizeDerivedRowLabels(row))
  }
  for (const row of phase17) {
    const k = `${row.split_type}\t${row.split_value}`
    if (!csvKeys.has(k)) out.push(normalizeDerivedRowLabels(row))
  }

  const total = out.filter((r) => r.split_type === 'total' && r.split_value === 'total')
  const rest = out
    .filter((r) => !(r.split_type === 'total' && r.split_value === 'total'))
    .sort((a, b) => {
      if (a.split_type !== b.split_type) return a.split_type.localeCompare(b.split_type)
      return a.split_value.localeCompare(b.split_value)
    })
  return [...total, ...rest].map((r) => enrichSeasonStatsRowSabermetrics(r))
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
  const csvPath = path.join(process.cwd(), '_data', 'yahoo_games_pilot', 'plate_appearances_normalized.csv')
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
    process.cwd(),
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
  const jsonPath = path.join(process.cwd(), '_data', 'yahoo_games_pilot', 'kikuchi_20260304_blocks.json')
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