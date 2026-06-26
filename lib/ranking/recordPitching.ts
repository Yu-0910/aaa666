/**
 * Record_pitching.csv（1行目＝指標の並び）から投手ランキング用 MetricDefinition[] を取得。
 * 優先: _data/master_csv/Record_pitching.csv（計画書 §2 の日本語ラベル順）
 * 2026: _data/master_csv/Record_pitching.csv（日本語ラベル）を優先し、無ければ日本語デフォルトを使う。
 *       Vercel では _data/master_csv/ が除外されるため、リポジトリ直下の英語 Record_pitching.csv は使わない。
 * 歴史年度: _data/master_csv/Record_pitching_historical.csv を優先し、無ければ従来フォールバックを使う。
 */

import fs from 'fs'
import path from 'path'
import type { MetricDefinition } from './types'
import { getPitchingJsonKey } from './metricMap'
import { readFsTextWithLegacyEncodings } from './readFsTextWithLegacyEncodings'

/** 2026 Phase 19（canonical）専用。1950〜2025 の Record には含めない（plan_pitching_rankings_historical Phase 0） */
export const PITCHING_METRICS_2026_ONLY = new Set([
  '先発',
  '投球数',
  'P/IP',
  'QS率',
  'HQS率',
  'SQS率',
  '被打率',
  '被BABIP',
  '被出塁率',
  '被長打率',
])

const HISTORICAL_PITCHING_YEAR_MAX = 2025

/** ホールド（HLD）・ＨＰをランキング UI に出す最初の年 */
const PITCHING_HLD_FIRST_YEAR = 2005

/** セーブ（Ｓ）をランキング UI に出す最初の年 */
const PITCHING_SAVE_FIRST_YEAR = 1974

const PITCHING_HLD_LABELS = new Set(['HLD', 'ホールド'])
const PITCHING_HP_LABELS = new Set(['ＨＰ', 'HP'])
const PITCHING_SAVE_LABELS = new Set(['Ｓ', 'S', 'セーブ', 'SV'])

function filterPitchingMetricsForYear(
  metrics: MetricDefinition[],
  year: number,
): MetricDefinition[] {
  return metrics.filter((m) => {
    const label = m.label.trim()
    const key = m.key.toLowerCase()
    if (year < PITCHING_HLD_FIRST_YEAR && (PITCHING_HLD_LABELS.has(label) || key === 'hld')) {
      return false
    }
    if (year < PITCHING_HLD_FIRST_YEAR && (PITCHING_HP_LABELS.has(label) || key === 'hp')) {
      return false
    }
    if (year < PITCHING_SAVE_FIRST_YEAR && (PITCHING_SAVE_LABELS.has(label) || key === 'sv')) {
      return false
    }
    return true
  })
}

function findRecordPitchingCsvPath(filename: string): string | null {
  const searchPaths = [
    path.join(process.cwd(), '_data', 'master_csv', filename),
    path.join(process.cwd(), filename),
    path.join(process.cwd(), 'data', filename),
  ]

  for (const csvPath of searchPaths) {
    if (fs.existsSync(csvPath)) {
      return csvPath
    }
  }

  return null
}

function findRecordPitchingCsv(): string | null {
  return findRecordPitchingCsvPath('Record_pitching.csv')
}

function findRecordPitchingMasterCsv(): string | null {
  const csvPath = path.join(process.cwd(), '_data', 'master_csv', 'Record_pitching.csv')
  return fs.existsSync(csvPath) ? csvPath : null
}

function findRecordPitchingHistoricalCsv(): string | null {
  return findRecordPitchingCsvPath('Record_pitching_historical.csv')
}

function parseMetricsFromRecordFirstLine(firstLine: string): MetricDefinition[] {
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

function loadMetricsFromRecordFile(
  resolvePath: () => string | null,
  fallback: () => MetricDefinition[],
  missingLabel: string,
): MetricDefinition[] {
  const csvPath = resolvePath()

  if (!csvPath) {
    console.warn(`${missingLabel} が見つかりません。デフォルト指標を使用します。`)
    return fallback()
  }

  const content = readFsTextWithLegacyEncodings(csvPath)
  const rawFirstLine = content ? content.split(/\r?\n/)[0] ?? null : null

  if (!rawFirstLine) {
    console.warn(`${missingLabel} の読み込みに失敗しました。デフォルト指標を使用します。`)
    return fallback()
  }

  const firstLine = rawFirstLine.replace(/\r?\n$/, '')
  return parseMetricsFromRecordFirstLine(firstLine)
}

/** 1950〜2025 用（master CSV に存在する指標のみ） */
export function loadMetricsFromRecordPitchingHistorical(): MetricDefinition[] {
  return loadMetricsFromRecordFile(
    findRecordPitchingHistoricalCsv,
    getDefaultPitchingHistoricalMetrics,
    'Record_pitching_historical.csv',
  )
}

/** 年度に応じて 2026 フル指標 / 歴史年度指標を返す（HLD・Ｓは導入年より前は除外） */
export function loadMetricsFromRecordPitchingForYear(year: number): MetricDefinition[] {
  const base =
    Number.isFinite(year) && year <= HISTORICAL_PITCHING_YEAR_MAX
      ? loadMetricsFromRecordPitchingHistorical()
      : loadMetricsFromRecordFile(
          findRecordPitchingMasterCsv,
          getDefaultPitchingMetrics,
          'Record_pitching.csv',
        )
  return filterPitchingMetricsForYear(base, year)
}

export function loadMetricsFromRecordPitching(): MetricDefinition[] {
  return loadMetricsFromRecordFile(
    findRecordPitchingCsv,
    getDefaultPitchingMetrics,
    'Record_pitching.csv',
  )
}

function getDefaultPitchingHistoricalMetrics(): MetricDefinition[] {
  const line =
    '防御率,K-BB％,勝利,敗戦,HLD,Ｓ,ＨＰ,試合,完投,完封,勝率,回数,被打者,被安,被本,三振,四球,WHIP,K％,BB％,敬遠,死球,自責,失点,暴投'
  return line.split(',').map((label) => ({
    key: getPitchingJsonKey(label),
    label,
    csvKey: label,
  }))
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
