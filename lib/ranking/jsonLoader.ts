/**
 * ランキングJSONデータローダー
 * プロキシ経由（/data/rankings/...）でランキングJSONファイルを取得
 */

import { getRankingsUrl } from './url'

import { sanitizeMetricForPath } from './url'

/** サーバー側 fetch 用のサイト origin（Vercel では VERCEL_URL を利用） */
function getServerSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

function buildRankingFetchUrl(relativeUnderRankings: string): string {
  const url = getRankingsUrl(`data/rankings/${relativeUnderRankings}`)
  const baseUrl =
    typeof window === 'undefined' ? getServerSiteOrigin() : window.location.origin
  return `${baseUrl}${url}`
}

async function fetchRankingJsonForYear(
  dataYear: string,
  season: string,
  metric: string,
  useAllPlayers?: boolean
): Promise<Response> {
  const fileBase = sanitizeMetricForPath(metric)
  const fileName = useAllPlayers ? `${fileBase}_all.json` : `${fileBase}.json`
  const relative = `${dataYear}/${season}/${fileName}`
  const fullUrl = buildRankingFetchUrl(relative)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[loadRankingJson] Fetching: ${fullUrl}`)
  }
  return fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
}

async function fetchPitchingRankingJsonForYear(
  dataYear: string,
  season: string,
  metric: string,
  useAllPlayers?: boolean
): Promise<Response> {
  const fileBase = sanitizeMetricForPath(metric)
  const fileName = useAllPlayers ? `${fileBase}_all.json` : `${fileBase}.json`
  const relative = `pitching/${dataYear}/${season}/${fileName}`
  const fullUrl = buildRankingFetchUrl(relative)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[loadPitchingRankingJson] Fetching: ${fullUrl}`)
  }
  return fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
}

/**
 * ランキングJSONファイルを取得
 * パス形式: data/rankings/{year}/{season}/{metric}.json または {metric}_all.json
 * R2 およびローカル構造と一致。
 *
 * 年度はそのまま参照（2026 → `data/rankings/2026/...`。計画書 Phase 8 の公開 JSON 配置）。
 * ファイル未配置時のみ 2025 をフォールバック（`npm run rankings:bootstrap-2026` で 2026 を生成可能）。
 *
 * @param year 年度（例: '2025', '2026'）
 * @param season シーズン識別子（例: 'CL', 'PL', 'PRE_spring', 'PRE_fall'）
 * @param metric 指標名（例: 'OPS' または '打率'、'BB/K' は 'BB_K' にサニタイズ）
 * @param useAllPlayers 規定打席不要の指標で全選手データを使う場合 true（安打・本塁打などは _all.json を取得）
 * @returns ランキングデータ（JSON形式）
 */
export async function loadRankingJson(
  year: string,
  season: string,
  metric: string,
  useAllPlayers?: boolean
): Promise<any> {
  let response = await fetchRankingJsonForYear(year, season, metric, useAllPlayers)
  if (!response.ok && year === '2026' && response.status === 404) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[loadRankingJson] 2026 の JSON が無いため 2025 を参照しています。配置するには: npm run rankings:bootstrap-2026'
      )
    }
    response = await fetchRankingJsonForYear('2025', season, metric, useAllPlayers)
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ranking data: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

/**
 * 複数のランキングJSONファイルを取得
 *
 * @param year 年度
 * @param season シーズン識別子（CL/PL/PRE_spring/PRE_fall 等）
 * @param metrics 指標名の配列
 * @returns 指標名をキーとしたランキングデータのマップ
 */
export async function loadRankingJsons(
  year: string,
  season: string,
  metrics: string[]
): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  
  // 並列で取得（パフォーマンス向上）
  const promises = metrics.map(async (metric) => {
    try {
      const data = await loadRankingJson(year, season, metric)
      return { metric, data }
    } catch (error) {
      console.error(`[loadRankingJsons] Failed to load ${metric}:`, error)
      return { metric, data: null }
    }
  })
  
  const resolved = await Promise.all(promises)
  
  for (const { metric, data } of resolved) {
    if (data !== null) {
      results[metric] = data
    }
  }
  
  return results
}

/**
 * 投手ランキング JSON（`public/data/rankings/pitching/{year}/{season}/…`）を取得。
 * 打撃用 `loadRankingJson` とは異なり、**2026 欠損時の 2025 フォールバックは行わない**（計画書 Phase 8）。
 *
 * @param year 年度（完成品は `'2026'` のみ想定）
 * @param season `CL` | `PL` 等
 * @param metric 指標の表示ラベル（`Record_pitching` / `MetricDefinition.label` と同一。ファイル名サニタイズに使用）
 */
export async function loadPitchingRankingJson(
  year: string,
  season: string,
  metric: string,
  useAllPlayers?: boolean
): Promise<any> {
  const response = await fetchPitchingRankingJsonForYear(year, season, metric, useAllPlayers)
  if (!response.ok) {
    throw new Error(`Failed to fetch pitching ranking data: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function fetchWeeklyBattingRankingJson(
  year: string,
  weekKey: string,
  season: string,
  metric: string
): Promise<Response> {
  const fileBase = sanitizeMetricForPath(metric)
  const relative = `weekly/${year}/${weekKey}/${season}/${fileBase}.json`
  const fullUrl = buildRankingFetchUrl(relative)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[loadWeeklyRankingJson] Fetching: ${fullUrl}`)
  }
  return fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
}

async function fetchWeeklyPitchingRankingJson(
  year: string,
  weekKey: string,
  season: string,
  metric: string
): Promise<Response> {
  const fileBase = sanitizeMetricForPath(metric)
  const relative = `pitching/weekly/${year}/${weekKey}/${season}/${fileBase}.json`
  const fullUrl = buildRankingFetchUrl(relative)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[loadWeeklyPitchingRankingJson] Fetching: ${fullUrl}`)
  }
  return fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
}

/** 週間打撃ランキング（Phase 28 出力）。率系の規定フィルタは UI（team-games.json）で適用。 */
export async function loadWeeklyRankingJson(
  year: string,
  weekKey: string,
  season: string,
  metric: string
): Promise<unknown> {
  const response = await fetchWeeklyBattingRankingJson(year, weekKey, season, metric)
  if (!response.ok) {
    throw new Error(`Failed to fetch weekly ranking data: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

/** 週間投手ランキング（Phase 28 出力） */
export async function loadWeeklyPitchingRankingJson(
  year: string,
  weekKey: string,
  season: string,
  metric: string
): Promise<unknown> {
  const response = await fetchWeeklyPitchingRankingJson(year, weekKey, season, metric)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch weekly pitching ranking data: ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

export async function loadPitchingRankingJsons(
  year: string,
  season: string,
  metrics: string[]
): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  const promises = metrics.map(async (metric) => {
    try {
      const data = await loadPitchingRankingJson(year, season, metric)
      return { metric, data }
    } catch (error) {
      console.error(`[loadPitchingRankingJsons] Failed to load ${metric}:`, error)
      return { metric, data: null }
    }
  })
  const resolved = await Promise.all(promises)
  for (const { metric, data } of resolved) {
    if (data !== null) results[metric] = data
  }
  return results
}
