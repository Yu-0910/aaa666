/**
 * サーバーから表示 JSON を取得（Phase 7）
 * 本番: RANKINGS_BASE_URL → R2 直（/data プロキシ未デプロイでも動く）
 * ローカル: R2 失敗時は同一オリジン /data/* プロキシ
 */

import { getExternalDisplayDataUrl } from '@/lib/displayData/externalUrl'

/** `/data/rankings/...` → `data/rankings/...` */
export function displaySitePathToObjectKey(sitePath: string): string {
  const normalized = sitePath.startsWith('/') ? sitePath.slice(1) : sitePath
  if (!normalized.startsWith('data/')) {
    throw new Error(`Invalid display path (expected /data/...): ${sitePath}`)
  }
  return normalized
}

export function displaySitePathToPublicUrl(sitePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_RANKINGS_BASE_URL?.trim()
  if (!base) return null
  return `${base.replace(/\/+$/, '')}/${displaySitePathToObjectKey(sitePath)}`
}

async function fetchFromR2Direct<T>(sitePath: string): Promise<T | null> {
  const base = process.env.RANKINGS_BASE_URL?.trim()
  if (!base) return null
  try {
    const url = getExternalDisplayDataUrl(displaySitePathToObjectKey(sitePath))
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

function getServerSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

async function fetchFromSameOriginProxy<T>(sitePath: string): Promise<T | null> {
  const path = sitePath.startsWith('/') ? sitePath : `/${sitePath}`
  const url = `${getServerSiteOrigin()}${path}`
  try {
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

export async function fetchDisplayJsonServer<T = unknown>(
  sitePath: string
): Promise<T | null> {
  const path = sitePath.startsWith('/') ? sitePath : `/${sitePath}`
  const fromR2 = await fetchFromR2Direct<T>(path)
  if (fromR2 != null) return fromR2
  return fetchFromSameOriginProxy<T>(path)
}

export async function fetchRankingMetricJsonServer(
  year: string,
  league: string,
  metricLabel: string,
  sanitize: (m: string) => string
): Promise<Record<string, unknown>[] | null> {
  const fileBase = sanitize(metricLabel)
  const raw = await fetchDisplayJsonServer<unknown>(
    `/data/rankings/${year}/${league.toUpperCase()}/${fileBase}.json`
  )
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : null
}
