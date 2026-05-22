/**
 * トップ TOP / 今週タブ用スナップショットのサーバー読み込み（クライアントから import しない）
 * 本番: public/data は無い → RANKINGS_BASE_URL 経由で R2 直読み
 */

import fs from "fs"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { fetchDisplayJsonServer } from "@/lib/ranking/fetchDisplayJsonServer"
import { getProjectRoot } from "@/lib/projectRoot"
import { readTopLeadersSnapshotAsync } from "@/lib/topPage/leadersSnapshot2026"
import { TOP_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/leadersSnapshotShared"
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"
import type { SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"
import {
  readWeeklyCurrentWeekJson,
  type WeeklyCurrentWeekJson,
} from "@/lib/topPage/weeklyCurrentWeekMeta"
import { topWeeklyLeadersSnapshotFilePath } from "@/lib/topPage/weeklyLeadersSnapshotBuild"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import {
  topWeeklyCurrentWeekPublicUrl,
  topWeeklyLeadersSnapshotPublicUrl,
  TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR,
} from "@/lib/topPage/weeklyLeadersSnapshotShared"

function parseWeeklyLeadersConfig(raw: unknown): LeadersConfig | null {
  const o = raw as LeadersConfig & { leaders?: Record<string, unknown[]> }
  if (!o?.leaders || Object.keys(o.leaders).length === 0) return null
  return {
    top3Metrics: o.top3Metrics ?? [],
    miniMetrics: o.miniMetrics ?? [],
    leaders: o.leaders,
  }
}

function readWeeklyTopLeadersSnapshotLocal(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory
): LeadersConfig | null {
  const p = topWeeklyLeadersSnapshotFilePath(projectRoot, year, weekKey, league, category)
  if (!fs.existsSync(p)) return null
  try {
    return parseWeeklyLeadersConfig(JSON.parse(fs.readFileSync(p, "utf-8")))
  } catch {
    return null
  }
}

async function readWeeklyTopLeadersSnapshotAsync(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory
): Promise<LeadersConfig | null> {
  const local = readWeeklyTopLeadersSnapshotLocal(
    projectRoot,
    year,
    weekKey,
    league,
    category
  )
  if (local) return local
  const raw = await fetchDisplayJsonServer<unknown>(
    topWeeklyLeadersSnapshotPublicUrl(year, weekKey, league, category)
  )
  return parseWeeklyLeadersConfig(raw)
}

async function readWeeklyCurrentWeekMetaAsync(
  projectRoot: string,
  year: string
): Promise<WeeklyCurrentWeekJson | null> {
  const local = readWeeklyCurrentWeekJson(projectRoot, year)
  if (local) return local
  return fetchDisplayJsonServer<WeeklyCurrentWeekJson>(
    topWeeklyCurrentWeekPublicUrl(year)
  )
}

export async function loadSeasonTabPayloadServer(
  year: string | number
): Promise<SeasonTabPayload | null> {
  const yearStr = String(year)
  if (yearStr !== TOP_LEADERS_SNAPSHOT_YEAR) return null

  const [clBat, plBat, clPitch, plPitch] = await Promise.all([
    readTopLeadersSnapshotAsync(yearStr, "CL", "batting"),
    readTopLeadersSnapshotAsync(yearStr, "PL", "batting"),
    readTopLeadersSnapshotAsync(yearStr, "CL", "pitching"),
    readTopLeadersSnapshotAsync(yearStr, "PL", "pitching"),
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
  const metaRaw = await readWeeklyCurrentWeekMetaAsync(root, yearStr)
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
    readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "CL", "batting"),
    readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "PL", "batting"),
    readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "CL", "pitching"),
    readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "PL", "pitching"),
  ])

  if (!clBat || !plBat || !clPitch || !plPitch) return null

  return {
    weekMeta,
    batting: { CL: clBat, PL: plBat },
    pitching: { CL: clPitch, PL: plPitch },
  }
}
