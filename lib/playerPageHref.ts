/**
 * 個人ページ URL（ID 優先、名前はフォールバック）
 */

export type PlayerLinkIds = {
  npbPlayerId?: string
  playerId?: string
  name?: string
  romanName?: string
}

export function playerPagePathSegment(link: PlayerLinkIds): string {
  const id = (link.npbPlayerId || link.playerId || '').trim()
  if (id) return id
  return (link.name || '').replace(/\s+/g, '')
}

export function playerPageHref(link: PlayerLinkIds): string {
  const id = (link.npbPlayerId || link.playerId || '').trim()
  if (id) {
    const roman = (link.romanName || '').trim()
    const qs = roman ? `?roman=${encodeURIComponent(roman)}` : ''
    return `/players/${id}${qs}`
  }
  const name = (link.name || '').replace(/\s+/g, '')
  if (!name) return '/players/unknown'
  return `/players/${encodeURIComponent(name)}?name=${encodeURIComponent(name)}`
}
