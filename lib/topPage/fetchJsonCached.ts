/**
 * トップ用静的 JSON のクライアント fetch（同一 URL はメモリキャッシュ）
 */

const cache = new Map<string, Promise<unknown>>()

export async function fetchJsonCached<T>(url: string): Promise<T> {
  const hit = cache.get(url)
  if (hit) return hit as Promise<T>

  const pending = (async () => {
    const res = await fetch(url)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(
        (errBody as { error?: string }).error || `HTTP error! status: ${res.status}`
      )
    }
    return (await res.json()) as T
  })()

  cache.set(url, pending)
  try {
    return (await pending) as T
  } catch (e) {
    cache.delete(url)
    throw e
  }
}
