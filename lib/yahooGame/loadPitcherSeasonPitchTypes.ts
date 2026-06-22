/**
 * `_data/derived/pitcher_season_pitch_types/{year}/npb_{id}.json` の読み込み
 */

import {
  fetchDerivedJsonServer,
  readDerivedJsonLocalSync,
} from "@/lib/derived/fetchDerivedJsonServer"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"

const CATEGORY = "pitcher_season_pitch_types"

function fileName(npbPlayerId: string): string {
  return `npb_${npbPlayerId.trim()}.json`
}

export function loadPitcherSeasonPitchTypesLocalSync(
  year: string,
  npbPlayerId: string,
): PitcherSeasonPitchTypesPayload | null {
  return readDerivedJsonLocalSync<PitcherSeasonPitchTypesPayload>(
    CATEGORY,
    year,
    fileName(npbPlayerId),
  )
}

export async function loadPitcherSeasonPitchTypesAsync(
  year: string,
  npbPlayerId: string,
): Promise<PitcherSeasonPitchTypesPayload | null> {
  return fetchDerivedJsonServer<PitcherSeasonPitchTypesPayload>(
    CATEGORY,
    year,
    fileName(npbPlayerId),
  )
}
