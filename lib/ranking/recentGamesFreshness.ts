/** Use generation age, not game date: off-days do not imply stale data. */
export function recentGamesAreStale(generatedAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(generatedAt)
  return !Number.isFinite(age) || age > 48 * 60 * 60 * 1000 || age < -5 * 60 * 1000
}
