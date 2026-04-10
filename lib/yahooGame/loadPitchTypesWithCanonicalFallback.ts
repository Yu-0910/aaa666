/**
 * yahoo_games_pilot の JSON を優先し、無ければ canonical の plateAppearances から球種別を組み立てる
 */

import { buildPitchTypesResponseFromCanonical } from "./pitchTypesFromCanonical"
import type { GamePitchTypesResponse } from "./gamePitcherPilotFiles"
import { loadPitchTypesJson } from "./gamePitcherPilotFiles"
import { loadCanonicalGameDocument } from "./loadCanonicalGame"

export function loadPitchTypesJsonOrCanonical(
  projectRoot: string,
  gameId: string,
  yahooPitcherId: string
): GamePitchTypesResponse | null {
  const gid = gameId.trim()
  const yid = yahooPitcherId.trim()
  if (!gid || !yid) return null

  const fromFile = loadPitchTypesJson(projectRoot, gid, yid)
  if (fromFile) return fromFile

  const doc = loadCanonicalGameDocument(projectRoot, gid)
  if (!doc) return null
  return buildPitchTypesResponseFromCanonical(gid, yid, doc.domain.plateAppearances ?? [])
}
