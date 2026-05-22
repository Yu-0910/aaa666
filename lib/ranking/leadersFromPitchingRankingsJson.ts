/**
 * 投手ランキングページと同じ `public/data/rankings/pitching/{year}/{league}/*.json` から
 * トップページ用リーダーを切り出す（再集計しない）。
 */

import fs from "fs"
import path from "path"
import { getPitchingJsonKey } from "@/lib/ranking/metricMap"
import { sanitizeMetricForPath } from "@/lib/ranking/url"
import {
  computePitchingQualifyingMinIpByTeam,
  rowMeetsPitchingQualifyingIp,
  shouldRequireQualifyingPitching,
} from "@/lib/ranking/qualifyingPitching"
import { resolvePitchingThresholdsForRanking } from "@/lib/ranking/qualifyingThresholds"
import type { LeaderRow, LeadersConfig } from "@/lib/ranking/leadersTypes"
import {
  PITCHING_TOP_2026_GRID_METRICS,
  PITCHING_TOP_2026_MINI_METRICS,
} from "@/lib/topPagePitching2026Grid"
import { fetchPitchingRankingMetricJsonServer } from "@/lib/ranking/fetchDisplayJsonServer"
import {
  readTopLeadersSnapshot,
  readTopLeadersSnapshotAsync,
  TOP_LEADERS_SNAPSHOT_YEAR,
} from "@/lib/topPage/leadersSnapshot2026"

const teamCodeToName: Record<string, string> = {
  H: "阪神",
  G: "巨人",
  DB: "DeNA",
  C: "広島",
  D: "中日",
  S: "ヤクルト",
  Bs: "オリックス",
  M: "ロッテ",
  F: "日本ハム",
  E: "楽天",
  L: "西武",
  Hs: "ソフトバンク",
}

const teamNameToCode: Record<string, string> = {
  阪神: "H",
  阪神タイガース: "H",
  巨人: "G",
  読売ジャイアンツ: "G",
  DeNA: "DB",
  横浜DeNAベイスターズ: "DB",
  広島: "C",
  広島東洋カープ: "C",
  中日: "D",
  中日ドラゴンズ: "D",
  ヤクルト: "S",
  東京ヤクルトスワローズ: "S",
  オリックス: "Bs",
  "オリックス・バファローズ": "Bs",
  ロッテ: "M",
  千葉ロッテマリーンズ: "M",
  日本ハム: "F",
  北海道日本ハムファイターズ: "F",
  楽天: "E",
  東北楽天ゴールデンイーグルス: "E",
  西武: "L",
  埼玉西武ライオンズ: "L",
  ソフトバンク: "Hs",
  福岡ソフトバンクホークス: "Hs",
}

function getTeamName(teamCode: string): string {
  return teamCodeToName[teamCode] || teamCode
}

function getTeamCode(teamName: string): string {
  const t = String(teamName ?? "").trim()
  if (teamNameToCode[t]) return teamNameToCode[t]
  for (const [name, code] of Object.entries(teamNameToCode)) {
    if (t.includes(name) || name.includes(t)) return code
  }
  return t
}

type RankingJsonRow = Record<string, unknown>

function pitchingMetricJsonPath(year: string, league: string, metricLabel: string): string {
  const fileBase = sanitizeMetricForPath(metricLabel)
  return path.join(
    process.cwd(),
    "public",
    "data",
    "rankings",
    "pitching",
    year,
    league.toUpperCase(),
    `${fileBase}.json`
  )
}

export function hasPitchingRankingsJsonForLeague(year: string, league: string): boolean {
  return fs.existsSync(pitchingMetricJsonPath(year, league, "防御率"))
}

function readPitchingRankingMetricJson(
  year: string,
  league: string,
  metricLabel: string
): RankingJsonRow[] | null {
  const p = pitchingMetricJsonPath(year, league, metricLabel)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown
    return Array.isArray(raw) ? (raw as RankingJsonRow[]) : null
  } catch {
    return null
  }
}

function metricValueFromRow(row: RankingJsonRow, metricLabel: string): string | number {
  const key = getPitchingJsonKey(metricLabel)
  const v = row[key]
  if (v !== null && v !== undefined && v !== "") {
    return v as string | number
  }
  return 0
}

function toLeaderRow(row: RankingJsonRow, displayRank: number, metricLabel: string): LeaderRow {
  const nameRaw = String(row.name ?? row.player ?? "").trim() || "不明"
  const teamRaw = String(row.team ?? "").trim()
  const teamCode = getTeamCode(teamRaw)
  const romanRaw = String(row.romanName ?? "").trim()
  const rank = Math.min(3, Math.max(1, displayRank)) as 1 | 2 | 3

  return {
    rank,
    name: nameRaw.replace(/\s+/g, ""),
    team: teamCode,
    teamName: getTeamName(teamCode),
    value: metricValueFromRow(row, metricLabel),
    romanName: romanRaw || undefined,
  }
}

function extractTopPitchingLeadersFromRows(
  rows: RankingJsonRow[],
  metricLabel: string,
  topN: number,
  year: string,
  league: string
): LeaderRow[] {
  const metricKey = getPitchingJsonKey(metricLabel)
  let ordered = rows
  if (shouldRequireQualifyingPitching(metricKey)) {
    const fromCanonical = resolvePitchingThresholdsForRanking(
      process.cwd(),
      year,
      league
    )
    const thresholds =
      fromCanonical ??
      computePitchingQualifyingMinIpByTeam(rows as Parameters<typeof rowMeetsPitchingQualifyingIp>[0][])
    ordered = rows.filter((row) =>
      rowMeetsPitchingQualifyingIp(row as Parameters<typeof rowMeetsPitchingQualifyingIp>[0], thresholds)
    )
  }  return ordered.slice(0, topN).map((row, i) => toLeaderRow(row, i + 1, metricLabel))
}

function topNForPitchingMetric(metricLabel: string): number {
  if ((PITCHING_TOP_2026_GRID_METRICS as readonly string[]).includes(metricLabel)) return 3
  return 1
}

function buildPitchingLeadersFromMetricRows(
  year: string,
  league: string,
  metricRows: Map<string, RankingJsonRow[]>
): LeadersConfig | null {
  const upperLeague = league.toUpperCase()
  const leaders: Record<string, LeaderRow[]> = {}
  const allMetrics = [...PITCHING_TOP_2026_GRID_METRICS, ...PITCHING_TOP_2026_MINI_METRICS]

  for (const metricLabel of allMetrics) {
    const rows = metricRows.get(metricLabel)
    if (!rows?.length) continue
    const topN = topNForPitchingMetric(metricLabel)
    const top = extractTopPitchingLeadersFromRows(rows, metricLabel, topN, year, upperLeague)
    if (top.length > 0) leaders[metricLabel] = top
  }

  if (Object.keys(leaders).length === 0) return null

  return {
    top3Metrics: [...PITCHING_TOP_2026_GRID_METRICS],
    miniMetrics: [...PITCHING_TOP_2026_MINI_METRICS],
    leaders,
  }
}

export function buildPitchingLeadersConfigFromRankings(
  year: string,
  league: string
): LeadersConfig | null {
  const upperLeague = league.toUpperCase()
  if (!hasPitchingRankingsJsonForLeague(year, upperLeague)) return null

  const metricRows = new Map<string, RankingJsonRow[]>()
  const allMetrics = [...PITCHING_TOP_2026_GRID_METRICS, ...PITCHING_TOP_2026_MINI_METRICS]
  for (const metricLabel of allMetrics) {
    const rows = readPitchingRankingMetricJson(year, upperLeague, metricLabel)
    if (rows?.length) metricRows.set(metricLabel, rows)
  }
  return buildPitchingLeadersFromMetricRows(year, league, metricRows)
}

export async function buildPitchingLeadersConfigFromRankingsAsync(
  year: string,
  league: string
): Promise<LeadersConfig | null> {
  const upperLeague = league.toUpperCase()
  const metricRows = new Map<string, RankingJsonRow[]>()
  const allMetrics = [...PITCHING_TOP_2026_GRID_METRICS, ...PITCHING_TOP_2026_MINI_METRICS]

  for (const metricLabel of allMetrics) {
    let rows = readPitchingRankingMetricJson(year, upperLeague, metricLabel)
    if (!rows?.length) {
      rows = await fetchPitchingRankingMetricJsonServer(
        year,
        upperLeague,
        metricLabel,
        sanitizeMetricForPath
      )
    }
    if (rows?.length) metricRows.set(metricLabel, rows)
  }
  return buildPitchingLeadersFromMetricRows(year, league, metricRows)
}

export function getPitchingLeaders(year: string, league: string): LeadersConfig {
  const upperLeague = league.toUpperCase()
  const empty: LeadersConfig = {
    top3Metrics: [...PITCHING_TOP_2026_GRID_METRICS],
    miniMetrics: [...PITCHING_TOP_2026_MINI_METRICS],
    leaders: {},
  }

  if (year === TOP_LEADERS_SNAPSHOT_YEAR) {
    const fromSnapshot = readTopLeadersSnapshot(year, upperLeague, "pitching")
    if (fromSnapshot && Object.keys(fromSnapshot.leaders).length > 0) {
      return fromSnapshot
    }
  }

  if (hasPitchingRankingsJsonForLeague(year, upperLeague)) {
    const fromRankings = buildPitchingLeadersConfigFromRankings(year, upperLeague)
    if (fromRankings) return fromRankings
  }

  return empty
}

export async function getPitchingLeadersAsync(
  year: string,
  league: string
): Promise<LeadersConfig> {
  const upperLeague = league.toUpperCase()
  const empty: LeadersConfig = {
    top3Metrics: [...PITCHING_TOP_2026_GRID_METRICS],
    miniMetrics: [...PITCHING_TOP_2026_MINI_METRICS],
    leaders: {},
  }

  if (year === TOP_LEADERS_SNAPSHOT_YEAR) {
    const fromSnapshot = await readTopLeadersSnapshotAsync(year, upperLeague, "pitching")
    if (fromSnapshot && Object.keys(fromSnapshot.leaders).length > 0) {
      return fromSnapshot
    }
  }

  const fromRankings = await buildPitchingLeadersConfigFromRankingsAsync(year, upperLeague)
  if (fromRankings) return fromRankings

  if (hasPitchingRankingsJsonForLeague(year, upperLeague)) {
    const sync = buildPitchingLeadersConfigFromRankings(year, upperLeague)
    if (sync) return sync
  }

  return empty
}
