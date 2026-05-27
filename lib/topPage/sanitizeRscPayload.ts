/**
 * Server → Client へ渡す props を JSON 化可能な形に整える（NaN / undefined 対策）
 */

export function sanitizeRscPayload<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) return null
      return v
    })
  ) as T
}
