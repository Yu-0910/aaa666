/**
 * Record.csvから指標の順番を取得
 * Record.csvが「順番の唯一の正」として機能する
 */

import fs from 'fs'
import path from 'path'
import type { MetricDefinition } from './types'
import { getJsonKey } from './metricMap'
import { readFsTextWithLegacyEncodings } from './readFsTextWithLegacyEncodings'

/**
 * Record.csvのパスを探索（優先順位順）
 */
function findRecordCsv(): string | null {
  const searchPaths = [
    path.join(process.cwd(), 'Record.csv'),
    path.join(process.cwd(), '_data', 'master_csv', 'Record.csv'),
    path.join(process.cwd(), 'data', 'Record.csv'),
  ]

  for (const csvPath of searchPaths) {
    if (fs.existsSync(csvPath)) {
      return csvPath
    }
  }

  return null
}

/**
 * Record.csvから指標リストを抽出（順番を保持）
 * @returns Record.csvの順番で並んだ指標定義の配列
 */
export function loadMetricsFromRecord(): MetricDefinition[] {
  const recordCsvPath = findRecordCsv()
  
  if (!recordCsvPath) {
    console.warn('Record.csvが見つかりません。デフォルト指標を使用します。')
    return getDefaultMetrics()
  }

  const content = readFsTextWithLegacyEncodings(recordCsvPath)
  const rawFirstLine = content ? content.split(/\r?\n/)[0] ?? null : null

  if (!rawFirstLine) {
    console.warn('Record.csvの読み込みに失敗しました。デフォルト指標を使用します。')
    return getDefaultMetrics()
  }

  const firstLine = rawFirstLine.replace(/\r?\n$/, '')

  // 区切り文字を判定（カンマ区切りを優先）
  let metricsRaw = firstLine.split(',')
  if (metricsRaw.length === 1) {
    metricsRaw = firstLine.split('\t')
  }

  // 除外列のセット
  const excludeCols = new Set(['id', 'name', 'label', 'desc', 'description', '単位', '備考', 'unit', 'note', 'memo'])

  // 各指標名を正規化して変換（Record.csvの順番を保持）
  const metrics: MetricDefinition[] = []
  for (let metric of metricsRaw) {
    // BOM除去
    metric = metric.replace(/^\ufeff/, '')
    // 前後空白除去
    metric = metric.trim()
    // 全角スペース除去
    metric = metric.replace(/\u3000/g, ' ').trim()
    // 空文字は除外
    if (!metric) continue

    // 除外列チェック
    const metricLower = metric.toLowerCase()
    if (excludeCols.has(metricLower)) continue

    // キーを生成（metric_map.jsonから取得、単一ソース）
    const key = getJsonKey(metric)
    const csvKey = metric // CSVの元のキー名（そのまま使用）

    metrics.push({
      key,
      label: metric,
      csvKey,
    })
  }

  return metrics
}

/**
 * 指標名を正規化してキーを生成
 */
function normalizeMetricKey(metric: string): string {
  // 既に英字の場合は小文字化
  if (/^[A-Za-z0-9%\/\-]+$/.test(metric)) {
    return metric.toLowerCase()
  }

  // 日本語の場合は既知のマッピングを使用
  const japaneseToKey: Record<string, string> = {
    '打率': 'avg',
    '安打': 'hits',
    '本塁打': 'hr',
    '打点': 'rbi',
    '試合': 'games',
    '打席': 'pa',
    '打数': 'ab',
    '単打': 'singles',
    '二塁打': 'doubles',
    '三塁打': 'triples',
    '得点': 'runs',
    '出塁率': 'obp',
    '長打率': 'slg',
    '四球': 'bb',
    '敬遠': 'ibb',
    '死球': 'hbp',
    '三振': 'so',
    '塁打': 'tb',
    '盗塁': 'sb',
    '盗塁死': 'cs',
    '犠打': 'sh',
    '犠飛': 'sf',
    '併殺打': 'gidp',
  }

  return japaneseToKey[metric] || metric.toLowerCase().replace(/\s+/g, '_')
}

/**
 * デフォルト指標（Record.csvが読み込めない場合のフォールバック）
 */
function getDefaultMetrics(): MetricDefinition[] {
  return [
    { key: 'ops', label: 'OPS', csvKey: 'OPS' },
    { key: 'avg', label: '打率', csvKey: '打率' },
    { key: 'obp', label: '出塁率', csvKey: '出塁率' },
    { key: 'slg', label: '長打率', csvKey: '長打率' },
    { key: 'hr', label: 'HR', csvKey: '本塁打' },
    { key: 'rbi', label: '打点', csvKey: '打点' },
    { key: 'hits', label: '安打', csvKey: '安打' },
    { key: 'runs', label: '得点', csvKey: '得点' },
    { key: 'pa', label: '打席', csvKey: '打席' },
    { key: 'ab', label: '打数', csvKey: '打数' },
  ]
}

