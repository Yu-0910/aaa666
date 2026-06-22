import { weekLabelForKey, isValidWeeklyWeekKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { readWeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"

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
  const availableWeekKeys =
    meta?.availableWeekKeys?.length && meta.availableWeekKeys.includes(weekKey)
      ? meta.availableWeekKeys
      : meta?.availableWeekKeys?.length
        ? meta.availableWeekKeys
        : [weekKey]
  return {
    weekLabel: weekLabelForKey(weekKey),
    availableWeekKeys,
  }
}
