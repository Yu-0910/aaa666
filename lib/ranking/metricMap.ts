/**
 * metric_map.json を読み込む（単一ソース）
 * Record.csvの指標名 → JSONキー名のマッピング
 */

import fs from 'fs'
import path from 'path'

let cachedMetricMap: Record<string, string> | null = null
let cachedPitchingMetricMap: Record<string, string> | null = null

/**
 * metric_map.jsonを読み込む（キャッシュ付き）
 */
export function loadMetricMap(): Record<string, string> {
  if (cachedMetricMap) {
    return cachedMetricMap
  }

  const metricMapPath = path.join(process.cwd(), 'config', 'metric_map.json')
  
  if (!fs.existsSync(metricMapPath)) {
    throw new Error(`metric_map.jsonが見つかりません: ${metricMapPath}`)
  }

  const content = fs.readFileSync(metricMapPath, 'utf-8')
  cachedMetricMap = JSON.parse(content) as Record<string, string>

  return cachedMetricMap
}

/**
 * Record.csvの指標名からJSONキー名を取得
 */
export function getJsonKey(recordMetric: string): string {
  const metricMap = loadMetricMap()
  return metricMap[recordMetric] || recordMetric.toLowerCase().replace(/\s+/g, '_')
}

/**
 * pitching_metric_map.json を読み込む（キャッシュ付き）
 * `_comment` 等のアンダースコア始まりキーはマップから除外する。
 */
export function loadPitchingMetricMap(): Record<string, string> {
  if (cachedPitchingMetricMap) {
    return cachedPitchingMetricMap
  }

  const pitchingPath = path.join(process.cwd(), 'config', 'pitching_metric_map.json')
  if (!fs.existsSync(pitchingPath)) {
    cachedPitchingMetricMap = {}
    return cachedPitchingMetricMap
  }

  const raw = JSON.parse(fs.readFileSync(pitchingPath, 'utf-8')) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue
    if (typeof v === 'string' && v.length > 0) out[k] = v
  }
  cachedPitchingMetricMap = out
  return cachedPitchingMetricMap
}

/**
 * Record_pitching.csv の列名・日本語ラベル → ランキング JSON のキー
 */
export function getPitchingJsonKey(recordMetric: string): string {
  const map = loadPitchingMetricMap()
  const t = (recordMetric || '').trim()
  if (t && map[t]) return map[t]
  return t.toLowerCase().replace(/\s+/g, '_').replace(/％/g, '%')
}



















