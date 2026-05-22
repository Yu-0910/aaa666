/**
 * 汎用ランキング関数
 * OPS専用ロジックを汎用化したランキング生成関数
 */

import { loadBattingCSV, type PlayerRow } from '@/lib/csvReader'
import { type MetricDefinition, QUAL_PA } from '@/lib/metrics'

export interface RankedRow {
  rank: number
  name: string
  romanName: string
  team: string
  value: number
  formattedValue: string
}

/**
 * 2025年PLのバッティングデータを取得
 */
export async function getBattingRows_2025PL(): Promise<PlayerRow[]> {
  return await loadBattingCSV(2025, 'PL')
}

/**
 * ランキングを構築
 * @param rows プレイヤーデータ配列
 * @param metricDef 指標定義
 * @returns ランキング配列（上位100件）
 */
export function buildRanking(
  rows: PlayerRow[],
  metricDef: MetricDefinition
): RankedRow[] {
  // a) 無効行除外（PA>0 など最低限）
  let filtered = rows.filter(p => p.PA > 0)

  // b) metricDef.needsQualification が true のときだけ規定打席フィルタ（PA>=QUAL_PA）
  if (metricDef.needsQualification) {
    filtered = filtered.filter(p => p.PA >= QUAL_PA)
  }

  // c) metricDef.csvKey の値でソート（desc/asc）
  // d) NaN / null は末尾へ
  const playersWithValue: Array<{ value: number; player: PlayerRow }> = []

  for (const player of filtered) {
    // CSV列名から値を取得（大文字小文字対応）
    let value: number | string | null = null

    // 直接マッチ
    const csvKey = metricDef.csvKey
    if (csvKey in player) {
      value = (player as any)[csvKey]
    } else {
      // 大文字小文字を無視して検索
      const keyLower = csvKey.toLowerCase()
      for (const key in player) {
        if (key.toLowerCase() === keyLower) {
          value = (player as any)[key]
          break
        }
      }

      // BB/K の特殊ケース（BB/K または BBK）
      if (value === null && csvKey === 'BB/K') {
        if ('BBK' in player) {
          value = (player as any)['BBK']
        } else if ('bbk' in player) {
          value = (player as any)['bbk']
        } else if ('BB/K' in player) {
          value = (player as any)['BB/K']
        }
      }
    }

    // 値が取得できて、数値として有効な場合のみ追加
    // NaNや"nan"文字列は除外
    if (value !== null && value !== undefined) {
      const numValue =
        typeof value === 'string' && value.toLowerCase() === 'nan'
          ? NaN
          : Number(value)
      if (!isNaN(numValue) && isFinite(numValue)) {
        playersWithValue.push({ value: numValue, player })
      }
    }
  }

  // ソート（NaN/nullは末尾へ）
  if (metricDef.sortOrder === 'desc') {
    playersWithValue.sort((a, b) => {
      // NaNは末尾
      if (isNaN(a.value) && isNaN(b.value)) return 0
      if (isNaN(a.value)) return 1
      if (isNaN(b.value)) return -1
      return b.value - a.value
    })
  } else {
    playersWithValue.sort((a, b) => {
      // NaNは末尾
      if (isNaN(a.value) && isNaN(b.value)) return 0
      if (isNaN(a.value)) return 1
      if (isNaN(b.value)) return -1
      return a.value - b.value
    })
  }

  // e) 上位100件にスライス
  const top100 = playersWithValue.slice(0, 100)

  // rank を付与して返す
  return top100.map((item, index) => {
    const player = item.player
    return {
      rank: index + 1,
      name: player.player_name_ja || '',
      romanName: player.player_name_en || '',
      team: player.team || '',
      value: item.value,
      formattedValue: metricDef.formatFn(item.value),
    }
  })
}



















