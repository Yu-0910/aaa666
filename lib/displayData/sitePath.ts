/**
 * /data/* パス ↔ R2 オブジェクトキー（クライアント・サーバー共通・fetch なし）
 */

import { getPublicRankingsBaseUrl } from '@/lib/displayData/rankingsBaseUrl'

/** `/data/rankings/...` → `data/rankings/...` */
export function displaySitePathToObjectKey(sitePath: string): string {
  const normalized = sitePath.startsWith('/') ? sitePath.slice(1) : sitePath
  if (!normalized.startsWith('data/')) {
    throw new Error(`Invalid display path (expected /data/...): ${sitePath}`)
  }
  return normalized
}

export function displaySitePathToPublicUrl(sitePath: string): string | null {
  const base = getPublicRankingsBaseUrl()
  if (!base) return null
  try {
    return `${base.replace(/\/+$/, '')}/${displaySitePathToObjectKey(sitePath)}`
  } catch {
    return null
  }
}
