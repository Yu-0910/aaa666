/**
 * チーム捕手一覧の行型・名簿マージ
 */

import type { CatcherBasicStatsFields, CatcherApiBundle } from "@/lib/teamPage/teamCatcherBasicStats"
import { buildCatcherBasicStatsFields } from "@/lib/teamPage/teamCatcherBasicStats"

export type TeamCatcherRosterSeed = {
  npbPlayerId: string
  nameJa: string
  teamCode: string
  romanName?: string
  /** 名簿 position=捕手 由来 */
  fromRoster: boolean
}

export type TeamCatcherStatsRow = {
  rank?: number
  npbPlayerId: string
  nameJa: string
  romanName?: string
  teamCode: string
  fromRoster: boolean
  ab: number | null
} & CatcherBasicStatsFields

export function emptyTeamCatcherStatsRow(seed: TeamCatcherRosterSeed): TeamCatcherStatsRow {
  return {
    npbPlayerId: seed.npbPlayerId,
    nameJa: seed.nameJa,
    romanName: seed.romanName,
    teamCode: seed.teamCode,
    fromRoster: seed.fromRoster,
    ab: null,
    gamesAsCatcher: null,
    era: null,
    starts: null,
    wins: null,
    losses: null,
    draws: null,
    avgAgainst: null,
    qsCount: null,
    teamWinPct: null,
    ipOuts: null,
    bf: null,
    pitches: null,
    h: null,
    kPct: null,
    whip: null,
    hr: null,
    so: null,
    bb: null,
    ibb: null,
    hbp: null,
    er: null,
    qsPct: null,
    hqsPct: null,
    sqsPct: null,
    babipAgainst: null,
    obpAgainst: null,
    slgAgainst: null,
    goAo: null,
    csPct: null,
    pbPer9: null,
  }
}

export function mergeTeamCatcherRosterSeeds(
  rosterCatchers: TeamCatcherRosterSeed[],
  appearanceCatcherIds: string[],
): TeamCatcherRosterSeed[] {
  const byId = new Map<string, TeamCatcherRosterSeed>()
  for (const seed of rosterCatchers) {
    byId.set(seed.npbPlayerId, seed)
  }
  for (const id of appearanceCatcherIds) {
    if (!byId.has(id)) {
      byId.set(id, {
        npbPlayerId: id,
        nameJa: id,
        teamCode: rosterCatchers[0]?.teamCode ?? "",
        fromRoster: false,
      })
    }
  }
  const rosterOrder = rosterCatchers.map((s) => s.npbPlayerId)
  const extra = [...byId.keys()].filter((id) => !rosterOrder.includes(id))
  return [...rosterOrder, ...extra].map((id) => byId.get(id)!)
}

export function buildTeamCatcherStatsRow(
  seed: TeamCatcherRosterSeed,
  api: CatcherApiBundle,
): TeamCatcherStatsRow {
  const fields = buildCatcherBasicStatsFields(api)
  let gamesAsCatcher = fields.gamesAsCatcher
  if (gamesAsCatcher == null && seed.fromRoster) {
    gamesAsCatcher = 0
  }

  const ab =
    api.seasonTotals && api.seasonTotals.ab > 0
      ? api.seasonTotals.ab
      : api.pitcherRows.length > 0
        ? api.pitcherRows.reduce((sum, r) => sum + (r.ab ?? 0), 0)
        : null

  return {
    ...emptyTeamCatcherStatsRow(seed),
    ...fields,
    gamesAsCatcher,
    ab: ab && ab > 0 ? ab : null,
    romanName: seed.romanName,
  }
}
