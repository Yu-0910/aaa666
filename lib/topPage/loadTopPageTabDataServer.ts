/**
 * トップ TOP / 今週タブ用スナップショットのサーバー読み込み（fs のみ・クライアントから import しない）
 */

import fs from "fs"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { getProjectRoot } from "@/lib/projectRoot"
import { readTopLeadersSnapshot } from "@/lib/topPage/leadersSnapshot2026"
import { TOP_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/leadersSnapshotShared"
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"
import type { SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"
import { readWeeklyCurrentWeekJson } from "@/lib/topPage/weeklyCurrentWeekMeta"
import { topWeeklyLeadersSnapshotFilePath } from "@/lib/topPage/weeklyLeadersSnapshotBuild"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/weeklyLeadersSnapshotShared"

function readWeeklyTopLeadersSnapshot(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory
): LeadersConfig | null {
  const p = topWeeklyLeadersSnapshotFilePath(projectRoot, year, weekKey, league, category)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as LeadersConfig & {
      leaders?: Record<string, unknown[]>
    }
    if (!raw.leaders || Object.keys(raw.leaders).length === 0) return null
    return {
      top3Metrics: raw.top3Metrics ?? [],
      miniMetrics: raw.miniMetrics ?? [],
      leaders: raw.leaders,
    }
  } catch {
    return null
  }
}

export async function loadSeasonTabPayloadServer(
  year: string | number
): Promise<SeasonTabPayload | null> {
  const yearStr = String(year)
  if (yearStr !== TOP_LEADERS_SNAPSHOT_YEAR) return null

  const [clBat, plBat, clPitch, plPitch] = await Promise.all([
    Promise.resolve(readTopLeadersSnapshot(yearStr, "CL", "batting")),
    Promise.resolve(readTopLeadersSnapshot(yearStr, "PL", "batting")),
    Promise.resolve(readTopLeadersSnapshot(yearStr, "CL", "pitching")),
    Promise.resolve(readTopLeadersSnapshot(yearStr, "PL", "pitching")),
  ])

  if (!clBat || !plBat) return null

  const payload: SeasonTabPayload = {
    batting: { CL: clBat, PL: plBat },
  }
  if (clPitch && plPitch) {
    payload.pitching = { CL: clPitch, PL: plPitch }
  }
  return payload
}

export async function loadWeeklyTabPayloadServer(
  year: string | number
): Promise<WeeklyTabPayload | null> {
  const yearStr = String(year)
  if (yearStr !== TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR) return null

  const root = getProjectRoot()
  const metaRaw = readWeeklyCurrentWeekJson(root, yearStr)
  if (!metaRaw?.weekKey) return null

  const weekMeta = {
    weekKey: metaRaw.weekKey,
    weekLabel: metaRaw.weekLabel ?? weekLabelForKey(metaRaw.weekKey),
    calendarWeekKey: metaRaw.calendarWeekKey ?? metaRaw.weekKey,
    calendarWeekLabel: metaRaw.calendarWeekLabel ?? weekLabelForKey(metaRaw.calendarWeekKey ?? metaRaw.weekKey),
    isFallbackWeek: metaRaw.isFallbackWeek ?? false,
  }

  const weekKey = weekMeta.weekKey
  const [clBat, plBat, clPitch, plPitch] = await Promise.all([
    Promise.resolve(readWeeklyTopLeadersSnapshot(root, yearStr, weekKey, "CL", "batting")),
    Promise.resolve(readWeeklyTopLeadersSnapshot(root, yearStr, weekKey, "PL", "batting")),
    Promise.resolve(readWeeklyTopLeadersSnapshot(root, yearStr, weekKey, "CL", "pitching")),
    Promise.resolve(readWeeklyTopLeadersSnapshot(root, yearStr, weekKey, "PL", "pitching")),
  ])

  if (!clBat || !plBat || !clPitch || !plPitch) return null

  return {
    weekMeta,
    batting: { CL: clBat, PL: plBat },
    pitching: { CL: clPitch, PL: plPitch },
  }
}
