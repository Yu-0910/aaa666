import { weekLabelForKey, isValidWeeklyWeekKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { mergeAvailableWeekKeys } from "@/lib/ranking/weeklyAvailableWeekKeys"
import { readWeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"
import { listWeeklyRankingWeekKeys } from "@/lib/topPage/weeklyLeadersSnapshotBuild"

export { isValidWeeklyWeekKey }

export function normalizeWeeklyLeague(leagueRaw: string): "CL" | "PL" | null {
  const u = leagueRaw.trim().toUpperCase()
  if (u === "CL" || u === "PL") return u
  return null
}

export function weeklyRankingPageWeekMeta(
  projectRoot: string,
  year: string,
  weekKey: string
): { weekLabel: string; availableWeekKeys: string[] } {
  const meta = readWeeklyCurrentWeekJson(projectRoot, year)
  const availableWeekKeys = mergeAvailableWeekKeys(
    meta?.availableWeekKeys,
    listWeeklyRankingWeekKeys(projectRoot, year),
    weekKey
  )
  return {
    weekLabel: weekLabelForKey(weekKey),
    availableWeekKeys,
  }
}

export { mergeAvailableWeekKeys }
