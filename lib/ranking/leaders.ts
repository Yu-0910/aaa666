/**
 * トップリーダー取得機能
 * CSVデータから各指標のトップ3・トップ1を取得
 */

import type { BattingCsvRow, MetricDefinition } from './types'
import { loadBattingCsv } from './loaders'
import { shouldRequireQualifyingPA, calculateMinPA } from './qualifyingPA'
import { calculateXRNf3 } from '@/lib/xr'
import { calculateRCNf3 } from '@/lib/rc'
import { BATTING_TOP_2026_SEASON_ALL_METRICS, battingTop2025SeasonTopN } from '@/lib/topPageBatting2025Grid'
import { usesTopPageModernLayout } from '@/lib/topPageModernLayout'
import {
  buildBattingLeadersConfigFromRankings,
  finalizeBattingLeadersConfigForTopPage,
  finalizeBattingLeadersConfigForTopPageAsync,
  hasBattingRankingsJsonForLeague,
} from '@/lib/ranking/leadersFromRankingsJson'
import { readTopLeadersSnapshot, TOP_LEADERS_SNAPSHOT_YEAR } from '@/lib/topPage/leadersSnapshot2026'
import { fetchTopLeadersSnapshotRemote } from '@/lib/topPage/fetchTopLeadersSnapshotRemote'

export type { LeaderRow, LeadersConfig } from './leadersTypes'
import type { LeaderRow, LeadersConfig } from './leadersTypes'

// チーム名のマッピング
const teamCodeToName: Record<string, string> = {
  H: '阪神',
  G: '巨人',
  DB: 'DeNA',
  C: '広島',
  D: '中日',
  S: 'ヤクルト',
  Bs: 'オリックス',
  M: 'ロッテ',
  F: '日本ハム',
  E: '楽天',
  L: '西武',
  Hs: 'ソフトバンク',
}

// チーム名からチームコードへのマッピング
const teamNameToCode: Record<string, string> = {
  '阪神': 'H',
  '阪神タイガース': 'H',
  '巨人': 'G',
  '読売ジャイアンツ': 'G',
  'DeNA': 'DB',
  '横浜DeNAベイスターズ': 'DB',
  '広島': 'C',
  '広島東洋カープ': 'C',
  '中日': 'D',
  '中日ドラゴンズ': 'D',
  'ヤクルト': 'S',
  '東京ヤクルトスワローズ': 'S',
  'オリックス': 'Bs',
  'オリックス・バファローズ': 'Bs',
  'ロッテ': 'M',
  '千葉ロッテマリーンズ': 'M',
  '日本ハム': 'F',
  '北海道日本ハムファイターズ': 'F',
  '楽天': 'E',
  '東北楽天ゴールデンイーグルス': 'E',
  '西武': 'L',
  '埼玉西武ライオンズ': 'L',
  'ソフトバンク': 'Hs',
  '福岡ソフトバンクホークス': 'Hs',
}

/**
 * チームコードからチーム名を取得
 */
function getTeamName(teamCode: string): string {
  return teamCodeToName[teamCode] || teamCode
}

/**
 * チーム名からチームコードを取得
 */
function getTeamCode(teamName: string): string {
  // まず完全一致を試す
  if (teamNameToCode[teamName]) {
    return teamNameToCode[teamName]
  }
  
  // チーム名に含まれる文字列でマッチング
  for (const [name, code] of Object.entries(teamNameToCode)) {
    if (teamName.includes(name) || name.includes(teamName)) {
      return code
    }
  }
  
  // 見つからない場合は元の値を返す（既にチームコードの可能性がある）
  return teamName
}

/**
 * 選手名を取得（日本語名と英字名）
 */
function getPlayerNames(row: BattingCsvRow): { name: string; romanName?: string } {
  const name = (row['player_name_ja'] || row['name'] || row['Name'] || '').toString().trim()
  const romanNameRaw = (row['player_name_en'] || row['romanName'] || row['name_en'] || '').toString().trim()
  const romanName = romanNameRaw && romanNameRaw.length > 0 ? romanNameRaw : undefined
  
  return {
    name: name || '不明',
    romanName: romanName,
  }
}

/**
 * TB（塁打）を計算: 1B + 2*2B + 3*3B + 4*HR
 */
function calculateTB(row: BattingCsvRow): number | null {
  // まず既存のTBを確認
  const tb = getNumericValue(row, ['TB', 'tb', '塁打'])
  if (tb !== null) {
    return tb
  }
  
  // TBが空の場合は計算
  const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
  const doubles = getNumericValue(row, ['2B', 'doubles', '二塁打']) ?? 0
  const triples = getNumericValue(row, ['3B', 'triples', '三塁打']) ?? 0
  const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
  
  if (h > 0) {
    const singles = h - doubles - triples - hr
    if (singles >= 0) {
      return singles + 2 * doubles + 3 * triples + 4 * hr
    }
  }
  
  return null
}

/**
 * 指標の値を取得（MetricDefinitionを使用）
 * adapter.tsのgetMetricValue関数と同じロジックを使用
 */
function getMetricValueForLeader(row: BattingCsvRow, metric: MetricDefinition): number | null {
  const csvKey = metric.csvKey
  
  // 計算可能な指標のリスト
  const calculableMetrics = [
    'OPS', '長打率', 'SLG', '打率', 'AVG', 'avg', '出塁率', 'OBP', 'BB%', 'K%', 'BB/K', 'BB-K', 'BBK',
    'IsoP', 'isop', 'IsoD', 'isod', 'RC', 'rc', 'XR', 'xr',
    'BABIP', 'babip', 'SecA', 'seca', 'TA', 'ta', 'NOI', 'noi', 'GPA', 'gpa',
    '単打', '1B', 'singles'
  ]
  
  // 計算可能な指標の場合は、adapter.tsと同じロジックで計算値を優先
  if (calculableMetrics.includes(csvKey)) {
    // 打率は常に計算値（H/AB）を使用
    if (csvKey === '打率' || csvKey === 'AVG' || csvKey === 'avg') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打'])
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && h !== null && h >= 0) {
        return h / ab
      }
      return null
    }
    
    // IsoP = SLG - AVG（常に計算値を使用）
    if (csvKey === 'IsoP' || csvKey === 'isop') {
      const tb = calculateTB(row)
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      let slg: number | null = null
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
      
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打'])
      let avg: number | null = null
      if (ab !== null && ab > 0 && h !== null && h >= 0) {
        avg = h / ab
      }
      
      if (slg !== null && avg !== null) {
        return slg - avg
      }
      return null
    }
    
    // IsoD = OBP - AVG（常に計算値を使用）
    if (csvKey === 'IsoD' || csvKey === 'isod') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      let obp: number | null = null
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
      
      let avg: number | null = null
      if (ab !== null && ab > 0 && h !== null && h >= 0) {
        avg = h / ab
      }
      
      if (obp !== null && avg !== null) {
        return obp - avg
      }
      return null
    }
    
    // SLG = TB / AB（計算値を優先、CSVの値がAVGと同じ場合は無視）
    if (csvKey === '長打率' || csvKey === 'SLG') {
      const tb = calculateTB(row)
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && tb !== null) {
        const calculatedSlg = tb / ab
        // CSVの値を確認（AVGと同じでないかチェック）
        const csvSlg = getNumericValue(row, ['SLG', 'slg', '長打率'])
        const avg = getNumericValue(row, ['AVG', 'avg', '打率'])
        if (csvSlg !== null && avg !== null && Math.abs(csvSlg - avg) < 0.001) {
          // CSVの値がAVGと同じ場合は計算値を返す
          return calculatedSlg
        }
        // 計算値との差が大きい場合は計算値を優先
        if (csvSlg !== null && Math.abs(csvSlg - calculatedSlg) > 0.05) {
          return calculatedSlg
        }
        // それ以外は計算値を返す
        return calculatedSlg
      }
      return null
    }
    
    // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)（計算値を優先）
    if (csvKey === '出塁率' || csvKey === 'OBP') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      if (denominator > 0) {
        const calculatedObp = (h + bb + hbp) / denominator
        // CSVの値を確認（計算値との差が大きい場合は計算値を優先）
        const csvObp = getNumericValue(row, ['OBP', 'obp', '出塁率'])
        if (csvObp !== null && Math.abs(csvObp - calculatedObp) > 0.05) {
          return calculatedObp
        }
        return calculatedObp
      }
      return null
    }
    
    // OPS = OBP + SLG（計算値を優先）
    if (csvKey === 'OPS') {
      // OBPを計算
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      let obp: number | null = null
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
      
      // SLGを計算
      const tb = calculateTB(row)
      let slg: number | null = null
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
      
      if (obp !== null) {
        return obp + (slg ?? 0)
      }
      return null
    }
    
    // 単打 = H - 2B - 3B - HR
    if (csvKey === '単打' || csvKey === '1B' || csvKey === 'singles') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const doubles = getNumericValue(row, ['2B', 'doubles', '二塁打']) ?? 0
      const triples = getNumericValue(row, ['3B', 'triples', '三塁打']) ?? 0
      const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
      if (h > 0) {
        const singles = h - doubles - triples - hr
        if (singles >= 0) {
          return singles
        }
      }
      return null
    }
    
    // RC（nf3互換 Technical RC。丸めは表示側）
    if (csvKey === 'RC' || csvKey === 'rc') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const cs = getNumericValue(row, ['CS', 'cs', '盗塁死', '盗塁刺']) ?? 0
      const gidp = getNumericValue(row, ['GIDP', 'gidp', 'GDP', 'gdp', '併殺打']) ?? 0
      const tb = calculateTB(row) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const sh = getNumericValue(row, ['SH', 'sh', '犠打']) ?? 0
      const sb = getNumericValue(row, ['SB', 'sb', '盗塁']) ?? 0
      const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0

      return calculateRCNf3({ h, bb, hbp, cs, gidp, tb, sf, sh, sb, so, ab })
    }
    
    // XR = 0.50*1B + 0.72*2B + 1.04*3B + 1.44*HR + 0.33*(BB+HBP) + 0.18*SB - 0.32*CS - 0.098*(AB-H)
    if (csvKey === 'XR' || csvKey === 'xr') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const doubles = getNumericValue(row, ['2B', 'doubles', '二塁打']) ?? 0
      const triples = getNumericValue(row, ['3B', 'triples', '三塁打']) ?? 0
      const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const ibb = getNumericValue(row, ['IBB', 'ibb', '敬遠']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const sb = getNumericValue(row, ['SB', 'sb', '盗塁']) ?? 0
      const cs = getNumericValue(row, ['CS', 'cs', '盗塁死', '盗塁刺']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振']) ?? 0
      const gidp = getNumericValue(row, ['GIDP', 'gidp', 'GDP', 'gdp', '併殺打']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const sh = getNumericValue(row, ['SH', 'sh', '犠打']) ?? 0

      const singles = Math.max(0, h - doubles - triples - hr)
      return calculateXRNf3({
        singles,
        doubles,
        triples,
        hr,
        bb,
        ibb,
        hbp,
        sb,
        cs,
        ab,
        h,
        so,
        gidp,
        sf,
        sh,
      })
    }
    
    // BABIP = (H - HR) / (AB - SO - HR + SF)
    if (csvKey === 'BABIP' || csvKey === 'babip') {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab - so - hr + sf
      if (denominator > 0) {
        return (h - hr) / denominator
      }
      return null
    }
    
    // SecA = (BB + (TB - H)) / AB
    if (csvKey === 'SecA' || csvKey === 'seca') {
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const tb = calculateTB(row)
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && tb !== null) {
        return (bb + (tb - h)) / ab
      }
      return null
    }
    
    // TA = (TB + BB + HBP + SB) / (AB + BB + HBP + CS)
    if (csvKey === 'TA' || csvKey === 'ta') {
      const tb = calculateTB(row)
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const sb = getNumericValue(row, ['SB', 'sb', '盗塁']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const cs = getNumericValue(row, ['CS', 'cs', '盗塁死', '盗塁刺']) ?? 0
      const numerator = (tb ?? 0) + bb + hbp + sb
      const denominator = ab + bb + hbp + cs
      if (denominator > 0 && tb !== null) {
        return numerator / denominator
      }
      return null
    }
    
    // NOI = (OBP + SLG/3) * 1000
    if (csvKey === 'NOI' || csvKey === 'noi') {
      // OBPを計算
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      let obp: number | null = null
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
      
      // SLGを計算
      const tb = calculateTB(row)
      let slg: number | null = null
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
      
      if (obp !== null) {
        return (obp + (slg ?? 0) / 3) * 1000
      }
      return null
    }
    
    // GPA = (1.8 * OBP + SLG) / 4
    if (csvKey === 'GPA' || csvKey === 'gpa') {
      // OBPを計算
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      let obp: number | null = null
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
      
      // SLGを計算
      const tb = calculateTB(row)
      let slg: number | null = null
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
      
      if (obp !== null) {
        return (1.8 * obp + (slg ?? 0)) / 4
      }
      return null
    }
    
    // BB/K = BB / SO
    if (csvKey === 'BB/K' || csvKey === 'BB-K' || csvKey === 'BBK') {
      const bb = getNumericValue(row, ['BB', 'bb', '四球'])
      const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振'])
      if (so !== null && so > 0 && bb !== null) {
        return bb / so
      }
      return null
    }
  }
  
  // 計算可能でない指標は、CSVから直接取得
  const mapping: Record<string, string[]> = {
    'OPS': ['OPS', 'ops'],
    '打率': ['打率', 'AVG', 'avg'],
    '安打': ['安打', 'H', 'h', 'Hits', 'hits'],
    '本塁打': ['本塁打', 'HR', 'hr'],
    '打点': ['打点', 'RBI', 'rbi'],
    '試合': ['試合', 'G', 'g', 'Games', 'games'],
    '打席': ['打席', 'PA', 'pa'],
    '打数': ['打数', 'AB', 'ab'],
    '単打': ['単打', '1B', 'singles'],
    '二塁打': ['二塁打', '2B', 'doubles'],
    '三塁打': ['三塁打', '3B', 'triples'],
    '得点': ['得点', 'R', 'r', 'Runs', 'runs'],
    '出塁率': ['出塁率', 'OBP', 'obp'],
    '長打率': ['長打率', 'SLG', 'slg'],
    '四球': ['四球', 'BB', 'bb'],
    '敬遠': ['敬遠', 'IBB', 'ibb'],
    '死球': ['死球', 'HBP', 'hbp'],
    '三振': ['三振', 'SO', 'so', 'K', 'k'],
    '塁打': ['塁打', 'TB', 'tb'],
    '盗塁': ['盗塁', 'SB', 'sb'],
    '盗塁死': ['盗塁死', '盗塁刺', 'CS', 'cs'],
    '犠打': ['犠打', 'SH', 'sh'],
    '犠飛': ['犠飛', 'SF', 'sf'],
    '併殺打': ['併殺打', 'GDP', 'gdp', 'GIDP', 'gidp'],
    'IsoP': ['IsoP', 'isop'],
    'IsoD': ['IsoD', 'isod'],
    'BB%': ['BB%', 'BBPct', 'bbpct'],
    'K%': ['K%', 'KPct', 'kpct'],
    'BB/K': ['BB/K', 'BB-K', 'BBK', 'bbk'],
    'RC': ['RC', 'rc'],
    'XR': ['XR', 'xr'],
    'BABIP': ['BABIP', 'babip'],
    'SecA': ['SecA', 'seca'],
    'TA': ['TA', 'ta'],
    'NOI': ['NOI', 'noi'],
    'GPA': ['GPA', 'gpa'],
  }
  
  const candidates = mapping[csvKey] || [csvKey]
  
  // 候補列名を順に試す
  for (const candidate of candidates) {
    if (row[candidate] !== undefined && row[candidate] !== null) {
      const rawValue = row[candidate]
      
      // 空文字列の場合はスキップ
      if (rawValue === '' || (typeof rawValue === 'string' && rawValue.trim() === '')) {
        continue
      }
      
      // "nan" 文字列を検出して除外
      if (typeof rawValue === 'string' && rawValue.toLowerCase() === 'nan') {
        continue
      }
      
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      if (!isNaN(value) && isFinite(value)) {
        return value
      }
    }
  }
  
  return null
}

/**
 * 行から数値を取得（候補列名を順に試す）
 */
function getNumericValue(row: BattingCsvRow, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const value = row[candidate]
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'string' && value.toLowerCase() === 'nan') {
        continue
      }
      const num = typeof value === 'number' ? value : Number(value)
      if (!isNaN(num) && isFinite(num)) {
        return num
      }
    }
  }
  return null
}

/**
 * 指定された指標のトップNを取得
 */
function getTopNForMetric(
  rows: BattingCsvRow[],
  metric: MetricDefinition,
  topN: number = 3,
  sortOrder: 'asc' | 'desc' = 'desc',
  season: string = '2025',
  league: string = 'CL'
): LeaderRow[] {
  // 規定打席フィルタを適用（指標ごとに判定）
  // Phase 4: 規定用CSV由来のJSONでは全行が規定以上のため実質 no-op。従来JSONではフィルタが効き後方互換を確保。
  const requiresQualifyingPA = shouldRequireQualifyingPA(metric.key)
  const minPA = requiresQualifyingPA ? calculateMinPA(season, league) : 0
  
  // 指標の値を取得してソート
  const items: Array<{ row: BattingCsvRow; value: number }> = []
  
  for (const row of rows) {
    // 規定打席フィルタを適用
    if (requiresQualifyingPA && minPA > 0) {
      const pa = getNumericValue(row, ['PA', 'pa', '打席'])
      if (pa === null || pa < minPA) {
        continue // 規定打席未到達の場合はスキップ
      }
    }
    
    const value = getMetricValueForLeader(row, metric)
    if (value !== null) {
      items.push({ row, value })
    }
  }
  
  // ソート（降順がデフォルト、K%のみ昇順）
  items.sort((a, b) => {
    if (sortOrder === 'asc') {
      return a.value - b.value
    } else {
      return b.value - a.value
    }
  })
  
  // 上位N件を取得
  const topItems = items.slice(0, topN)
  
  // LeaderRow形式に変換
  const leaders: LeaderRow[] = []
  for (let i = 0; i < topItems.length; i++) {
    const { row, value } = topItems[i]
    const { name, romanName } = getPlayerNames(row)
    const teamRaw = (row['team'] || row['Team'] || '').toString().trim()
    // チーム名からチームコードに変換
    const teamCode = getTeamCode(teamRaw)
    const teamName = getTeamName(teamCode)
    
    leaders.push({
      rank: (i + 1) as 1 | 2 | 3,
      name: name.replace(/\s+/g, ''),
      team: teamCode, // チームコードを使用
      teamName: teamName,
      value: value,
      romanName: romanName,
    })
  }
  
  return leaders
}

/**
 * 指標名からMetricDefinitionを検索
 */
function findMetricByName(
  availableMetrics: MetricDefinition[],
  metricName: string
): MetricDefinition | undefined {
  // まず完全一致を試す（label）
  let metric = availableMetrics.find(m => m.label === metricName)
  if (metric) return metric
  
  // csvKeyとの完全一致を試す
  metric = availableMetrics.find(m => m.csvKey === metricName)
  if (metric) return metric
  
  // keyとの完全一致を試す
  metric = availableMetrics.find(m => m.key === metricName.toLowerCase())
  if (metric) return metric
  
  // 大文字小文字を無視して検索
  const metricNameLower = metricName.toLowerCase()
  metric = availableMetrics.find(m => {
    return (
      m.label.toLowerCase() === metricNameLower ||
      m.csvKey.toLowerCase() === metricNameLower ||
      m.key === metricNameLower
    )
  })
  
  return metric
}

/**
 * 指定年度・リーグの打撃成績リーダーを取得（汎用関数）
 * 2026: 事前生成 `public/data/top-leaders/2026/{league}/batting.json` を優先（無ければランキング JSON から切り出し）
 * 2025 以前: CSV から算出（従来）
 */
export function getBattingLeaders(year: string, league: string): LeadersConfig {
  const upperLeague = league.toUpperCase()
  const modern = usesTopPageModernLayout(Number(year))

  const legacyTop3 = ['OPS', '打率', '本塁打'] as const
  const legacyMini = ['出塁率', '長打率', '打点', '安打', '盗塁'] as const
  const emptyModern: LeadersConfig = {
    top3Metrics: [...BATTING_TOP_2026_SEASON_ALL_METRICS],
    miniMetrics: [],
    leaders: {},
  }
  const emptyLegacy: LeadersConfig = {
    top3Metrics: [...legacyTop3],
    miniMetrics: [...legacyMini],
    leaders: {},
  }

  const fromSnapshot =
    year === TOP_LEADERS_SNAPSHOT_YEAR
      ? readTopLeadersSnapshot(year, upperLeague, 'batting')
      : null

  if (modern) {
    const finalized = finalizeBattingLeadersConfigForTopPage(year, upperLeague, fromSnapshot)
    if (finalized) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[getBattingLeaders] ${year} ${upperLeague}: rankings JSON (modern)`)
      }
      return finalized
    }
  } else if (hasBattingRankingsJsonForLeague(year, upperLeague)) {
    const fromRankings = buildBattingLeadersConfigFromRankings(year, upperLeague)
    if (fromRankings) {
      return fromRankings
    }
  } else if (fromSnapshot && Object.keys(fromSnapshot.leaders).length > 0) {
    return fromSnapshot
  }

  const top3Metrics = modern ? [...BATTING_TOP_2026_SEASON_ALL_METRICS] : [...legacyTop3]
  const miniMetrics = modern ? ([] as const) : [...legacyMini]

  const { rows, availableMetrics } = loadBattingCsv(year, league)
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[getBattingLeaders] ${year} ${league}: ${rows.length} rows, ${availableMetrics.length} metrics`)
    console.log(`[getBattingLeaders] Available metrics:`, availableMetrics.map(m => ({ key: m.key, label: m.label, csvKey: m.csvKey })))
  }
  
  const leaders: Record<string, LeaderRow[]> = {}
  
  // トップ3指標を処理（モダン年度は9指標すべて）
  for (const metricName of top3Metrics) {
    const metric = findMetricByName(availableMetrics, metricName)
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[getBattingLeaders] Searching for metric "${metricName}":`, metric ? `FOUND (key=${metric.key}, csvKey=${metric.csvKey})` : 'NOT FOUND')
    }
    
    if (metric) {
      const sortOrder = (metric.key === 'kpct' || metric.csvKey === 'K%') ? 'asc' : 'desc'
      const topN = getTopNForMetric(rows, metric, battingTop2025SeasonTopN(metricName, year) ?? 3, sortOrder, year, league)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[getBattingLeaders] Top ${battingTop2025SeasonTopN(metricName, year) ?? 3} for "${metricName}":`, topN.length, 'leaders')
      }
      leaders[metricName] = topN
    }
  }
  
  // トップ1指標を処理
  for (const metricName of miniMetrics) {
    const metric = findMetricByName(availableMetrics, metricName)
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[getBattingLeaders] Searching for metric "${metricName}":`, metric ? `FOUND (key=${metric.key}, csvKey=${metric.csvKey})` : 'NOT FOUND')
    }
    
    if (metric) {
      const sortOrder = (metric.key === 'kpct' || metric.csvKey === 'K%') ? 'asc' : 'desc'
      const topN =
        metricName === '打点' && battingTop2025SeasonTopN(metricName, year) != null
          ? (battingTop2025SeasonTopN(metricName, year) ?? 1)
          : 1
      const topLeaders = getTopNForMetric(rows, metric, topN, sortOrder, year, league)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[getBattingLeaders] Top ${topN} for "${metricName}":`, topLeaders.length, 'leaders')
      }
      if (topLeaders.length > 0) {
        leaders[metricName] = topLeaders
      }
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[getBattingLeaders] Final leaders keys:`, Object.keys(leaders))
  }

  const fromCsv: LeadersConfig = {
    top3Metrics: [...top3Metrics],
    miniMetrics: [...miniMetrics],
    leaders,
  }

  if (modern) {
    const finalized = finalizeBattingLeadersConfigForTopPage(year, upperLeague, fromCsv)
    return finalized ?? emptyModern
  }

  return Object.keys(leaders).length > 0 ? fromCsv : emptyLegacy
}

/**
 * Phase 7: 本番 Vercel（public/data 無し）向け。プロキシ経由で JSON を取得。
 */
export async function getBattingLeadersAsync(
  year: string,
  league: string
): Promise<LeadersConfig> {
  const upperLeague = league.toUpperCase()
  const modern = usesTopPageModernLayout(Number(year))
  const legacyTop3 = ['OPS', '打率', '本塁打']
  const legacyMini = ['出塁率', '長打率', '打点', '安打', '盗塁']

  const fromSnapshot = await fetchTopLeadersSnapshotRemote(year, upperLeague, 'batting')

  if (modern) {
    const finalized = await finalizeBattingLeadersConfigForTopPageAsync(
      year,
      upperLeague,
      fromSnapshot
    )
    if (finalized) return finalized
    if (process.env.RANKINGS_BASE_URL?.trim() || process.env.NODE_ENV === 'production') {
      return { top3Metrics: [...BATTING_TOP_2026_SEASON_ALL_METRICS], miniMetrics: [], leaders: {} }
    }
    return getBattingLeaders(year, league)
  }

  if (fromSnapshot && Object.keys(fromSnapshot.leaders).length > 0) {
    return fromSnapshot
  }

  const fromRankings = await (
    await import('@/lib/ranking/leadersFromRankingsJson')
  ).buildBattingLeadersConfigFromRankingsAsync(year, upperLeague)
  if (fromRankings) return fromRankings

  if (process.env.RANKINGS_BASE_URL?.trim() || process.env.NODE_ENV === 'production') {
    return { top3Metrics: legacyTop3, miniMetrics: legacyMini, leaders: {} }
  }

  return getBattingLeaders(year, league)
}

/**
 * 2025年CLの打撃成績リーダーを取得（後方互換性のため残す）
 */
export function get2025CLBattingLeaders(): LeadersConfig {
  return getBattingLeaders('2025', 'CL')
}

