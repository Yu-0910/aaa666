import {
  BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION,
  type BatterVsTeamCountPitchTypesFile,
} from "@/lib/batterVsTeamCountPitchTypesTypes"
import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from "@/lib/derived/fetchDerivedJsonServer"

export const BATTER_VS_TEAM_COUNT_PITCH_TYPES_CATEGORY =
  "player_batter_vs_team_count_pitch_types" as const

function sanitizeYahooBatterId(yahooBatterId: string): string {
  return String(yahooBatterId ?? "").replace(/[^\d]/g, "")
}

function parseBatterVsTeamCountPitchTypesFile(
  raw: BatterVsTeamCountPitchTypesFile | null,
  yahooBatterId: string,
): BatterVsTeamCountPitchTypesFile | null {
  if (!raw) return null
  if (raw.schemaVersion !== BATTER_VS_TEAM_COUNT_PITCH_TYPES_SCHEMA_VERSION) return null
  const expected = sanitizeYahooBatterId(yahooBatterId)
  if (!expected) return null
  if (sanitizeYahooBatterId(raw.yahooBatterId) !== expected) return null
  if (!Array.isArray(raw.teams)) return null
  return raw
}

export function loadBatterVsTeamCountPitchTypesFromRepo(
  year: string,
  yahooBatterId: string,
): BatterVsTeamCountPitchTypesFile | null {
  const safeYahoo = sanitizeYahooBatterId(yahooBatterId)
  if (!safeYahoo) return null
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  return parseBatterVsTeamCountPitchTypesFile(
    readDerivedJsonLocalSync<BatterVsTeamCountPitchTypesFile>(
      BATTER_VS_TEAM_COUNT_PITCH_TYPES_CATEGORY,
      safeYear,
      `yahoo_${safeYahoo}.json`,
    ),
    safeYahoo,
  )
}

export async function loadBatterVsTeamCountPitchTypesFromRepoAsync(
  year: string,
  yahooBatterId: string,
): Promise<BatterVsTeamCountPitchTypesFile | null> {
  const safeYahoo = sanitizeYahooBatterId(yahooBatterId)
  if (!safeYahoo) return null
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  return parseBatterVsTeamCountPitchTypesFile(
    await fetchDerivedJsonServer<BatterVsTeamCountPitchTypesFile>(
      BATTER_VS_TEAM_COUNT_PITCH_TYPES_CATEGORY,
      safeYear,
      `yahoo_${safeYahoo}.json`,
    ),
    safeYahoo,
  )
}
