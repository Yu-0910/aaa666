/**
 * yahoo_games_pilot の zone_stats JSON を優先し、無ければ canonical から対右・対左 25 ゾーンを組み立てる
 */

import { buildPitcherZoneStatsFromCanonicalPlateAppearances } from "@/lib/pitchDetailsPilot"
import { getNpbRoster2026 } from "@/lib/npbRoster"
import type { ZoneStatsResponse } from "./gamePitcherPilotFiles"
import { loadZoneStatsJson } from "./gamePitcherPilotFiles"
import { resolveBatHandJaForBatter } from "./batterHandFromCanonical"
import { loadCanonicalGameDocument } from "./loadCanonicalGame"

export function loadZoneStatsJsonOrCanonical(
  projectRoot: string,
  gameId: string,
  yahooPitcherId: string
): ZoneStatsResponse | null {
  const gid = gameId.trim()
  const yid = yahooPitcherId.trim()
  if (!gid || !yid) return null

  const fromFile = loadZoneStatsJson(projectRoot, gid, yid)
  if (fromFile) return fromFile

  const doc = loadCanonicalGameDocument(projectRoot, gid)
  if (!doc) return null

  const roster = getNpbRoster2026()
  return buildPitcherZoneStatsFromCanonicalPlateAppearances(
    gid,
    yid,
    doc.domain.plateAppearances ?? [],
    (batterId) => resolveBatHandJaForBatter(doc, batterId, roster),
    { doc }
  )
}
