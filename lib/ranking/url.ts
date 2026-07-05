/**
 * ランキングデータのURL生成ヘルパー
 * すべてのランキングデータ参照を一元化
 */

import { getExternalDisplayDataUrl } from '@/lib/displayData/externalUrl'

/** Windowsで禁止の文字を "_" に置換（Python sanitize_filename と同一） */
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g

function encodePathSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/**
 * 指標名をJSONファイル名（拡張子なし）にサニタイズ
 * ビルドスクリプトの sanitize_filename と同一ルール
 */
export function sanitizeMetricForPath(metric: string): string {
  if (!metric || typeof metric !== 'string') return metric
  let s = metric.trim()
  s = s.replace(FORBIDDEN_FILENAME_CHARS, '_')
  s = s.replace(/\.+$/, '') // 末尾の . を除去
  return s || metric.trim()
}

/**
 * ランキングデータのURLを生成
 * 
 * @param path パス（例: 'data/rankings/2025/PL/OPS.json' または '/data/rankings/2025/PL/OPS.json'）
 * @returns 正規化されたパス（プロキシ経由でアクセスするため、同一オリジンのパスを返す）
 * 
 * @example
 * getRankingsUrl('data/rankings/2025/PL/OPS.json')
 * // => '/data/rankings/2025/PL/OPS.json'
 *
 * 投手: `data/rankings/pitching/2026/CL/防御率.json`（`public/data/rankings/pitching/...` と同一相対パス）
 *
 * getRankingsUrl('/data/rankings/2025/PL/OPS.json')
 * // => '/data/rankings/2025/PL/OPS.json'
 *
 * `RANKINGS_EXTERNALIZE_SCOPE` は部分一致（`path.includes(scope)`）のため、`2026` や `pitching` を含むパスは通常そのまま通る。
 */
export function getRankingsUrl(path: string): string {
  // パスを正規化: 必ず / で始まり、二重スラッシュを防ぐ
  const normalizedPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/')
  const encodedPath = '/' + encodePathSegments(normalizedPath.replace(/^\/+/, ''))
  
  // 段階移行: scope をチェック
  const scope = process.env.RANKINGS_EXTERNALIZE_SCOPE || ''
  if (scope) {
    // scope が設定されている場合、対象外のパスはローカル参照にフォールバック
    const scopes = scope.split(',').map(s => s.trim().toLowerCase())
    const pathLower = normalizedPath.toLowerCase()
    
    const isInScope = scopes.some(s => pathLower.includes(s))
    if (!isInScope) {
      // scope外: ローカルファイル参照（開発環境）またはエラー
      if (process.env.NODE_ENV === 'development') {
        // 開発環境ではローカルファイル参照を許可
        return encodedPath
      }
      // 本番環境ではエラーを投げる（または404を返す）
      // 注意: この関数はURL生成のみを行うため、エラーチェックは呼び出し側で行う
      console.warn(`[getRankingsUrl] Path ${normalizedPath} is not in externalization scope: ${scope}`)
      return encodedPath // とりあえずパスを返す（プロキシ側で処理）
    }
  }
  
  // プロキシ経由でアクセス（同一オリジン）
  return encodedPath
}

/**
 * 外部ストレージのURLを生成（内部使用）
 * プロキシルートで使用
 * 
 * @param path パス（例: '2025/PL/OPS.json'）
 * @returns 外部ストレージの完全URL
 */
export function getExternalRankingsUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '').replace(/\/+/g, '/')
  return getExternalDisplayDataUrl(`data/rankings/${normalizedPath}`)
}
