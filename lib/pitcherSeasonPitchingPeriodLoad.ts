/**
 * Phase 7 派生: `_data/derived/player_season_pitching_period/{year}/npb_{id}.json` を読む（サーバー専用）
 */

import fs from "fs"
import path from "path"
import type {
  PitcherSeasonPitchingPeriodPayload,
  PitcherSeasonPitchingPeriodRow,
} from "./pitcherSeasonPocTypes"
import {
  PILOT_DERIVED_FALLBACK_NPB,
  withPilotPitcherPeriodFallbackShell,
} from "./pitcherSeasonPocPilotFallback"
import { getProjectRoot } from "./projectRoot"

function normalizeCalendarMonthLabel(row: PitcherSeasonPitchingPeriodRow): PitcherSeasonPitchingPeriodRow {
  if (row.split_type !== "calendar_month") return row
  const m = String(row.split_value ?? "").match(/^(\d{4})-(\d{2})$/)
  if (!m) return row
  return { ...row, split_label: `${parseInt(m[2], 10)}月` }
}

export function pitcherSeasonPitchingPeriodFilePath(
  projectRoot: string,
  year: string,
  npbPlayerId: string
): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, "")
  return path.join(
    projectRoot,
    "_data",
    "derived",
    "player_season_pitching_period",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadPitcherSeasonPitchingPeriodPayload(
  projectRoot: string,
  year: string,
  npbPlayerId: string
): PitcherSeasonPitchingPeriodPayload | null {
  const p = pitcherSeasonPitchingPeriodFilePath(projectRoot, year, npbPlayerId)
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, "utf8")
    const j = JSON.parse(raw) as PitcherSeasonPitchingPeriodPayload
    if (j?.schemaVersion !== "phase7-player-season-pitching-period-v0" || !j.npbPlayerId) return null
    return {
      ...j,
      rows: (j.rows ?? []).map(normalizeCalendarMonthLabel),
    }
  } catch {
    return null
  }
}

/** `getProjectRoot()` を使う短縮形 */
export function loadPitcherSeasonPitchingPeriodPayloadFromRepo(
  year: string,
  npbPlayerId: string
): PitcherSeasonPitchingPeriodPayload | null {
  const root = getProjectRoot()
  const direct = loadPitcherSeasonPitchingPeriodPayload(root, year, npbPlayerId)
  if (direct) return direct
  const altNpb = PILOT_DERIVED_FALLBACK_NPB[npbPlayerId]
  if (!altNpb) return null
  const base = loadPitcherSeasonPitchingPeriodPayload(root, year, altNpb)
  if (!base) return null
  return withPilotPitcherPeriodFallbackShell(base, npbPlayerId)
}
