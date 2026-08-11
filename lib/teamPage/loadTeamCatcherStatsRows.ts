import { loadCatcherAppearancesFromRepoAsync } from "@/lib/catcherAppearancesLoad"
import { loadCatcherDefenseBasicFromRepoAsync } from "@/lib/catcherDefenseBasicLoad"
import { loadCatcherPitcherSplitsFromRepoAsync } from "@/lib/catcherPitcherSplitsLoad"
import { selectCatcherStartingSummaryForTeam } from "@/lib/catcherStartingSummary"
import { loadCatcherStartingSummaryFromRepoAsync } from "@/lib/catcherStartingSummaryLoad"
import type { CatcherApiBundle } from "@/lib/teamPage/teamCatcherBasicStats"
import {
  buildTeamCatcherStatsRow,
  type TeamCatcherRosterSeed,
  type TeamCatcherStatsRow,
} from "@/lib/teamPage/teamCatcherRoster"

async function loadTeamCatcherStatsRow(
  seed: TeamCatcherRosterSeed,
  year: string,
): Promise<TeamCatcherStatsRow> {
  const npbPlayerId = seed.npbPlayerId.trim()
  const [appearances, defense, starting, pitchers] = await Promise.all([
    loadCatcherAppearancesFromRepoAsync(year, npbPlayerId),
    loadCatcherDefenseBasicFromRepoAsync(year, npbPlayerId),
    loadCatcherStartingSummaryFromRepoAsync(year, npbPlayerId),
    loadCatcherPitcherSplitsFromRepoAsync(year, npbPlayerId),
  ])

  const api: CatcherApiBundle = {
    gamesAsCatcher: appearances?.gamesAsCatcher ?? null,
    defense,
    starting: selectCatcherStartingSummaryForTeam(starting, seed.teamCode),
    pitcherRows: pitchers?.rows ?? [],
    seasonTotals: pitchers?.seasonTotals ?? null,
  }

  return buildTeamCatcherStatsRow(seed, api)
}

export async function loadTeamCatcherStatsRows(
  seeds: TeamCatcherRosterSeed[],
  year: string,
): Promise<TeamCatcherStatsRow[]> {
  return Promise.all(seeds.map((seed) => loadTeamCatcherStatsRow(seed, year)))
}
