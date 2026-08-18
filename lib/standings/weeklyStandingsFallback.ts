import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import type { StandingsLeague, TeamStandingsJson } from "@/lib/standings/types"

export type WeeklyStandingsResolved = {
  data: TeamStandingsJson
  resolvedWeekKey: string
  resolvedWeekLabel: string
  requestedWeekKey: string
  fellBack: boolean
}

export async function fetchWeeklyStandingsWithFallback(
  year: number,
  requestedWeekKey: string,
  league: StandingsLeague,
  availableWeekKeys: string[],
  fetcher: (year: number, weekKey: string, league: StandingsLeague) => Promise<TeamStandingsJson>,
): Promise<WeeklyStandingsResolved> {
  const candidateWeekKeys = [
    requestedWeekKey,
    ...availableWeekKeys.filter((weekKey) => weekKey !== requestedWeekKey),
  ]

  let lastError: Error | null = null
  for (const weekKey of candidateWeekKeys) {
    try {
      const data = await fetcher(year, weekKey, league)
      return {
        data,
        resolvedWeekKey: weekKey,
        resolvedWeekLabel: weekLabelForKey(weekKey),
        requestedWeekKey,
        fellBack: weekKey !== requestedWeekKey,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (lastError) throw lastError
  throw new Error("今週の順位表データ候補がありません")
}
