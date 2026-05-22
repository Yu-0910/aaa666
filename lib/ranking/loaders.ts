/**
 * CSVローダー
 * 打撃成績CSVを読み込み、パースする
 */

import fs from 'fs'
import path from 'path'
import type { BattingCsvRow, MetricDefinition } from './types'
import { loadMetricsFromRecord } from './record'

/**
 * CSVファイルのパスを探索（優先順位順）
 * 優先順位:
 * 1. _data/master_csv_calculated/... (計算済みCSV優先)
 * 2. _data/master_csv/...
 * 3. プロジェクトルート直下
 */
function findBattingCsv(year: string, league: string): string | null {
  const upperLeague = league.toUpperCase()
  const searchPaths = [
    path.join(process.cwd(), '_data', 'master_csv_calculated', `batting_${year}_${upperLeague}_from_master.csv`),
    path.join(process.cwd(), '_data', 'master_csv', `batting_${year}_${upperLeague}_from_master.csv`),
    path.join(process.cwd(), `batting_${year}_${upperLeague}_from_master.csv`),
  ]

  for (const csvPath of searchPaths) {
    if (fs.existsSync(csvPath)) {
      return csvPath
    }
  }

  return null
}

/**
 * CSV文字列をパース（簡易実装）
 */
function parseCsv(csvContent: string): BattingCsvRow[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return []

  // ヘッダー行を取得
  const headerLine = lines[0].replace(/^\ufeff/, '') // BOM除去
  const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))

  const rows: BattingCsvRow[] = []

  // データ行をパース
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 簡易CSVパース（カンマ区切り、ダブルクォート対応）
    const values: string[] = []
    let currentValue = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim())
        currentValue = ''
      } else {
        currentValue += char
      }
    }
    values.push(currentValue.trim()) // 最後の値

    // 行オブジェクトを作成
    const row: BattingCsvRow = {}
    headers.forEach((header, index) => {
      const value = values[index] || ''
      // player_name_ja, player_name_en, team は文字列として保持
      if (['player_name_ja', 'player_name_en', 'team'].includes(header.toLowerCase())) {
        row[header] = value
      } else {
        // それ以外の列は数値に変換可能な場合は数値に変換
        // 空文字列や空白のみの場合は空文字列として保持
        const trimmedValue = value.trim()
        if (trimmedValue === '' || trimmedValue.toLowerCase() === 'nan') {
          row[header] = ''
        } else {
          const numValue = Number(trimmedValue)
          // NaNでない、かつ有限数の場合のみ数値として保存
          if (!isNaN(numValue) && isFinite(numValue)) {
            row[header] = numValue
          } else {
            // 数値に変換できない場合は文字列として保持
            row[header] = trimmedValue
          }
        }
      }
    })

    rows.push(row)
  }

  return rows
}

/**
 * 打撃成績CSVを読み込み、利用可能な指標を取得
 */
export function loadBattingCsv(
  year: string,
  league: string
): { rows: BattingCsvRow[]; availableMetrics: MetricDefinition[]; csvPath: string } {
  try {
    // 2026 表示は rankings / top-leaders JSON（R2）が正。CSV の 2025 流用は廃止。
    if (year === '2026') {
      throw new Error(
        'loadBattingCsv: 2026 は CSV を使いません。RANKINGS_BASE_URL または rankings:rebuild を確認してください。'
      )
    }
    const dataYear = year
    const csvPath = findBattingCsv(dataYear, league)

    if (process.env.NODE_ENV === 'development') {
      console.log(`[loadBattingCsv] Searching for CSV: batting_${dataYear}_${league}_from_master.csv`)
      console.log(`[loadBattingCsv] Found path: ${csvPath || 'NOT FOUND'}`)
    }

    if (!csvPath) {
      throw new Error(`CSVファイルが見つかりません: batting_${dataYear}_${league}_from_master.csv`)
    }

    // CSVファイルを読み込む（複数エンコーディング対応）
    const encodings: (BufferEncoding | string)[] = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
    let csvContent: string | null = null

    for (const encoding of encodings) {
      try {
        csvContent = fs.readFileSync(csvPath, encoding as BufferEncoding)
        if (csvContent) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[loadBattingCsv] Successfully read CSV with encoding: ${encoding}`)
          }
          break
        }
      } catch (error) {
        continue
      }
    }

    if (!csvContent) {
      throw new Error(`CSVファイルの読み込みに失敗しました: ${csvPath}`)
    }

    // CSVをパース
    const rows = parseCsv(csvContent)
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[loadBattingCsv] Parsed ${rows.length} rows`)
      // 最初の行の列名を表示（デバッグ用）
      if (rows.length > 0) {
        const firstRow = rows[0]
        const columnNames = Object.keys(firstRow)
        console.log(`[loadBattingCsv] CSV columns (first 20):`, columnNames.slice(0, 20))
        // OPS, AVG, 打率などの列が存在するか確認
        const importantColumns = ['OPS', 'ops', 'AVG', 'avg', '打率', 'OBP', 'obp', '出塁率', 'SLG', 'slg', '長打率']
        const foundColumns = importantColumns.filter(col => columnNames.includes(col))
        console.log(`[loadBattingCsv] Found important columns:`, foundColumns)
        // 最初の行のOPSと打率の値を表示
        if (rows.length > 0) {
          const sampleRow = rows[0]
          console.log(`[loadBattingCsv] Sample row values:`, {
            name: sampleRow['player_name_ja'] || sampleRow['name'] || 'N/A',
            OPS: sampleRow['OPS'] ?? sampleRow['ops'] ?? 'N/A',
            AVG: sampleRow['AVG'] ?? sampleRow['avg'] ?? sampleRow['打率'] ?? 'N/A',
            OPS_type: typeof (sampleRow['OPS'] ?? sampleRow['ops']),
            AVG_type: typeof (sampleRow['AVG'] ?? sampleRow['avg'] ?? sampleRow['打率'])
          })
        }
      }
    }

    // Record.csvから指標リストを取得
    const availableMetrics = loadMetricsFromRecord()
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[loadBattingCsv] Loaded ${availableMetrics.length} metrics from Record.csv`)
    }

    // CSVに存在する指標のみをフィルタリング
    // 注意: csvKeyは日本語名（Record.csvから）、CSVヘッダーは英語名の可能性がある
    // adapter.tsのgetMetricValue関数がマッピングを処理するため、ここではフィルタリングを緩和
    if (rows.length > 0) {
      const csvHeaders = Object.keys(rows[0])
      const csvHeadersLower = new Set(csvHeaders.map(h => h.toLowerCase()))

      // 日本語名から英語名へのマッピング（adapter.tsと同じ）
      const japaneseToEnglish: Record<string, string[]> = {
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

      const filteredMetrics = availableMetrics.filter(metric => {
        // csvKey（日本語名）が直接CSVヘッダーに含まれているかチェック
        if (csvHeadersLower.has(metric.csvKey.toLowerCase())) {
          return true
        }
        
        // マッピングを使用して英語名をチェック
        const candidates = japaneseToEnglish[metric.csvKey] || [metric.csvKey]
        for (const candidate of candidates) {
          if (csvHeadersLower.has(candidate.toLowerCase())) {
            return true
          }
        }
        
        return false
      })

      if (process.env.NODE_ENV === 'development') {
        console.log(`[loadBattingCsv] Filtered to ${filteredMetrics.length} available metrics`)
        console.log(`[loadBattingCsv] CSV headers:`, csvHeaders.slice(0, 10), '...')
        console.log(`[loadBattingCsv] Filtered metrics:`, filteredMetrics.map(m => m.csvKey).slice(0, 10), '...')
      }

      // 開発時のみログ出力
      if (process.env.NODE_ENV === 'development') {
        console.log(`[loadBattingCsv] using: ${csvPath}, rows: ${rows.length}`)
      }

      return { rows, availableMetrics: filteredMetrics, csvPath }
    }

    // 開発時のみログ出力
    if (process.env.NODE_ENV === 'development') {
      console.log(`[loadBattingCsv] using: ${csvPath}, rows: ${rows.length}`)
    }

    return { rows, availableMetrics, csvPath }
  } catch (error) {
    console.error(`[loadBattingCsv] Error loading CSV for ${year} ${league}:`, error)
    throw error
  }
}
