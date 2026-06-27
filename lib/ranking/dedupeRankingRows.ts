import type { RankingRow } from "@/lib/ranking/types"

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .trim()
}

function rankingRowDedupeKey(row: RankingRow): string {
  const npbPlayerId = normalizeText(row.npbPlayerId ?? row.npb_player_id)
  if (npbPlayerId) return `npb:${npbPlayerId}`

  const name = normalizeText(row.name || row.player)
  const team = normalizeText(row.team)
  const romanName = normalizeText(row.romanName)
  return `display:${name}:${team}:${romanName}`
}

export function dedupeRankingRowsForDisplay(rows: RankingRow[] | null | undefined): RankingRow[] {
  const seen = new Set<string>()
  const deduped: RankingRow[] = []

  for (const row of rows ?? []) {
    const key = rankingRowDedupeKey(row)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    deduped.push(row)
  }

  return deduped.map((row, index) => ({
    ...row,
    rank: index + 1,
  }))
}
