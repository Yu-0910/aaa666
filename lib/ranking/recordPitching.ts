/**
 * Record_pitching.csv（1行目＝指標の並び）から投手ランキング用 MetricDefinition[] を取得。
 * 優先: _data/master_csv/Record_pitching.csv（計画書 §2 の日本語ラベル順）
 * フォールバック: リポジトリ直下 Record_pitching.csv（既存 Python パイプライン用の英語ヘッダー）
 */

import fs from 'fs'
import path from 'path'
import type { MetricDefinition } from './types'
import { getPitchingJsonKey } from './metricMap'

function findRecordPitchingCsv(): string | null {
  const searchPaths = [
    path.join(process.cwd(), '_data', 'master_csv', 'Record_pitching.csv'),
    path.join(process.cwd(), 'Record_pitching.csv'),
    path.join(process.cwd(), 'data', 'Record_pitching.csv'),
  ]

  for (const csvPath of searchPaths) {
    if (fs.existsSync(csvPath)) {
      return csvPath
    }
  }

  return null
}

export function loadMetricsFromRecordPitching(): MetricDefinition[] {
  const csvPath = findRecordPitchingCsv()

  if (!csvPath) {
    console.warn('Record_pitching.csv が見つかりません。投手指標のデフォルトを使用します。')
    return getDefaultPitchingMetrics()
  }

  const encodings: BufferEncoding[] = ['utf-8-sig', 'utf-8', 'shift_jis', 'cp932']
  let firstLine: string | null = null

  for (const encoding of encodings) {
    try {
      const content = fs.readFileSync(csvPath, encoding)
      firstLine = content.split('\n')[0]
      if (firstLine) break
    } catch {
      continue
    }
  }

  if (!firstLine) {
    console.warn('Record_pitching.csv の読み込みに失敗しました。デフォルト指標を使用します。')
    return getDefaultPitchingMetrics()
  }

  firstLine = firstLine.replace(/\r?\n$/, '')

  let metricsRaw = firstLine.split(',')
  if (metricsRaw.length === 1) {
    metricsRaw = firstLine.split('\t')
  }

  const excludeCols = new Set(['id', 'name', 'label', 'desc', 'description', '単位', '備考', 'unit', 'note', 'memo'])

  const metrics: MetricDefinition[] = []
  for (let metric of metricsRaw) {
    metric = metric.replace(/^\ufeff/, '').trim()
    metric = metric.replace(/\u3000/g, ' ').trim()
    if (!metric) continue

    const metricLower = metric.toLowerCase()
    if (excludeCols.has(metricLower)) continue

    const key = getPitchingJsonKey(metric)
    metrics.push({
      key,
      label: metric,
      csvKey: metric,
    })
  }

  return metrics
}

function getDefaultPitchingMetrics(): MetricDefinition[] {
  const line =
    '防御率,K-BB％,勝利,敗戦,HLD,Ｓ,ＨＰ,試合,先発,完投,完封,勝率,回数,被打者,投球数,P/IP,被安,被本,三振,四球,WHIP,K％,BB％,QS率,HQS率,SQS率,被打率,被BABIP,被出塁率,被長打率'
  return line.split(',').map((label) => ({
    key: getPitchingJsonKey(label),
    label,
    csvKey: label,
  }))
}
