/**
 * 表示用 JSON の R2 直 URL（プロキシ内部用）
 */

export function getExternalDisplayDataUrl(objectKey: string): string {
  const baseUrl = process.env.RANKINGS_BASE_URL
  if (!baseUrl?.trim()) {
    throw new Error('RANKINGS_BASE_URL is not configured')
  }
  const key = objectKey.replace(/^\/+/, '').replace(/\/+/g, '/')
  return `${baseUrl.replace(/\/+$/, '')}/${key}`
}

/** @deprecated use getExternalDisplayDataUrl with `data/rankings/...` */
export function getExternalRankingsObjectKey(relativeUnderRankings: string): string {
  const rel = relativeUnderRankings.replace(/^\/+/, '').replace(/\/+/g, '/')
  return `data/rankings/${rel}`
}
