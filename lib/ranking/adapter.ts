/**
 * ランキング生成アダプター
 * CSVデータをUI表示用のViewModelに変換
 * 整形・ソート・ランキング付与までここで完結
 */

import type { BattingCsvRow, RankingRow, MetricDefinition } from './types'
import { formatStat } from '@/lib/formatStat'
import { getJsonKey, loadMetricMap } from './metricMap'

/**
 * 計算で補完される指標の値を計算
 */
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

function calculateDerivedValue(row: BattingCsvRow, csvKey: string): number | null {
  if (csvKey === 'OPS') {
    // OPS = OBP + SLG
    // まず既存の値を取得
    let obp = getNumericValue(row, ['OBP', 'obp', '出塁率'])
    let slg = getNumericValue(row, ['SLG', 'slg', '長打率'])
    
    // 出塁率が空の場合は計算
    if (obp === null) {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
    }
    
    // 長打率が空の場合は計算
    if (slg === null) {
      const tb = calculateTB(row)
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
    }
    
    // AB=0 でも OBP は定義され得る。SLG 未定義時は 0 とみなして OPS = OBP + SLG
    if (obp !== null) {
      return obp + (slg ?? 0)
    }
  } else if (csvKey === '長打率' || csvKey === 'SLG') {
    // 長打率 = TB / AB
    const tb = calculateTB(row)
    const ab = getNumericValue(row, ['AB', 'ab', '打数'])
    if (ab !== null && ab > 0 && tb !== null) {
      return tb / ab
    }
  } else if (csvKey === '打率' || csvKey === 'AVG' || csvKey === 'avg') {
    // 打率 = H / AB
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打'])
    const ab = getNumericValue(row, ['AB', 'ab', '打数'])
    if (ab !== null && ab > 0 && h !== null && h >= 0) {
      const calculatedAvg = h / ab
      // デバッグログ（開発時のみ、最初の数行のみ）
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
        console.log(`[calculateDerivedValue] 打率 calculation: H=${h}, AB=${ab}, AVG=${calculatedAvg}`, {
          rowH: row['H'],
          rowh: row['h'],
          rowHits: row['Hits'],
          rowhits: row['hits'],
          row安打: row['安打'],
          rowAB: row['AB'],
          rowab: row['ab'],
          row打数: row['打数']
        })
      }
      return calculatedAvg
    }
  } else if (csvKey === '出塁率' || csvKey === 'OBP') {
    // 出塁率 = (H + BB + HBP) / (AB + BB + HBP + SF)
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
    const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
    const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
    const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
    const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
    const numerator = h + bb + hbp
    const denominator = ab + bb + hbp + sf
    if (denominator > 0) {
      return numerator / denominator
    }
  } else if (csvKey === 'BB%') {
    const bb = getNumericValue(row, ['BB', 'bb', '四球'])
    const pa = getNumericValue(row, ['PA', 'pa', '打席'])
    if (pa !== null && pa > 0 && bb !== null) {
      return (bb / pa) * 100
    }
  } else if (csvKey === 'K%') {
    const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振'])
    const pa = getNumericValue(row, ['PA', 'pa', '打席'])
    if (pa !== null && pa > 0 && so !== null) {
      return (so / pa) * 100
    }
  } else if (csvKey === 'BB/K' || csvKey === 'BB-K' || csvKey === 'BBK') {
    const bb = getNumericValue(row, ['BB', 'bb', '四球'])
    const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振'])
    if (so !== null && so > 0 && bb !== null) {
      return bb / so
    }
  } else if (csvKey === 'IsoP' || csvKey === 'isop') {
    // IsoP = SLG - AVG
    // 2025年のCSVでは、SLGがAVGと同じ値になっている場合があるため、常に計算値を使用
    // SLGを計算（CSVの値は無視）
    const tb = calculateTB(row)
    const ab = getNumericValue(row, ['AB', 'ab', '打数'])
    let slg: number | null = null
    if (ab !== null && ab > 0 && tb !== null) {
      slg = tb / ab
    }
    
    // AVGを計算（CSVの値は無視）
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打'])
    let avg: number | null = null
    if (ab !== null && ab > 0 && h !== null && h >= 0) {
      avg = h / ab
    }
    
    if (slg !== null && avg !== null) {
      return slg - avg
    }
  } else if (csvKey === 'IsoD' || csvKey === 'isod') {
    // IsoD = OBP - AVG
    // 2025年のCSVでは、OBPとAVGが正しくない場合があるため、常に計算値を使用
    // OBPを計算（CSVの値は無視）
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
    
    // AVGを計算（CSVの値は無視）
    let avg: number | null = null
    if (ab !== null && ab > 0 && h !== null && h >= 0) {
      avg = h / ab
    }
    
    if (obp !== null && avg !== null) {
      return obp - avg
    }
  } else if (csvKey === 'RC' || csvKey === 'rc') {
    // RC = ((H + BB) * TB) / (AB + BB)
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
    const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
    const tb = calculateTB(row)
    const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
    const denominator = ab + bb
    if (denominator > 0 && tb !== null) {
      return ((h + bb) * tb) / denominator
    }
  } else if (csvKey === 'XR' || csvKey === 'xr') {
    // XR = 0.50*1B + 0.72*2B + 1.04*3B + 1.44*HR + 0.33*(BB+HBP) + 0.18*SB - 0.32*CS - 0.098*(AB-H)
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
    const doubles = getNumericValue(row, ['2B', 'doubles', '二塁打']) ?? 0
    const triples = getNumericValue(row, ['3B', 'triples', '三塁打']) ?? 0
    const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
    const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
    const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
    const sb = getNumericValue(row, ['SB', 'sb', '盗塁']) ?? 0
    const cs = getNumericValue(row, ['CS', 'cs', '盗塁死', '盗塁刺']) ?? 0
    const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
    const singles = h > 0 ? h - doubles - triples - hr : 0
    return 0.50 * singles + 0.72 * doubles + 1.04 * triples + 1.44 * hr +
           0.33 * (bb + hbp) + 0.18 * sb - 0.32 * cs - 0.098 * (ab - h)
  } else if (csvKey === 'BABIP' || csvKey === 'babip') {
    // BABIP = (H - HR) / (AB - SO - HR + SF)
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
    const hr = getNumericValue(row, ['HR', 'hr', '本塁打']) ?? 0
    const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
    const so = getNumericValue(row, ['SO', 'so', 'K', 'k', '三振']) ?? 0
    const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
    const denominator = ab - so - hr + sf
    if (denominator > 0) {
      return (h - hr) / denominator
    }
  } else if (csvKey === 'SecA' || csvKey === 'seca') {
    // SecA = (BB + (TB - H)) / AB
    const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
    const tb = calculateTB(row)
    const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
    const ab = getNumericValue(row, ['AB', 'ab', '打数'])
    if (ab !== null && ab > 0 && tb !== null) {
      return (bb + (tb - h)) / ab
    }
  } else if (csvKey === 'TA' || csvKey === 'ta') {
    // TA = (TB + BB + HBP + SB) / (AB + BB + HBP + CS)
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
  } else if (csvKey === 'NOI' || csvKey === 'noi') {
    // NOI = (OBP + SLG/3) * 1000
    let obp = getNumericValue(row, ['OBP', 'obp', '出塁率'])
    if (obp === null) {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
    }
    let slg = getNumericValue(row, ['SLG', 'slg', '長打率'])
    if (slg === null) {
      const tb = calculateTB(row)
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
    }
    if (obp !== null) {
      return (obp + (slg ?? 0) / 3) * 1000
    }
  } else if (csvKey === 'GPA' || csvKey === 'gpa') {
    // GPA = (1.8 * OBP + SLG) / 4
    let obp = getNumericValue(row, ['OBP', 'obp', '出塁率'])
    if (obp === null) {
      const h = getNumericValue(row, ['H', 'h', 'Hits', 'hits', '安打']) ?? 0
      const bb = getNumericValue(row, ['BB', 'bb', '四球']) ?? 0
      const hbp = getNumericValue(row, ['HBP', 'hbp', '死球']) ?? 0
      const ab = getNumericValue(row, ['AB', 'ab', '打数']) ?? 0
      const sf = getNumericValue(row, ['SF', 'sf', '犠飛']) ?? 0
      const denominator = ab + bb + hbp + sf
      if (denominator > 0) {
        obp = (h + bb + hbp) / denominator
      }
    }
    let slg = getNumericValue(row, ['SLG', 'slg', '長打率'])
    if (slg === null) {
      const tb = calculateTB(row)
      const ab = getNumericValue(row, ['AB', 'ab', '打数'])
      if (ab !== null && ab > 0 && tb !== null) {
        slg = tb / ab
      }
    }
    if (obp !== null) {
      return (1.8 * obp + (slg ?? 0)) / 4
    }
  } else if (csvKey === '単打' || csvKey === '1B' || csvKey === 'singles') {
    // 単打 = H - 2B - 3B - HR
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
  }
  return null
}

/**
 * 行から数値を取得（候補列名を順に試す）
 */
function getNumericValue(row: BattingCsvRow, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const value = row[candidate]
    if (value !== undefined && value !== null) {
      // 空文字列の場合は0として扱う（CSVで値が空の場合は0とみなす）
      if (value === '' || (typeof value === 'string' && value.trim() === '')) {
        return 0
      }
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
 * 指標の値を取得（大小文字・記号のゆらぎに対応）
 */
function getMetricValue(row: BattingCsvRow, metric: MetricDefinition): number | null {
  const csvKey = metric.csvKey
  
  // 既知のマッピング（CSV列名 → 値の取得）
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
    '盗塁刺': ['盗塁刺', '盗塁死', 'CS', 'cs'], // Record.csvに「盗塁刺」と書かれている場合の対応
    // 注意: CSVには「CS」列と「盗塁死」列の両方が存在する可能性がある
    // 「盗塁死」列が空の場合、「CS」列の値を使用する
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
  
  // 計算可能な指標のリスト
  const calculableMetrics = [
    'OPS', '長打率', 'SLG', '打率', 'AVG', 'avg', '出塁率', 'OBP', 'BB%', 'K%', 'BB/K', 'BB-K', 'BBK',
    'IsoP', 'isop', 'IsoD', 'isod', 'RC', 'rc', 'XR', 'xr',
    'BABIP', 'babip', 'SecA', 'seca', 'TA', 'ta', 'NOI', 'noi', 'GPA', 'gpa',
    '単打', '1B', 'singles'
  ]
  
  let csvValue: number | null = null
  
  // 候補列名を順に試す
  for (const candidate of candidates) {
    // 空文字列もチェック（計算で補完する可能性があるため）
    if (row[candidate] !== undefined && row[candidate] !== null) {
      const rawValue = row[candidate]
      
      // 空文字列の場合、盗塁死やカウント系指標の場合は0として扱う
      if (rawValue === '' || (typeof rawValue === 'string' && rawValue.trim() === '')) {
        // カウント系指標（盗塁死、四球、敬遠、死球、三振、塁打、盗塁、犠打、犠飛、併殺打など）の場合は0として扱う
        const countMetrics = ['盗塁死', '盗塁刺', '四球', '敬遠', '死球', '三振', '塁打', '盗塁', '犠打', '犠飛', '併殺打', 
                              'CS', 'cs', 'BB', 'bb', 'IBB', 'ibb', 'HBP', 'hbp', 'SO', 'so', 'K', 'k', 'TB', 'tb', 'SB', 'sb', 'SH', 'sh', 'SF', 'sf', 'GDP', 'gdp', 'GIDP', 'gidp',
                              '安打', '本塁打', '打点', '試合', '打席', '打数', '単打', '二塁打', '三塁打', '得点',
                              'H', 'h', 'HR', 'hr', 'RBI', 'rbi', 'G', 'g', 'PA', 'pa', 'AB', 'ab', '1B', '2B', '3B', 'R', 'r']
        // csvKeyまたはcandidateがカウント系指標に含まれているかチェック
        const isCountMetric = countMetrics.some(m => 
          csvKey === m || candidate === m || 
          csvKey.toLowerCase() === m.toLowerCase() || 
          candidate.toLowerCase() === m.toLowerCase()
        )
        if (isCountMetric) {
          csvValue = 0
          if (process.env.NODE_ENV === 'development' && (csvKey === '盗塁死' || csvKey === '盗塁刺' || candidate === '盗塁死' || candidate === '盗塁刺' || candidate === 'CS' || candidate === 'cs')) {
            console.log(`[getMetricValue] Found ${csvKey} (${candidate}) as empty string, treating as 0`)
          }
          break
        }
        // 計算可能な指標の場合は計算で補完を試みる
        continue
      }
      
      // "nan" 文字列を検出して除外
      if (typeof rawValue === 'string' && rawValue.toLowerCase() === 'nan') {
        continue
      }
      
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      if (!isNaN(value) && isFinite(value)) {
        csvValue = value
        // デバッグログ（開発時のみ、盗塁死の場合のみ）
        if (process.env.NODE_ENV === 'development' && (csvKey === '盗塁死' || csvKey === '盗塁刺')) {
          console.log(`[getMetricValue] Found ${csvKey} (${candidate}):`, {
            rawValue,
            value,
            type: typeof rawValue,
            rowKeys: Object.keys(row).filter(k => k.includes('盗塁') || k.toLowerCase().includes('cs'))
          })
        }
        break
      }
    }
  }
  
  // 盗塁死の場合、値が取得できなかった場合のデバッグログ
  if (process.env.NODE_ENV === 'development' && (csvKey === '盗塁死' || csvKey === '盗塁刺') && csvValue === null) {
    console.log(`[getMetricValue] Failed to get ${csvKey}, tried candidates:`, candidates, {
      rowKeys: Object.keys(row).filter(k => k.includes('盗塁') || k.toLowerCase().includes('cs')),
      rowSample: {
        盗塁死: row['盗塁死'],
        盗塁刺: row['盗塁刺'],
        CS: row['CS'],
        cs: row['cs'],
        // 値の型も確認
        盗塁死_type: typeof row['盗塁死'],
        CS_type: typeof row['CS']
      }
    })
  }
  
  // 計算可能な指標の場合、CSVの値が明らかに間違っている場合は計算値を優先
  if (calculableMetrics.includes(csvKey)) {
    const calculatedValue = calculateDerivedValue(row, csvKey)
    
    // OPSの場合、CSVの値が0.5未満の場合は明らかに間違っているので計算値を優先
    if (csvKey === 'OPS') {
      if (calculatedValue !== null) {
        // CSVの値が存在し、かつ0.5未満の場合は計算値を優先
        if (csvValue !== null && csvValue < 0.5) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[getMetricValue] OPS value from CSV (${csvValue}) is too low, using calculated value (${calculatedValue})`)
          }
          return calculatedValue
        }
        // CSVの値が存在しない場合は計算値を返す
        if (csvValue === null) {
          return calculatedValue
        }
        // CSVの値が0.5以上の場合でも、計算値との差が大きい場合は計算値を優先
        if (Math.abs(csvValue - calculatedValue) > 0.1) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[getMetricValue] OPS value from CSV (${csvValue}) differs significantly from calculated value (${calculatedValue}), using calculated value`)
          }
          return calculatedValue
        }
      }
    }
    
    // その他の計算可能な指標の場合
    if (calculatedValue !== null) {
      // CSVの値が存在しない場合は計算値を返す
      if (csvValue === null) {
        return calculatedValue
      }
      // CSVの値が存在する場合は、計算値との差が大きい場合のみ計算値を優先（OPS以外）
      // ただし、長打率や出塁率、打率の場合は、CSVの値が0未満や1を超える場合は計算値を優先
      if (csvKey === '長打率' || csvKey === 'SLG') {
        // 2025年のCSVでは、SLGがAVGと同じ値になっている場合があるため、常に計算値を使用
        if (calculatedValue !== null) {
          // CSVの値がAVGと同じ場合（誤ってAVGが入っている可能性）は計算値を優先
          const avg = getNumericValue(row, ['AVG', 'avg', '打率'])
          if (avg !== null && Math.abs(csvValue - avg) < 0.001) {
            // CSVの値がAVGとほぼ同じ場合は計算値を優先
            if (process.env.NODE_ENV === 'development') {
              console.log(`[getMetricValue] ${csvKey} value from CSV (${csvValue}) is same as AVG (${avg}), using calculated value (${calculatedValue})`)
            }
            return calculatedValue
          }
          // CSVの値が範囲外の場合は計算値を優先
          if (csvValue < 0 || csvValue > 1.5) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[getMetricValue] ${csvKey} value from CSV (${csvValue}) is out of range, using calculated value (${calculatedValue})`)
            }
            return calculatedValue
          }
          // 2025年のCSVでは、SLGが正しく計算されていない可能性があるため、計算値との差が大きい場合は計算値を優先
          if (Math.abs(csvValue - calculatedValue) > 0.05) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[getMetricValue] ${csvKey} value from CSV (${csvValue}) differs significantly from calculated value (${calculatedValue}), using calculated value`)
            }
            return calculatedValue
          }
        }
      }
      if (csvKey === '出塁率' || csvKey === 'OBP') {
        // 2025年のCSVでは、OBPが正しく計算されていない可能性があるため、計算値との差が大きい場合は計算値を優先
        if (calculatedValue !== null) {
          if (csvValue < 0 || csvValue > 1) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[getMetricValue] ${csvKey} value from CSV (${csvValue}) is out of range, using calculated value (${calculatedValue})`)
            }
            return calculatedValue
          }
          // 計算値との差が大きい場合は計算値を優先
          if (Math.abs(csvValue - calculatedValue) > 0.05) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[getMetricValue] ${csvKey} value from CSV (${csvValue}) differs significantly from calculated value (${calculatedValue}), using calculated value`)
            }
            return calculatedValue
          }
        }
      }
      if (csvKey === '打率' || csvKey === 'AVG' || csvKey === 'avg') {
        // 打率は常に計算値（H/AB）を使用（CSVの値は無視）
        if (calculatedValue !== null) {
          if (process.env.NODE_ENV === 'development' && csvValue !== null) {
            console.log(`[getMetricValue] ${csvKey} ignoring CSV value (${csvValue}), using calculated value (${calculatedValue})`)
          }
          return calculatedValue
        }
      }
      
      // IsoPとIsoDは常に計算値を使用（CSVの値は無視）
      if (csvKey === 'IsoP' || csvKey === 'isop') {
        if (calculatedValue !== null) {
          if (process.env.NODE_ENV === 'development' && csvValue !== null) {
            console.log(`[getMetricValue] ${csvKey} ignoring CSV value (${csvValue}), using calculated value (${calculatedValue})`)
          }
          return calculatedValue
        }
      }
      
      if (csvKey === 'IsoD' || csvKey === 'isod') {
        if (calculatedValue !== null) {
          if (process.env.NODE_ENV === 'development' && csvValue !== null) {
            console.log(`[getMetricValue] ${csvKey} ignoring CSV value (${csvValue}), using calculated value (${calculatedValue})`)
          }
          return calculatedValue
        }
      }
    }
  }
  
  // CSVの値が存在する場合はそれを返す
  if (csvValue !== null) {
    return csvValue
  }
  
  // 盗塁死の場合、CS列の値を使用する（盗塁死列が空の場合）
  if ((csvKey === '盗塁死' || csvKey === '盗塁刺') && csvValue === null) {
    const csValue = getNumericValue(row, ['CS', 'cs'])
    if (csValue !== null) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[getMetricValue] Using CS column value (${csValue}) for ${csvKey}`)
      }
      return csValue
    }
    // CS列も空の場合は0を返す
    if (process.env.NODE_ENV === 'development') {
      console.log(`[getMetricValue] Both 盗塁死 and CS columns are empty, returning 0`)
    }
    return 0
  }
  
  // 計算可能な指標で、CSVの値が存在しない場合は計算値を返す
  if (calculableMetrics.includes(csvKey)) {
    const calculatedValue = calculateDerivedValue(row, csvKey)
    if (calculatedValue !== null) {
      return calculatedValue
    }
  }
  
  return null
}

/**
 * 選手名を取得（日本語名と英字名）
 */
function getPlayerNames(row: BattingCsvRow): { name: string; romanName?: string; playerId: string } {
  const name = (row['player_name_ja'] || row['name'] || row['Name'] || '').toString().trim()
  const romanNameRaw = (row['player_name_en'] || row['romanName'] || row['name_en'] || '').toString().trim()
  // 空文字列の場合はundefinedに変換
  const romanName = romanNameRaw && romanNameRaw.length > 0 ? romanNameRaw : undefined
  const playerId = (row['player_id'] || row['playerId'] || row['id'] || '').toString().trim()
  
  return {
    name: name || '不明',
    romanName: romanName,
    playerId: playerId || '0',
  }
}

/**
 * チーム名を取得
 */
function getTeamName(row: BattingCsvRow): string {
  return (row['team'] || row['Team'] || row['チーム'] || '').toString().trim() || '不明'
}

/**
 * 指標のソート順を取得（降順がデフォルト、K%のみ昇順）
 */
function getSortOrder(metric: MetricDefinition): 'asc' | 'desc' {
  // K%のみ昇順（小さいほど良い）
  if (metric.key === 'k%' || metric.csvKey === 'K%') {
    return 'asc'
  }
  return 'desc'
}

/**
 * ランキングを生成
 * @param rows CSV行配列
 * @param metric 指標定義
 * @param topN 上位N件（デフォルト100）
 * @returns ランキング行配列
 */
export function buildRanking(
  rows: BattingCsvRow[],
  metric: MetricDefinition,
  topN: number = 100
): RankingRow[] {
  // 指標の値を取得してソート
  const items: Array<{ row: BattingCsvRow; value: number }> = []
  
  for (const row of rows) {
    const value = getMetricValue(row, metric)
    if (value !== null && !isNaN(value)) {
      items.push({ row, value })
    }
  }
  
  // ソート（降順がデフォルト、K%のみ昇順）
  const sortOrder = getSortOrder(metric)
  items.sort((a, b) => {
    if (sortOrder === 'asc') {
      return a.value - b.value
    } else {
      return b.value - a.value
    }
  })
  
  // 上位N件を取得
  const topItems = items.slice(0, topN)
  
  // ランキング行を生成
  const rankingRows: RankingRow[] = topItems.map((item, index) => {
    const { name, romanName, playerId } = getPlayerNames(item.row)
    const team = getTeamName(item.row)
    const valueText = formatStat(metric.label, item.value)
    
    return {
      rank: index + 1,
      playerId,
      name,
      romanName,
      team,
      valueText,
      rawValue: item.value,
    }
  })
  
  return rankingRows
}

/**
 * 全指標の値を含むランキングデータを生成（ソートは行わない）
 * Client側でソートを行うための生データを返す
 */
export function buildRankingWithAllMetrics(
  rows: BattingCsvRow[],
  availableMetrics: MetricDefinition[]
): RankingRow[] {
  const QUAL_PA = 443 // 規定打席（2025年PL）

  // 重複排除: player_idまたは(選手名, チーム名)で重複している行を排除（安全装置）
  // 同じplayer_idで複数行がある場合、PAが最大の行を優先（次点AB最大）
  // player_idが空の場合は(選手名, チーム名)で識別
  const playerIdGroups = new Map<string, BattingCsvRow[]>()
  const nameTeamGroups = new Map<string, BattingCsvRow[]>()
  
  for (const row of rows) {
    const playerId = (row['player_id'] || row['playerId'] || '').toString().trim()
    const playerName = getPlayerNames(row).name
    const teamName = getTeamName(row)
    
    // player_idがある場合はplayer_idでグループ化
    if (playerId && playerId !== '0' && playerId !== '') {
      if (!playerIdGroups.has(playerId)) {
        playerIdGroups.set(playerId, [])
      }
      playerIdGroups.get(playerId)!.push(row)
    } else {
      // player_idが空の場合は(選手名, チーム名)でグループ化
      const nameTeamKey = `${playerName}::${teamName}`
      if (!nameTeamGroups.has(nameTeamKey)) {
        nameTeamGroups.set(nameTeamKey, [])
      }
      nameTeamGroups.get(nameTeamKey)!.push(row)
    }
  }
  
  // 各player_idグループから最適な行を選択
  const uniqueRows: BattingCsvRow[] = []
  
  // player_idでグループ化された行を処理
  for (const [playerId, groupRows] of playerIdGroups.entries()) {
    if (groupRows.length === 1) {
      uniqueRows.push(groupRows[0])
    } else {
      // 複数行がある場合、PAが最大の行を優先（次点AB最大）
      const selectedRow = groupRows.reduce((best, current) => {
        const bestPA = getNumericValue(best, ['PA', 'pa', '打席']) ?? 0
        const currentPA = getNumericValue(current, ['PA', 'pa', '打席']) ?? 0
        
        if (currentPA > bestPA) {
          return current
        } else if (currentPA === bestPA) {
          // PAが同じ場合はABで比較
          const bestAB = getNumericValue(best, ['AB', 'ab', '打数']) ?? 0
          const currentAB = getNumericValue(current, ['AB', 'ab', '打数']) ?? 0
          return currentAB > bestAB ? current : best
        }
        return best
      })
      uniqueRows.push(selectedRow)
    }
  }
  
  // (選手名, チーム名)でグループ化された行を処理
  for (const [nameTeamKey, groupRows] of nameTeamGroups.entries()) {
    if (groupRows.length === 1) {
      uniqueRows.push(groupRows[0])
    } else {
      // 複数行がある場合、PAが最大の行を優先（次点AB最大）
      const selectedRow = groupRows.reduce((best, current) => {
        const bestPA = getNumericValue(best, ['PA', 'pa', '打席']) ?? 0
        const currentPA = getNumericValue(current, ['PA', 'pa', '打席']) ?? 0
        
        if (currentPA > bestPA) {
          return current
        } else if (currentPA === bestPA) {
          // PAが同じ場合はABで比較
          const bestAB = getNumericValue(best, ['AB', 'ab', '打数']) ?? 0
          const currentAB = getNumericValue(current, ['AB', 'ab', '打数']) ?? 0
          return currentAB > bestAB ? current : best
        }
        return best
      })
      uniqueRows.push(selectedRow)
    }
  }

  // 規定打席フィルタ（PA > 0 のみ、規定打席が必要な指標の場合は QUAL_PA 以上）
  // 注意: ここでは全指標を表示するため、PA > 0 のみフィルタ（Client側でソート時に規定打席を考慮）
  const filteredRows = uniqueRows.filter(row => {
    const pa = getNumericValue(row, ['PA', 'pa', '打席'])
    return pa !== null && pa > 0
  })

  // 全指標の値を含むランキング行を生成
  const rankingRows: RankingRow[] = filteredRows.map((row, index) => {
    const { name, romanName, playerId } = getPlayerNames(row)
    const team = getTeamName(row)
    
    // 基本情報
    const playerRow: RankingRow = {
      rank: index + 1, // 仮のランク（Client側でソート後に再計算）
      playerId,
      name,
      romanName,
      team,
      valueText: '', // 使用しない（Client側で動的に生成）
    }

    // 全指標の値を設定
    for (const metric of availableMetrics) {
      const value = getMetricValue(row, metric)
      if (value !== null && !isNaN(value) && isFinite(value)) {
        playerRow[metric.key] = value
      } else {
        // デバッグログ（開発時のみ、最初の数行のみ、重要な指標のみ）
        if (process.env.NODE_ENV === 'development' && 
            index < 5 && 
            (metric.csvKey === 'OPS' || metric.csvKey === '長打率' || metric.csvKey === 'SLG' || metric.csvKey === '出塁率' || metric.csvKey === 'OBP')) {
          console.log(`[buildRankingWithAllMetrics] Failed to get ${metric.csvKey} (key: ${metric.key}) for ${name}:`, {
            value,
            rowKeys: Object.keys(row).filter(k => 
              k.toLowerCase().includes('ops') || 
              k.toLowerCase().includes('slg') || 
              k.toLowerCase().includes('長打') ||
              k.toLowerCase().includes('obp') ||
              k.toLowerCase().includes('出塁') ||
              k.toLowerCase().includes('tb') ||
              k.toLowerCase().includes('塁打') ||
              k.toLowerCase().includes('ab') ||
              k.toLowerCase().includes('打数') ||
              k.toLowerCase().includes('h') ||
              k.toLowerCase().includes('安打')
            ),
            rowSample: {
              OPS: row['OPS'] ?? row['ops'],
              SLG: row['SLG'] ?? row['slg'] ?? row['長打率'],
              OBP: row['OBP'] ?? row['obp'] ?? row['出塁率'],
              TB: row['TB'] ?? row['tb'] ?? row['塁打'],
              AB: row['AB'] ?? row['ab'] ?? row['打数'],
              H: row['H'] ?? row['h'] ?? row['安打'],
              '2B': row['2B'] ?? row['二塁打'],
              '3B': row['3B'] ?? row['三塁打'],
              HR: row['HR'] ?? row['hr'] ?? row['本塁打'],
              BB: row['BB'] ?? row['bb'] ?? row['四球'],
              HBP: row['HBP'] ?? row['hbp'] ?? row['死球'],
              SF: row['SF'] ?? row['sf'] ?? row['犠飛'],
            }
          })
        }
      }
    }

    // PAの値を明示的に含める（規定打席フィルタ用）
    const pa = getNumericValue(row, ['PA', 'pa', '打席'])
    if (pa !== null) {
      playerRow['PA'] = pa
      playerRow['pa'] = pa
    }

    return playerRow
  })

  return rankingRows
}

/**
 * JSONランキングデータからRankingRowに変換
 */
export function convertJsonToRankingRow(jsonRow: any, metricKey: string): RankingRow {
  // JSONの構造に応じて値を取得
  const rank = jsonRow.rank || 0
  const playerId = jsonRow.playerId || jsonRow.id || '0'
  const name = jsonRow.name || jsonRow.player || '不明'
  // romanNameが空文字列の場合はundefinedに変換
  const romanNameRaw = jsonRow.romanName || jsonRow.roman || undefined
  const romanName = (romanNameRaw && romanNameRaw.trim() !== '') ? romanNameRaw : undefined
  const team = jsonRow.team || '不明'
  
  // 指標の値を取得（metricKeyでアクセス）
  const rawValue = jsonRow[metricKey] !== undefined ? jsonRow[metricKey] : jsonRow.value
  
  // valueTextはformatStatで整形（必要に応じて）
  const valueText = rawValue !== null && rawValue !== undefined 
    ? String(rawValue) 
    : ''
  
  // RankingRowを構築（全指標の値も含める）
  const rankingRow: RankingRow = {
    rank,
    playerId: String(playerId),
    name: String(name),
    romanName,
    team: String(team),
    valueText,
    rawValue: typeof rawValue === 'number' ? rawValue : undefined,
  }
  
  // JSONの全フィールドをコピー（全指標の値を含める）
  for (const key in jsonRow) {
    if (key !== 'rank' && key !== 'playerId' && key !== 'name' && key !== 'romanName' && key !== 'team' && key !== 'valueText' && key !== 'rawValue') {
      rankingRow[key] = jsonRow[key]
    }
  }
  
  return rankingRow
}

/**
 * JSONランキングデータの配列からRankingRow配列に変換
 */
export function convertJsonArrayToRankingRows(jsonData: any[], metricKey: string): RankingRow[] {
  return jsonData.map(jsonRow => convertJsonToRankingRow(jsonRow, metricKey))
}

/**
 * 指標名からMetricDefinitionを生成
 * JSONファイル名（例: "OPS.json", "打率.json"）からJSON内のキー名を推測
 * metric_map.jsonを使用してマッピング（単一ソース）
 */
export function createMetricDefinitionFromName(metricName: string): MetricDefinition {
  // metric_map.jsonからマッピングを取得（単一ソース）
  const metricMap = loadMetricMap()
  
  // ファイル名から指標名への逆変換（BB_K → BB/K）
  // ファイル名の特殊文字を元に戻す
  const fileToMetricName: Record<string, string> = {
    'BB_K': 'BB/K',
    'BB-K': 'BB/K',
  }
  
  // ファイル名の場合は指標名に変換
  const actualMetricName = fileToMetricName[metricName] || metricName
  
  // metric_map.jsonに存在する場合はそれを使用
  let key: string
  if (metricMap[actualMetricName]) {
    key = metricMap[actualMetricName]
  } else {
    // metric_map.jsonに存在しない場合のフォールバック
    // ファイル名の特殊文字を処理（BB/K → BB_K → bbk）
    const normalized = actualMetricName.replace(/\//g, '_').replace(/%/g, '').toLowerCase()
    
    // 既知の特殊ケース
    const specialCases: Record<string, string> = {
      'bb_k': 'bbk',
      'bb-k': 'bbk',
    }
    
    key = specialCases[normalized] || normalized
  }
  
  return {
    key,
    label: actualMetricName, // 表示用には正しい指標名を使用
    csvKey: actualMetricName, // JSONの場合はcsvKeyも同じ
  }
}













