import { enrichBattingRankingDerivedMetrics } from "./enrichRankingDerivedMetrics"
import { calculateRCNf3 } from "../rc"
import type { RecentRow, RecentSnapshot } from "./recentGamesShared"
import { parseRecentGamesSnapshot } from "./recentGamesPage"

export const EXTRA_COUNTS = ["runs", "ibb", "so", "cs", "gidp"] as const
export type ExtraCounts = Record<typeof EXTRA_COUNTS[number], number | null>
export type V2Game = ExtraCounts & { gameId: string; playerId: string }
export type V2Row = RecentRow & ExtraCounts & { romanName: string | null; values: Record<string, number | null> }
export type V2Snapshot = Omit<RecentSnapshot, "schemaVersion" | "rows" | "metrics"> & {
  schemaVersion: "recent-10-games-batting-v2"
  metrics: { key: string; label: string }[]; rows: V2Row[]
}
export const RATE_METRICS = new Set(["ops", "avg", "obp", "slg", "isop", "isod", "bbPct", "kPct", "bbk", "babip", "seca", "ta", "noi", "gpa"])

/** Compute with the season page's formula implementation, restoring undefined/missing states. */
export function recentV2Values(row: RecentRow, extra: ExtraCounts): Record<string, number | null> {
  const input = { ...row, ...extra, hits: row.h, games: row.gamesIncluded,
    singles: row.h - row.doubles - row.triples - row.hr }
  const values = { ...enrichBattingRankingDerivedMetrics(input) } as Record<string, unknown>
  // The season normalizer coerces missing counts and undefined rates to zero; V2 must not.
  values.rc = extra.cs === null || extra.gidp === null || extra.so === null ? null
    : calculateRCNf3({ ...row, cs: extra.cs, gidp: extra.gidp, so: extra.so })
  if (row.ab <= 0) for (const key of ["avg", "slg", "isop", "isod", "ops", "gpa", "seca", "noi"]) values[key] = null
  if (row.ab + row.bb + row.hbp + row.sf <= 0) for (const key of ["obp", "isod", "ops", "gpa", "noi"]) values[key] = null
  if (row.pa <= 0) { values.bbPct = null; values.kPct = null }
  if (extra.so === null) for (const key of ["so", "kPct", "bbk", "babip", "rc", "xr"]) values[key] = null
  if (extra.so === 0) values.bbk = null
  if (extra.so !== null && row.ab - extra.so - row.hr + row.sf <= 0) values.babip = null
  if (extra.cs === null) for (const key of ["cs", "rc", "xr", "seca", "ta"]) values[key] = null
  if (extra.gidp === null) for (const key of ["gidp", "rc", "xr", "ta"]) values[key] = null
  if (extra.ibb === null) { values.ibb = null; values.xr = null }
  if (extra.cs !== null && extra.gidp !== null && row.ab - row.h + extra.cs + extra.gidp <= 0) values.ta = null
  // The shared enricher returns early for PA=AB=0; cumulative XR still has a value for pinch runners.
  if (row.pa === 0 && row.ab === 0 && extra.cs !== null && extra.gidp !== null && extra.so !== null && extra.ibb !== null) {
    values.xr = 0.18 * row.sb - 0.32 * extra.cs - 0.37 * extra.gidp
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value === null || typeof value === "number")
    .map(([key, value]) => [key, typeof value === "number" && Number.isFinite(value) ? value : null]))
}

export function rankRecentV2(rows: V2Row[], key: string, order: "asc" | "desc" = key === "kPct" ? "asc" : "desc") {
  const metric = key === "h" ? "hits" : key
  return rows.filter(row => !row.hasExcludedGames && row.gamesIncluded > 0 && typeof row.values[metric] === "number"
    && Number.isFinite(row.values[metric]) && (!RATE_METRICS.has(metric) || row.pa >= 10))
    .sort((a, b) => (Number(a.values[metric]) - Number(b.values[metric])) * (order === "asc" ? 1 : -1)
      || b.pa - a.pa || b.h - a.h || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

export function parseRecentV2(raw: unknown, league: "CL" | "PL", metrics: { key: string; label: string }[]): V2Snapshot {
  const data = raw as V2Snapshot
  if (!data || data.schemaVersion !== "recent-10-games-batting-v2" || data.windowBasis !== "team"
    || data.league !== league || data.year !== "2026" || data.windowSize !== 10 || data.minRatePA !== 10
    || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.rows)
    || JSON.stringify(data.metrics) !== JSON.stringify(metrics)) throw new Error("Invalid V2 snapshot contract")
  const ids = new Set<string>()
  parseRecentGamesSnapshot({ ...data, schemaVersion: "recent-10-games-batting-v1" }, league)
  for (const row of data.rows) {
    if (!row || !row.playerId || ids.has(row.playerId) || row.league !== league || !row.values
      || Object.keys(row.values).length !== metrics.length
      || !metrics.every(({ key }) => row.values[key] === null || typeof row.values[key] === "number" && Number.isFinite(row.values[key]))
      || !EXTRA_COUNTS.every(key => row[key] === null || Number.isInteger(row[key]) && Number(row[key]) >= 0)) throw new Error("Invalid V2 player row")
    ids.add(row.playerId)
  }
  return data
}
