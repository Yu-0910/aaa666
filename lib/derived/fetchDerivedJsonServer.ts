/**
 * 個人ページ用派生 JSON（_data/derived/*）のサーバー読み取り。
 * まずローカル `_data/derived` を優先し、無いときだけ R2 を見る。
 * 個人ページは R2 の遅延反映より repo 内の派生JSONを正としたい。
 */

import fs from 'node:fs'
import path from 'node:path'
import { getExternalDisplayDataUrl } from '@/lib/displayData/externalUrl'
import { getRankingsBaseUrl } from '@/lib/displayData/rankingsBaseUrl'
import { getProjectRoot } from '@/lib/projectRoot'

/** `data/derived/{category}/{...parts}` */
export function derivedObjectKey(category: string, ...parts: string[]): string {
  const rel = parts.filter(Boolean).join('/').replace(/^\/+/, '')
  return `data/derived/${category}/${rel}`.replace(/\/+/g, '/')
}

export function derivedLocalPath(category: string, ...parts: string[]): string {
  return path.join(getProjectRoot(), '_data', 'derived', category, ...parts)
}

/** ローカル fs（同期・ビルドスクリプト用） */
export function readDerivedJsonLocalSync<T>(category: string, ...parts: string[]): T | null {
  const p = derivedLocalPath(category, ...parts)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
  } catch {
    return null
  }
}

async function fetchDerivedJsonFromR2<T>(category: string, ...parts: string[]): Promise<T | null> {
  if (!getRankingsBaseUrl()) return null
  try {
    const url = getExternalDisplayDataUrl(derivedObjectKey(category, ...parts))
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** ローカル fs → R2。API Route 用。 */
export async function fetchDerivedJsonServer<T>(
  category: string,
  ...parts: string[]
): Promise<T | null> {
  const fromLocal = readDerivedJsonLocalSync<T>(category, ...parts)
  if (fromLocal != null) return fromLocal
  return fetchDerivedJsonFromR2<T>(category, ...parts)
}

/** 派生ファイルの存在確認（R2 → ローカル） */
export async function derivedJsonExistsAsync(
  category: string,
  ...parts: string[]
): Promise<boolean> {
  const data = await fetchDerivedJsonServer<unknown>(category, ...parts)
  return data != null
}
