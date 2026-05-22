/**
 * 2026 トップページ専用リーダー JSON（ランキング JSON からビルド時に一度だけ切り出し）。
 * サーバー／ビルドスクリプト専用（fs 使用）。クライアントから import しないこと。
 *
 * 配置: public/data/top-leaders/2026/{CL|PL}/{batting|pitching}.json
 */

import fs from "fs"
import path from "path"
import type { LeadersConfig } from "@/lib/ranking/leadersTypes"
import { buildBattingLeadersConfigFromRankings } from "@/lib/ranking/leadersFromRankingsJson"
import { buildPitchingLeadersConfigFromRankings } from "@/lib/ranking/leadersFromPitchingRankingsJson"
import {
  TOP_LEADERS_SNAPSHOT_YEAR,
  type TopLeadersCategory,
} from "@/lib/topPage/leadersSnapshotShared"

export {
  TOP_LEADERS_SNAPSHOT_YEAR,
  topLeadersSnapshotPublicUrl,
  usesTopLeadersSnapshot,
  type TopLeadersCategory,
} from "@/lib/topPage/leadersSnapshotShared"

const SNAPSHOT_LEAGUES = ["CL", "PL"] as const

export function topLeadersSnapshotFilePath(
  year: string,
  league: string,
  category: TopLeadersCategory
): string {
  return path.join(
    process.cwd(),
    "public",
    "data",
    "top-leaders",
    year,
    league.toUpperCase(),
    `${category}.json`
  )
}

function isLeadersConfigShape(value: unknown): value is LeadersConfig {
  if (!value || typeof value !== "object") return false
  const o = value as LeadersConfig
  return (
    Array.isArray(o.top3Metrics) &&
    Array.isArray(o.miniMetrics) &&
    o.leaders !== null &&
    typeof o.leaders === "object"
  )
}

/** サーバー／ビルドスクリプト用: スナップショットを読む */
export function readTopLeadersSnapshot(
  year: string,
  league: string,
  category: TopLeadersCategory
): LeadersConfig | null {
  const p = topLeadersSnapshotFilePath(year, league, category)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown
    if (!isLeadersConfigShape(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function writeTopLeadersSnapshot(
  year: string,
  league: string,
  category: TopLeadersCategory,
  config: LeadersConfig
): string {
  const p = topLeadersSnapshotFilePath(year, league, category)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
  return p
}

function buildConfigFromRankings(
  year: string,
  league: string,
  category: TopLeadersCategory
): LeadersConfig | null {
  if (category === "batting") {
    return buildBattingLeadersConfigFromRankings(year, league)
  }
  return buildPitchingLeadersConfigFromRankings(year, league)
}

export type BuildTopLeadersSnapshotResult = {
  written: string[]
  skipped: { league: string; category: TopLeadersCategory; reason: string }[]
}

/**
 * ランキング JSON からトップ用スナップショットを生成（2026 想定）。
 */
export function buildTopLeadersSnapshotsForYear(
  year: string = TOP_LEADERS_SNAPSHOT_YEAR
): BuildTopLeadersSnapshotResult {
  const written: string[] = []
  const skipped: BuildTopLeadersSnapshotResult["skipped"] = []

  for (const league of SNAPSHOT_LEAGUES) {
    for (const category of ["batting", "pitching"] as const) {
      const config = buildConfigFromRankings(year, league, category)
      if (!config || Object.keys(config.leaders).length === 0) {
        skipped.push({
          league,
          category,
          reason: "rankings JSON missing or no leaders after extract",
        })
        continue
      }
      const filePath = writeTopLeadersSnapshot(year, league, category, config)
      written.push(filePath)
    }
  }

  return { written, skipped }
}
