/**
 * NPB 公式年度別成績ページ由来の順位表指標計算（Phase 0 固定式）。
 * 仕様: docs/plan_npb_yearly_standings_phases.md §3
 */

/** NPB 投球回表記（例: "1182.2"）→ アウト数 */
export function ipOutsFromNpbDisplay(ip: string): number | null {
  const s = String(ip ?? "").trim()
  if (!s) return null
  const m = s.match(/^(\d+)(?:\.(\d))?$/)
  if (!m) return null
  const whole = Number(m[1])
  const fracDigit = m[2] != null ? Number(m[2]) : 0
  if (!Number.isFinite(whole) || fracDigit < 0 || fracDigit > 2) return null
  return whole * 3 + fracDigit
}

/** 投球回の小数表示（計算用） */
export function ipDecimalFromOuts(ipOuts: number): number {
  return ipOuts / 3
}

export function slgFromCounts(
  h: number,
  doubles: number,
  triples: number,
  hr: number,
  ab: number,
): number | null {
  if (ab <= 0) return null
  const singles = Math.max(0, h - doubles - triples - hr)
  const tb = singles + 2 * doubles + 3 * triples + 4 * hr
  return tb / ab
}

export function isopFromRates(slg: number | null, avg: number | null): number | null {
  if (slg == null || avg == null) return null
  return slg - avg
}

export function k9FromSoAndIpOuts(so: number, ipOuts: number): number | null {
  if (ipOuts <= 0) return null
  return (so * 27) / ipOuts
}

export function k9FromSoAndIpDisplay(so: number, ip: string): number | null {
  const outs = ipOutsFromNpbDisplay(ip)
  if (outs == null || outs <= 0) return null
  return k9FromSoAndIpOuts(so, outs)
}
