/**
 * 週間ランキング JSON → トップ「今週」タブ用スナップショット（Phase 2）
 */

import fs from "fs"
import path from "path"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import type { TopLeadersCategory } from "@/lib/topPage/leadersSnapshotShared"
import {
  buildBattingLeadersConfigAtLeagueDir,
  buildPitchingLeadersConfigAtLeagueDir,
  weeklyBattingRankingsLeagueDir,
  weeklyPitchingRankingsLeagueDir,
} from "@/lib/ranking/leadersFromRankingsAtLeagueDir"
import { weekLabelForKey } from "@/lib/ranking/weeklyRankingsWeekKeys"
import { TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR } from "@/lib/topPage/weeklyLeadersSnapshotShared"

const SNAPSHOT_LEAGUES = ["CL", "PL"] as const
/** 週間も canonical team-games + 規定（Phase 1）。weekKey は呼び出し側で付与 */

export type WeeklyLeadersSnapshotMeta = {
  weekKey: string
  weekLabel: string
  year: string
}

export type WeeklyLeadersConfig = LeadersConfig & {
  meta?: WeeklyLeadersSnapshotMeta
}

export function topWeeklyLeadersSnapshotFilePath(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory
): string {
  return path.join(
    projectRoot,
    "public",
    "data",
    "top-leaders",
    "weekly",
    year,
    weekKey,
    league.toUpperCase(),
    `${category}.json`
  )
}

export function listWeeklyRankingWeekKeys(projectRoot: string, year: string): string[] {
  const dir = path.join(projectRoot, "public", "data", "rankings", "weekly", year)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
    .reverse()
}

export function readCurrentWeekMeta(
  projectRoot: string,
  year: string
): { weekKey: string; weekLabel: string } | null {
  const p = path.join(projectRoot, "public", "data", "rankings", "weekly", year, "current-week.json")
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      weekKey?: string
      weekLabel?: string
    }
    if (!raw.weekKey) return null
    return {
      weekKey: raw.weekKey,
      weekLabel: raw.weekLabel ?? weekLabelForKey(raw.weekKey),
    }
  } catch {
    return null
  }
}

function attachMeta(
  config: LeadersConfig,
  meta: WeeklyLeadersSnapshotMeta
): WeeklyLeadersConfig {
  return { ...config, meta }
}

function writeWeeklySnapshot(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string,
  category: TopLeadersCategory,
  config: WeeklyLeadersConfig
): string {
  const p = topWeeklyLeadersSnapshotFilePath(projectRoot, year, weekKey, league, category)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
  return p
}

export type BuildWeeklyTopLeadersSnapshotResult = {
  written: string[]
  skipped: { weekKey: string; league: string; category: TopLeadersCategory; reason: string }[]
}

export function buildWeeklyTopLeadersSnapshots(
  projectRoot: string,
  year: string = TOP_WEEKLY_LEADERS_SNAPSHOT_YEAR,
  weekKeys?: string[]
): BuildWeeklyTopLeadersSnapshotResult {
  const keys =
    weekKeys && weekKeys.length > 0 ? weekKeys : listWeeklyRankingWeekKeys(projectRoot, year)

  if (keys.length === 0) {
    return {
      written: [],
      skipped: [
        {
          weekKey: "",
          league: "",
          category: "batting",
          reason: "no weekly rankings under public/data/rankings/weekly — run phase28 first",
        },
      ],
    }
  }

  const written: string[] = []
  const skipped: BuildWeeklyTopLeadersSnapshotResult["skipped"] = []

  for (const weekKey of keys) {
    const meta: WeeklyLeadersSnapshotMeta = {
      weekKey,
      weekLabel: weekLabelForKey(weekKey),
      year,
    }

    for (const league of SNAPSHOT_LEAGUES) {
      for (const category of ["batting", "pitching"] as const) {
        let config: LeadersConfig | null = null
        if (category === "batting") {
          const dir = weeklyBattingRankingsLeagueDir(projectRoot, year, weekKey, league)
          config = buildBattingLeadersConfigAtLeagueDir(dir, year, league, { weekKey })
        } else {
          const dir = weeklyPitchingRankingsLeagueDir(projectRoot, year, weekKey, league)
          config = buildPitchingLeadersConfigAtLeagueDir(dir, year, league, { weekKey })
        }

        if (!config || Object.keys(config.leaders).length === 0) {
          skipped.push({
            weekKey,
            league,
            category,
            reason: "weekly rankings JSON missing or no leaders after extract",
          })
          continue
        }

        const filePath = writeWeeklySnapshot(
          projectRoot,
          year,
          weekKey,
          league,
          category,
          attachMeta(config, meta)
        )
        written.push(filePath)
      }
    }
  }

  return { written, skipped }
}
