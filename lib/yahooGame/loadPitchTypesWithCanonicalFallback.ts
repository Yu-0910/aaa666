/**
 * canonical の plateAppearances がある試合は canonical から再計算を優先し、
 * 無い場合のみ yahoo_games_pilot の JSON を読む。
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

  const doc = loadCanonicalGameDocument(projectRoot, gid)
  if (doc) {
    const fromCanonical = buildPitchTypesResponseFromCanonical(
      gid,
      yid,
      doc.domain.plateAppearances ?? [],
    )
    if (fromCanonical) return fromCanonical
  }

  return loadPitchTypesJson(projectRoot, gid, yid)
}
