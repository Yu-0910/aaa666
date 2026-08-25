import type { TeamStandingRow, TeamStandingsJson } from "@/lib/standings/types"

function parseGbValue(value: string): number | null {
  const s = String(value ?? "").trim()
  if (!s || s === "—" || s === "--") return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function formatGbValue(value: number): string {
  if (value <= 0) return "—"
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return value.toFixed(1)
}

function normalizeAdjacentGamesBehind(rows: TeamStandingRow[]): TeamStandingRow[] {
  let previousCumulative = 0

  return rows.map((row, index) => {
    if (index === 0) {
      previousCumulative = 0
      return { ...row, gb: "—" }
    }

    const cumulative = parseGbValue(row.gb)
    if (cumulative == null) return row

    const adjacent = Math.max(0, cumulative - previousCumulative)
    previousCumulative = cumulative
    return { ...row, gb: formatGbValue(adjacent) }
  })
}

export function normalizeStandingsJsonForDisplay(data: TeamStandingsJson): TeamStandingsJson {
  if (data.source !== "npb_official_yearly") return data

  return {
    ...data,
    rows: normalizeAdjacentGamesBehind(data.rows),
  }
}
