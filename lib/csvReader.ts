/**
 * CSV読み込みユーティリティ
 * Next.jsサーバー側でCSVファイルを読み込む
 */

import fs from 'fs'
import path from 'path'

export interface PlayerRow {
  player_id: string
  player_name_ja: string
  player_name_en: string
  team: string
  G: number
  PA: number
  AB: number
  R: number
  H: number
  '1B': number
  '2B': number
  '3B': number
  HR: number
  TB: number
  RBI: number
  SB: number
  CS: number
  SH: number
  SF: number
  BB: number
  IBB: number
  HBP: number
  SO: number
  GDP: number
  AVG: number
  OBP: number
  SLG: number
  OPS: number
  IsoP: number
  IsoD: number
  'BB%': number
  'K%': number
  'BB/K': number
  BABIP: number
  GPA: number
  NOI: number
  SecA: number
  TA: number
  RC: number
  XR: number
  // 計算で補完される可能性があるフィールド
  singles?: number
  doubles?: number
  triples?: number
  runs?: number
  bbPct?: number
  kPct?: number
  bbk?: number
}

function safeFloat(value: any): number {
  if (value === null || value === undefined || value === '') {
    return 0
  }
  const num = typeof value === 'number' ? value : Number(value)
  return isNaN(num) ? 0 : num
}

function safeInt(value: any): number {
  return Math.round(safeFloat(value))
}

/**
 * CSV行をパース（カンマ区切り、引用符対応）
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされた引用符
        current += '"'
        i++
      } else {
        // 引用符の開始/終了
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  
  return values
}

/**
 * CSVファイルを読み込んでPlayerRow[]に変換
 */
export async function loadBattingCSV(
  year: number,
  league: string
): Promise<PlayerRow[]> {
  // CSVファイルのパスを決定
  const csvPath = path.join(
    process.cwd(),
    '_data',
    'master_csv_calculated',
    `batting_${year}_${league}_from_master.csv`
  )

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }

  // CSVファイルを読み込む（BOM 付き UTF-8 対応）
  let fileContent: string
  try {
    const buf = fs.readFileSync(csvPath)
    fileContent = buf.toString('utf8')
    if (fileContent.charCodeAt(0) === 0xfeff) {
      fileContent = fileContent.slice(1)
    }
  } catch (e) {
    throw new Error(`Failed to read CSV file: ${csvPath}`)
  }
  
  const lines = fileContent.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) {
    return []
  }

  // ヘッダー行を解析
  const headers = parseCSVLine(lines[0])
  
  // データ行を解析
  const players: PlayerRow[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // CSVパース
    const values = parseCSVLine(line)
    
    // ヘッダーと値のマッピング
    const row: any = {}
    headers.forEach((header, idx) => {
      row[header] = values[idx] || ''
    })
    
    // PlayerRowに変換
    const player: PlayerRow = {
      player_id: String(row.player_id || row.playerId || ''),
      player_name_ja: String(row.player_name_ja || row.name || ''),
      player_name_en: String(row.player_name_en || row.player_name_en || row.romanName || ''),
      team: String(row.team || ''),
      G: safeInt(row.G || row.games || 0),
      PA: safeInt(row.PA || row.pa || 0),
      AB: safeInt(row.AB || row.ab || 0),
      R: safeInt(row.R || row.runs || 0),
      H: safeInt(row.H || row.hits || 0),
      '1B': safeInt(row['1B'] || row.単打 || 0),
      '2B': safeInt(row['2B'] || row.二塁打 || 0),
      '3B': safeInt(row['3B'] || row.三塁打 || 0),
      HR: safeInt(row.HR || row.hr || row.本塁打 || 0),
      TB: safeInt(row.TB || row.tb || row.塁打 || 0),
      RBI: safeInt(row.RBI || row.rbi || row.打点 || 0),
      SB: safeInt(row.SB || row.sb || row.盗塁 || 0),
      CS: safeInt(row.CS || row.cs || row.盗塁死 || 0),
      SH: safeInt(row.SH || row.sh || row.犠打 || 0),
      SF: safeInt(row.SF || row.sf || row.犠飛 || 0),
      BB: safeInt(row.BB || row.bb || row.四球 || 0),
      IBB: safeInt(row.IBB || row.ibb || row.敬遠 || 0),
      HBP: safeInt(row.HBP || row.hbp || row.死球 || 0),
      SO: safeInt(row.SO || row.so || row.三振 || 0),
      GDP: safeInt(row.GDP || row.gidp || row.併殺打 || 0),
      AVG: safeFloat(row.AVG || row.avg || row.打率 || 0),
      OBP: safeFloat(row.OBP || row.obp || row.出塁率 || 0),
      SLG: safeFloat(row.SLG || row.slg || row.長打率 || 0),
      OPS: safeFloat(row.OPS || row.ops || 0),
      IsoP: safeFloat(row.IsoP || row.isop || 0),
      IsoD: safeFloat(row.IsoD || row.isod || 0),
      'BB%': safeFloat(row['BB%'] || row['BBPCT'] || row.bbPct || 0),
      'K%': safeFloat(row['K%'] || row['KPCT'] || row.kPct || 0),
      'BB/K': safeFloat(row['BB/K'] || row['BB-K'] || row['BBK'] || row.bbk || 0),
      BABIP: safeFloat(row.BABIP || row.babip || 0),
      GPA: safeFloat(row.GPA || row.gpa || 0),
      NOI: safeFloat(row.NOI || row.noi || 0),
      SecA: safeFloat(row.SecA || row.seca || 0),
      TA: safeFloat(row.TA || row.ta || 0),
      RC: safeFloat(row.RC || row.rc || 0),
      XR: safeFloat(row.XR || row.xr || 0),
    }
    
    // 計算で補完
    // singles = H - 2B - 3B - HR
    if (!player['1B'] && player.H > 0) {
      player.singles = player.H - player['2B'] - player['3B'] - player.HR
      if (player.singles < 0) player.singles = 0
      player['1B'] = player.singles
    }
    
    // runs = R
    player.runs = player.R
    
    // doubles = 2B, triples = 3B
    player.doubles = player['2B']
    player.triples = player['3B']
    
    // bbPct, kPct, bbk
    player.bbPct = player['BB%']
    player.kPct = player['K%']
    player.bbk = player['BB/K']
    
    players.push(player)
  }
  
  return players
}

