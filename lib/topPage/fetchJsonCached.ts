/**
 * トップ用静的 JSON のクライアント fetch（同一 URL はメモリキャッシュ）
 * NEXT_PUBLIC_RANKINGS_BASE_URL があるとき /data/* は R2 直も試す（本番プロキシ未整備時）
 */

import { displaySitePathToPublicUrl } from '@/lib/displayData/sitePath'

const cache = new Map<string, Promise<unknown>>()

async function fetchOneUrl<T>(fetchUrl: string): Promise<T> {
  const res = await fetch(fetchUrl)
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(
      (errBody as { error?: string }).error || `HTTP error! status: ${res.status}`
    )
  }
  return (await res.json()) as T
}

export async function fetchJsonCached<T>(url: string): Promise<T> {
  const hit = cache.get(url)
  if (hit) return hit as Promise<T>

  const pending = (async () => {
    const r2Url = url.startsWith('/data/') ? displaySitePathToPublicUrl(url) : null
    if (r2Url) {
      try {
        return await fetchOneUrl<T>(r2Url)
      } catch {
        /* fall through to /data proxy */
      }
    }
    return fetchOneUrl<T>(url)
  })()

  cache.set(url, pending)
  try {
    return (await pending) as T
  } catch (e) {
    cache.delete(url)
    throw e
  }
}
