/**
 * 野球の投球回表記（6, 6.1, 0.2 など）をアウト数に変換（整数）
 */
export function ipStringToOuts(ipRaw: string | undefined): number {
  if (ipRaw == null) return 0
  const s = String(ipRaw).trim()
  if (!s) return 0
  const dot = s.indexOf('.')
  if (dot < 0) {
    const whole = parseInt(s, 10)
    return (Number.isFinite(whole) ? whole : 0) * 3
  }
  const whole = parseInt(s.slice(0, dot), 10) || 0
  const c = s[dot + 1]
  let third = 0
  if (c === '1') third = 1
  else if (c === '2') third = 2
  return whole * 3 + third
}

/** ソート・ERA 計算用の十進イニング（例: 6.1 → 6.333...） */
export function ipStringToDecimalInnings(ipRaw: string | undefined): number {
  return ipStringToOuts(ipRaw) / 3
}
