/**
 * ランキング JSON 行からチーム別 max(games) で規定打席を求める（暫定）。
 *
 * Phase 0 初版の実装。Phase 0 改定後の正は canonical 取得試合数（`team-games.json`、Phase 1）。
 * 本番 2026 では `computeDynamicMinPAByTeam` を使わないこと。
 *
 * 端数処理: `minPAFromTeamGames`（2009+ round、以前 floor）は改定後も維持。
 */

import { calculateMinPA, minPAFromTeamGames } from "@/lib/ranking/qualifyingPA"

export function computeDynamicMinPAByTeam(
  rows: Array<Record<string, unknown>>,
  year: string
): Map<string, number> {
  const byTeamMaxGames = new Map<string, number>()
  for (const row of rows) {
    const team = String(row.team ?? row["チーム"] ?? "").trim()
    if (!team) continue
    const gRaw = row.games ?? row.G ?? row["試合"]
    const g = typeof gRaw === "number" ? gRaw : Number(gRaw)
    if (!Number.isFinite(g)) continue
    const prev = byTeamMaxGames.get(team) ?? 0
    if (g > prev) byTeamMaxGames.set(team, g)
  }
  const out = new Map<string, number>()
  for (const [team, games] of byTeamMaxGames.entries()) {
    out.set(team, minPAFromTeamGames(games, year))
  }
  return out
}

export function effectiveMinPAForRow(
  row: Record<string, unknown>,
  year: string,
  league: string,
  dynamicMinPAByTeam: Map<string, number>
): number {
  const team = String(row.team ?? row["チーム"] ?? "").trim()
  const dynamic = team ? dynamicMinPAByTeam.get(team) : undefined
  if (dynamic !== undefined) return dynamic
  return calculateMinPA(year, league, team || undefined)
}

export function rowPassesQualifyingPA(
  row: Record<string, unknown>,
  year: string,
  league: string,
  dynamicMinPAByTeam: Map<string, number>
): boolean {
  const minPA = effectiveMinPAForRow(row, year, league, dynamicMinPAByTeam)
  if (minPA <= 0) return true
  const paRaw = row.pa ?? row.PA ?? row["打席"]
  const pa = typeof paRaw === "number" ? paRaw : Number(paRaw)
  return Number.isFinite(pa) && pa >= minPA
}
