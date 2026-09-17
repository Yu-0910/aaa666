/**
 * トップ TOP / 今週タブ用スナップショットのサーバー読み込み（クライアントから import しない）
 * 本番: public/data は無い → RANKINGS_BASE_URL 経由で R2 直読み
 */

import fs from "fs"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { fetchDisplayJsonServer } from "@/lib/ranking/fetchDisplayJsonServer"
import { getRankingsBaseUrl } from "@/lib/displayData/rankingsBaseUrl"
import { getProjectRoot } from "@/lib/projectRoot"
import { fetchTopLeadersSnapshotRemote } from "@/lib/topPage/fetchTopLeadersSnapshotRemote"
import { readTopLeadersSnapshot } from "@/lib/topPage/leadersSnapshot2026"
import { getPitchingLeadersAsync } from "@/lib/ranking/leadersFromPitchingRankingsJson"
import { loadRecentGamesV2 } from "@/lib/ranking/loadRecentGamesV2"
import { loadMetricsFromRecord } from "@/lib/ranking/record"
import { playerPageHrefKnown } from "@/lib/playerPageHref"
import {
  publicWeeklyTeamStandingsRelPath,
  siteWeeklyTeamStandingsPath,
} from "@/lib/standings/paths"
import { isTeamStandingsJson, type StandingsLeague, type TeamStandingsJson } from "@/lib/standings/types"
import { TOP_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/leadersSnapshotShared"
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"
import type { RecentTabPayload, SeasonTabPayload, WeeklyTabPayload } from "@/lib/topPage/topPageTabPayloadTypes"
import { buildRecentV2Cards, type RecentV2CardsPayload } from "@/lib/topPage/recentGamesV2Cards"
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

function readWeeklyTeamStandingsLocal(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: StandingsLeague
): TeamStandingsJson | null {
  const p = `${projectRoot}/${publicWeeklyTeamStandingsRelPath(year, weekKey, league)}`
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"))
    return isTeamStandingsJson(raw) ? raw : null
  } catch {
    return null
  }
}

async function readWeeklyTeamStandingsAsync(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: StandingsLeague
): Promise<TeamStandingsJson | null> {
  const local = readWeeklyTeamStandingsLocal(projectRoot, year, weekKey, league)
  if (local) return local
  const raw = await fetchDisplayJsonServer<unknown>(
    siteWeeklyTeamStandingsPath(year, weekKey, league)
  )
  return isTeamStandingsJson(raw) ? raw : null
}

/** Vercel 本番: R2 フォールバック（rankingsBaseUrl）が使えるときはサーバー先読み可 */
export function canPreload2026TabDataOnServer(): boolean {
  // 本番トップでの先読みは、外部 JSON 取得の遅延がそのままページ全体の 504 になる。
  // クライアント側に同等のフォールバック取得があるため、本番では先読みを切る。
  if (process.env.VERCEL && process.env.NODE_ENV === "production") return false
  if (getRankingsBaseUrl()) return true
  if (!process.env.VERCEL) return true
  return false
}

export async function loadSeasonTabPayloadServer(
  year: string | number
): Promise<SeasonTabPayload | null> {
  try {
    const yearStr = String(year)
    if (yearStr !== TOP_LEADERS_SNAPSHOT_YEAR) return null
    if (!canPreload2026TabDataOnServer()) return null

    const loadSnapshot = async (
      league: string,
      category: TopLeadersCategory
    ): Promise<LeadersConfig | null> => {
      if (category === "pitching") {
        const config = await getPitchingLeadersAsync(yearStr, league)
        return Object.keys(config.leaders).length > 0 ? config : null
      }
      const local = readTopLeadersSnapshot(yearStr, league, category)
      if (local && Object.keys(local.leaders).length > 0) return local
      return fetchTopLeadersSnapshotRemote(yearStr, league, category)
    }

    const [clBat, plBat, clPitch, plPitch] = await Promise.all([
      loadSnapshot("CL", "batting"),
      loadSnapshot("PL", "batting"),
      loadSnapshot("CL", "pitching"),
      loadSnapshot("PL", "pitching"),
    ])

    if (!clBat || !plBat) return null

    const payload: SeasonTabPayload = {
      batting: { CL: clBat, PL: plBat },
    }
    if (clPitch && plPitch) {
      payload.pitching = { CL: clPitch, PL: plPitch }
    }
    return payload
  } catch (err) {
    console.error("[loadSeasonTabPayloadServer]", err)
    return null
  }
}

export async function loadWeeklyTabPayloadServer(
  year: string | number
): Promise<WeeklyTabPayload | null> {
  try {
    const yearStr = String(year)
    if (yearStr !== TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR) return null
    if (!canPreload2026TabDataOnServer()) return null

    const root = getProjectRoot()
    const metaRaw = await readWeeklyCurrentWeekMetaAsync(root, yearStr)
    if (!metaRaw?.weekKey) return null

    const calendarWeekKey = metaRaw.calendarWeekKey ?? metaRaw.weekKey
    const weekMeta = {
      weekKey: metaRaw.weekKey,
      weekLabel: metaRaw.weekLabel ?? weekLabelForKey(metaRaw.weekKey),
      calendarWeekKey,
      calendarWeekLabel:
        metaRaw.calendarWeekLabel ?? weekLabelForKey(calendarWeekKey),
      isFallbackWeek: metaRaw.isFallbackWeek ?? false,
      availableWeekKeys:
        Array.isArray(metaRaw.availableWeekKeys) && metaRaw.availableWeekKeys.length > 0
          ? metaRaw.availableWeekKeys
          : [metaRaw.weekKey],
    }

    const weekKey = weekMeta.weekKey
    const [clBat, plBat, clPitch, plPitch, clStandings, plStandings] = await Promise.all([
      readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "CL", "batting"),
      readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "PL", "batting"),
      readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "CL", "pitching"),
      readWeeklyTopLeadersSnapshotAsync(root, yearStr, weekKey, "PL", "pitching"),
      readWeeklyTeamStandingsAsync(root, yearStr, weekKey, "CL"),
      readWeeklyTeamStandingsAsync(root, yearStr, weekKey, "PL"),
    ])

    if (!clBat || !plBat || !clPitch || !plPitch) return null

    return {
      weekMeta,
      batting: { CL: clBat, PL: plBat },
      pitching: { CL: clPitch, PL: plPitch },
      standings: clStandings && plStandings ? { CL: clStandings, PL: plStandings } : undefined,
    }
  } catch (err) {
    console.error("[loadWeeklyTabPayloadServer]", err)
    return null
  }
}

async function loadRecentCardsPayloadServer(
  league: "CL" | "PL"
): Promise<RecentV2CardsPayload> {
  const metrics = loadMetricsFromRecord().map(({ key, label }) => ({ key, label }))
  const snapshot = await loadRecentGamesV2(league, metrics)
  const cards = buildRecentV2Cards(snapshot).map(card => ({
    ...card,
    rows: card.rows.map(row => ({
      ...row,
      href: playerPageHrefKnown({
        playerId: row.playerId,
        npbPlayerId: row.npbPlayerId ?? undefined,
        name: row.name,
        season: "2026",
      }) ?? null,
    })),
  }))
  return {
    schemaVersion: "recent-10-cards-v2",
    league,
    asOf: snapshot.asOf,
    latestGameDate: snapshot.latestGameDate,
    generatedAt: snapshot.generatedAt,
    cards,
  }
}

export async function loadRecentTabPayloadServer(
  year: string | number
): Promise<RecentTabPayload | null> {
  try {
    if (String(year) !== "2026") return null
    const [cl, pl] = await Promise.all([
      loadRecentCardsPayloadServer("CL"),
      loadRecentCardsPayloadServer("PL"),
    ])
    return { CL: cl, PL: pl }
  } catch (err) {
    console.error("[loadRecentTabPayloadServer]", err)
    return null
  }
}
