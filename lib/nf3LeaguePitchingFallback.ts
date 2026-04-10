/**
 * nf3 系の PR / RSAA / RSWIN に必要な「リーグ平均」。
 * 正式なリーグ集計 JSON が無い間の UI 近似値（年次で手元のリーグ実績に合わせて更新可）。
 */
export function nf3LeagueEraFallback(seasonYear: string): number {
  const y = String(seasonYear).slice(0, 4)
  const m: Record<string, number> = {
    "2024": 3.92,
    "2025": 3.88,
    "2026": 3.88,
  }
  return m[y] ?? 3.9
}

/** 9 イニングあたりの失点（リーグ平均・近似） */
export function nf3LeagueRa9Fallback(seasonYear: string): number {
  const y = String(seasonYear).slice(0, 4)
  const m: Record<string, number> = {
    "2024": 4.28,
    "2025": 4.22,
    "2026": 4.22,
  }
  return m[y] ?? 4.2
}

/**
 * Runs Per Win（nf3 の RPW）。リーグ総得点・総失点が無い間の固定近似。
 */
export function nf3RpwFallback(_seasonYear: string): number {
  return 9.8
}

/** nf3「LOB%」: (安打+四球+死球−失点) ÷ (安打+四球+死球−1.4×本塁打)。分母≤0 は「—」。 */
export function nf3LobPctDisplay(
  h: number,
  bb: number,
  hbp: number,
  r: number,
  hr: number
): string {
  const denom = h + bb + hbp - 1.4 * hr
  if (denom <= 0) return "—"
  const num = h + bb + hbp - r
  const pct = (num / denom) * 100
  if (!Number.isFinite(pct)) return "—"
  return `${pct.toFixed(1)}%`
}

/** nf3「PR」: [(リーグ平均防御率 − 個人防御率) × 投球回] ÷ 9 */
export function nf3PrDisplay(
  leagueEra: number,
  era: number | null,
  ipOuts: number
): string {
  if (ipOuts <= 0) return "—"
  if (era == null || !Number.isFinite(era)) return "—"
  const ip = ipOuts / 3
  const pr = ((leagueEra - era) * ip) / 9
  if (!Number.isFinite(pr)) return "—"
  return pr.toFixed(2)
}

/** nf3「RSAA」: [(リーグ平均失点率 − 個人失点率) × 投球回] ÷ 9（失点率は 9×R/IP） */
export function nf3RsaaRswinDisplay(
  seasonYear: string,
  r: number,
  ipOuts: number
): { rsaa: string; rswin: string } {
  if (ipOuts <= 0) return { rsaa: "—", rswin: "—" }
  const ip = ipOuts / 3
  const leagueRa9 = nf3LeagueRa9Fallback(seasonYear)
  const ra9 = (9 * r) / ip
  const rsaaNum = ((leagueRa9 - ra9) * ip) / 9
  if (!Number.isFinite(rsaaNum)) return { rsaa: "—", rswin: "—" }
  const rpw = nf3RpwFallback(seasonYear)
  const rswinNum = rsaaNum / rpw
  return {
    rsaa: rsaaNum.toFixed(2),
    rswin: Number.isFinite(rswinNum) ? rswinNum.toFixed(2) : "—",
  }
}

/**
 * nf3「IPR」: 救援時の投球回 ÷ 救援時の失点。救援失点 0 は 99.00。
 * 先発のみ・または先発と救援が混在する集計ではデータ不足のため「—」。
 */
export function nf3IprDisplay(
  gamesStarted: number | undefined,
  gamesInRelief: number | undefined,
  ipOuts: number,
  r: number
): string {
  const gs = gamesStarted ?? 0
  const gr = gamesInRelief ?? 0
  const ipNum = ipOuts / 3
  if (ipNum <= 0) return "—"
  if (gs === 0 && gr > 0) {
    if (r === 0) return "99.00"
    return (ipNum / r).toFixed(2)
  }
  return "—"
}

/**
 * nf3「IPR」: 救援に限定した投球回・失点から（canonical 集計）。
 * 救援登板が 0 回は「—」、失点 0 は 99.00。
 */
export function nf3IprFromReliefIpRuns(reliefIpOuts: number, reliefRuns: number): string {
  const ip = reliefIpOuts / 3
  if (ip <= 0) return "—"
  if (reliefRuns === 0) return "99.00"
  return (ip / reliefRuns).toFixed(2)
}
