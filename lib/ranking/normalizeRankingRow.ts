import type { RankingRow } from "@/lib/ranking/types"
import { lookupRomanInMap } from "@/lib/ranking/romanNameLookup"

/** 指標のデフォルトソート順（K%のみ昇順） */
export function getDefaultBattingSortOrder(metricKey: string): "asc" | "desc" {
  if (metricKey === "kpct" || metricKey === "k%") {
    return "asc"
  }
  return "desc"
}

export function normalizeRankingRow(raw: Record<string, unknown>): RankingRow {
  const romanNameRaw = (
    raw["romanName"] ?? raw["roman_name"] ?? raw["RomanName"] ?? raw["name_en"] ?? raw["player_name_en"] ?? ""
  ) as string
  const romanName =
    typeof romanNameRaw === "string" && romanNameRaw.trim() !== "" ? romanNameRaw.trim() : undefined
  const name = String(
    raw["name"] ?? raw["player"] ?? raw["player_name_ja"] ?? raw["選手名"] ?? raw["名前"] ?? raw["Name"] ?? "",
  ).trim()
  const playerId = String(raw["playerId"] ?? raw["player_id"] ?? raw["id"] ?? "").trim()
  const explicitNpb = String(raw["npbPlayerId"] ?? raw["npb_player_id"] ?? "").trim()
  const team = String(raw["team"] ?? raw["Team"] ?? raw["チーム"] ?? raw["team_name"] ?? "")
  const npbPlayerId =
    explicitNpb || (/^\d{6,}$/.test(playerId) ? playerId : undefined) || undefined
  return {
    ...raw,
    rank: raw["rank"] as number,
    playerId,
    npbPlayerId,
    name: name || "不明",
    romanName,
    team,
  } as RankingRow
}

export async function mergeRomanNamesFromCsv(
  rows: RankingRow[],
  season: string,
  league: string,
): Promise<RankingRow[]> {
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin
  const url = `${baseUrl}/api/roman-names/${season}/${league}`
  let map: Record<string, string> = {}
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (res.ok) map = (await res.json()) as Record<string, string>
  } catch {
    return rows
  }
  return rows.map((row) => {
    if (row.romanName && row.romanName.trim()) return row
    const en = lookupRomanInMap(map, row.name, row.team)
    if (!en) return row
    return { ...row, romanName: en }
  })
}
