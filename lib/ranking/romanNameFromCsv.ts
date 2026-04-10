/**
 * CSV（player_name_en列）・NPB名簿を参照して英字名マップを取得（サーバー・スクリプト専用）
 * クライアントから import しないこと（fs / npbRoster を引くため）。
 */

import path from 'path'
import fs from 'fs'
import { getNpbRoster2026, rosterEnglishShortForRanking } from '@/lib/npbRoster'
import { normalizeRomanMapKey, normalizeRomanMapKeyNoSpace } from '@/lib/ranking/romanNameLookup'

/** スクリプト向けに re-export（phase12 / phase19 等） */
export { normalizeRomanMapKey, normalizeRomanMapKeyNoSpace } from '@/lib/ranking/romanNameLookup'

/** phase19 の CSV_TEAM_TO_RANKING_SHORT と同一（ランキング JSON の team 短縮名と揃える） */
const CSV_TEAM_TO_RANKING_SHORT: Record<string, string> = {
  中日ドラゴンズ: '中日',
  広島東洋カープ: '広島',
  東京ヤクルトスワローズ: 'ヤクルト',
  読売ジャイアンツ: '巨人',
  阪神タイガース: '阪神',
  横浜DeNAベイスターズ: 'DeNA',
  // 中黒「・」は識別子に使えないためキーは必ず文字列リテラル
  'オリックス・バファローズ': 'オリックス',
  千葉ロッテマリーンズ: 'ロッテ',
  北海道日本ハムファイターズ: '日本ハム',
  東北楽天ゴールデンイーグルス: '楽天',
  埼玉西武ライオンズ: '西武',
  福岡ソフトバンクホークス: 'ソフトバンク',
}

const CL_TEAM_SHORT = new Set(['巨人', '阪神', '中日', '広島', 'DeNA', 'ヤクルト'])

function toRankingTeamShort(teamFull: string): string {
  const t = (teamFull ?? '').trim()
  return CSV_TEAM_TO_RANKING_SHORT[t] ?? t
}

function rosterLeagueFromTeamFull(teamFull: string): 'CL' | 'PL' {
  return CL_TEAM_SHORT.has(toRankingTeamShort(teamFull)) ? 'CL' : 'PL'
}

/**
 * 1 選手分の英字名を、フルチーム名・ランキング短縮名・NFKC 名の組み合わせでマップに登録
 */
function registerRomanAliases(map: Record<string, string>, nameRaw: string, teamRaw: string, en: string) {
  const enTrim = en.trim()
  if (!enTrim) return

  const nameVariants = new Set<string>()
  const n0 = (nameRaw ?? '').trim()
  if (n0) nameVariants.add(n0)
  try {
    const nk = n0.normalize('NFKC').trim()
    if (nk) nameVariants.add(nk)
  } catch {
    /* ignore */
  }

  const teamVariants = new Set<string>()
  const t0 = (teamRaw ?? '').trim()
  if (t0) teamVariants.add(t0)
  const short = toRankingTeamShort(t0)
  if (short && short !== t0) teamVariants.add(short)

  for (const n of nameVariants) {
    for (const t of teamVariants) {
      if (!t) continue
      const k1 = normalizeRomanMapKey(n, t)
      map[k1] = enTrim
      const k2 = normalizeRomanMapKeyNoSpace(n, t)
      if (k2 !== k1) map[k2] = enTrim
    }
  }
}

/**
 * 打撃CSVのパスを探索（from_master 優先、なければ qualifying）
 */
function findBattingCsvForRoman(year: string, league: string): string | null {
  const upperLeague = league.toUpperCase()
  const baseNames = [
    `batting_${year}_${upperLeague}_from_master.csv`,
    `batting_${year}_${upperLeague}_qualifying.csv`,
  ]
  const dirs = [
    path.join(process.cwd(), '_data', 'master_csv_calculated'),
    path.join(process.cwd(), '_data', 'master_csv'),
    process.cwd(),
  ]
  for (const base of baseNames) {
    for (const dir of dirs) {
      const csvPath = path.join(dir, base)
      if (fs.existsSync(csvPath)) return csvPath
    }
  }
  return null
}

/** 簡易CSVパース（loaders.parseCsv と同様のロジック） */
function parseCsvSimple(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headerLine = lines[0].replace(/^\ufeff/, '')
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let j = 0; j < line.length; j++) {
      const c = line[j]
      if (c === '"') inQuotes = !inQuotes
      else if (c === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else current += c
    }
    values.push(current.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function mergeRosterRomanNames(map: Record<string, string>, league: 'CL' | 'PL') {
  const roster = getNpbRoster2026()
  for (const p of roster) {
    const en = rosterEnglishShortForRanking(p)
    if (!en) continue
    if (rosterLeagueFromTeamFull(p.team) !== league) continue
    registerRomanAliases(map, p.name_ja, p.team, en)
  }
}

/**
 * 指定年度・リーグの「名前|チーム」→ 英字名 マップを取得
 * - 打撃マスタ CSV（フル球団名）に加え、ランキング用短縮球団名キーも登録
 * - NPB 名簿（英字略式・フルから導出できる行のみ、同一リーグ）をマージ
 */
export function getRomanNameMap(year: string, league: string): Record<string, string> {
  const dataYear = year === '2026' ? '2025' : year
  const upperLeague = league.toUpperCase() as 'CL' | 'PL'
  const map: Record<string, string> = {}

  const csvPath = findBattingCsvForRoman(dataYear, upperLeague)
  if (csvPath) {
    let content: string | null = null
    const encodings: BufferEncoding[] = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
    for (const enc of encodings) {
      try {
        content = fs.readFileSync(csvPath, enc)
        break
      } catch {
        continue
      }
    }
    if (content) {
      const rows = parseCsvSimple(content)
      for (const row of rows) {
        const name = (row['player_name_ja'] ?? row['name'] ?? row['player'] ?? '').trim()
        const team = (row['team'] ?? row['Team'] ?? row['チーム'] ?? '').trim()
        const en = (row['player_name_en'] ?? row['romanName'] ?? row['name_en'] ?? '').trim()
        if (!en) continue
        registerRomanAliases(map, name, team, en)
      }
    }
  }

  mergeRosterRomanNames(map, upperLeague)
  return map
}
