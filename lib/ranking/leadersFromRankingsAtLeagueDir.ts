/**
 * 任意のランキング JSON ディレクトリ（リーグフォルダ）からトップ用 LeadersConfig を切り出す。
 * 通算・週間の両方で利用（2026 週間も canonical team-games + 規定。`weekKey` 付与）。
 */

import fs from "fs"
import path from "path"
import { getJsonKey, getPitchingJsonKey } from "@/lib/ranking/metricMap"
import { sanitizeMetricForPath } from "@/lib/ranking/url"
import { calculateMinPA, shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { computeDynamicMinPAByTeam, rowPassesQualifyingPA } from "@/lib/ranking/dynamicQualifyingPA"
import {
  rowMeetsPitchingQualifyingIp,
  shouldRequireQualifyingPitching,
  computePitchingQualifyingMinIpByTeam,
} from "@/lib/ranking/qualifyingPitching"
import {
  resolveMinPAByTeamForRanking,
  resolvePitchingThresholdsForRanking,
  rowPassesQualifyingPAWithMinMap,
} from "@/lib/ranking/qualifyingThresholds"
import type { LeaderRow, LeadersConfig } from "@/lib/ranking/leadersTypes"
import {
  BATTING_TOP_2025_GRID_METRICS,
  BATTING_TOP_2025_RBI_TOP_N,
  BATTING_WEEKLY_TAB_TOP_N,
} from "@/lib/topPageBatting2025Grid"
import {
  PITCHING_TOP_2026_GRID_METRICS,
  PITCHING_TOP_2026_MINI_METRICS,
} from "@/lib/topPagePitching2026Grid"

const BATTING_TOP3_METRICS = ["OPS", "打率", "本塁打"] as const
const BATTING_MINI_METRICS = ["出塁率", "長打率", "打点", "安打", "盗塁"] as const
const BATTING_ALL_METRICS = [...BATTING_TOP3_METRICS, ...BATTING_MINI_METRICS] as const

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

export type LeadersExtractOptions = {
  /** true のとき規定フィルタをスキップ（テスト・後方互換） */
  skipQualifyingFilters?: boolean
  /** 週間: 当週の team-games.json を参照 */
  weekKey?: string
}

function metricJsonPath(leagueDir: string, metricLabel: string, kind: "batting" | "pitching"): string {
  const fileBase = sanitizeMetricForPath(metricLabel)
  return path.join(leagueDir, `${fileBase}.json`)
}

function readMetricJson(leagueDir: string, metricLabel: string, kind: "batting" | "pitching"): RankingJsonRow[] | null {
  const p = metricJsonPath(leagueDir, metricLabel, kind)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown
    return Array.isArray(raw) ? (raw as RankingJsonRow[]) : null
  } catch {
    return null
  }
}

function battingMetricValue(row: RankingJsonRow, metricLabel: string): string | number {
  const key = getJsonKey(metricLabel)
  const v = row[key]
  if (v !== null && v !== undefined && v !== "") return v as string | number
  return 0
}

function pitchingMetricValue(row: RankingJsonRow, metricLabel: string): string | number {
  const key = getPitchingJsonKey(metricLabel)
  const v = row[key]
  if (v !== null && v !== undefined && v !== "") return v as string | number
  return 0
}

function toLeaderRow(
  row: RankingJsonRow,
  displayRank: number,
  metricLabel: string,
  kind: "batting" | "pitching",
  maxDisplayRank = 3
): LeaderRow {
  const nameRaw = String(row.name ?? row.player ?? "").trim() || "不明"
  const teamRaw = String(row.team ?? "").trim()
  const teamCode = getTeamCode(teamRaw)
  const romanRaw = String(row.romanName ?? "").trim()
  const rank = Math.min(maxDisplayRank, Math.max(1, displayRank)) as LeaderRow["rank"]
  const value =
    kind === "batting"
      ? battingMetricValue(row, metricLabel)
      : pitchingMetricValue(row, metricLabel)

  return {
    rank,
    name: nameRaw.replace(/\s+/g, ""),
    team: teamCode,
    teamName: getTeamName(teamCode),
    value,
    romanName: romanRaw || undefined,
  }
}

function extractBattingTop(
  rows: RankingJsonRow[],
  metricLabel: string,
  topN: number,
  year: string,
  league: string,
  options: LeadersExtractOptions
): LeaderRow[] {
  let ordered = rows
  if (!options.skipQualifyingFilters) {
    const metricKey = getJsonKey(metricLabel)
    if (shouldRequireQualifyingPA(metricKey)) {
      const fallback = calculateMinPA(year, league)
      const fromCanonical = resolveMinPAByTeamForRanking(
        process.cwd(),
        year,
        league,
        options.weekKey
      )
      if (fromCanonical.size > 0) {
        ordered = rows.filter((row) =>
          rowPassesQualifyingPAWithMinMap(row, fromCanonical, fallback)
        )
      } else {
        const dynamicMinPAByTeam = computeDynamicMinPAByTeam(rows, year)
        if (dynamicMinPAByTeam.size > 0) {
          ordered = rows.filter((row) =>
            rowPassesQualifyingPA(row, year, league, dynamicMinPAByTeam)
          )
        }
      }
    }
  }
  const maxDisplayRank = options.weekKey ? BATTING_WEEKLY_TAB_TOP_N : 3
  return ordered
    .slice(0, topN)
    .map((row, i) => toLeaderRow(row, i + 1, metricLabel, "batting", maxDisplayRank))
}

function extractPitchingTop(
  rows: RankingJsonRow[],
  metricLabel: string,
  topN: number,
  year: string,
  league: string,
  options: LeadersExtractOptions
): LeaderRow[] {
  let ordered = rows
  if (!options.skipQualifyingFilters) {
    const metricKey = getPitchingJsonKey(metricLabel)
    if (shouldRequireQualifyingPitching(metricKey)) {
      const fromCanonical = resolvePitchingThresholdsForRanking(
        process.cwd(),
        year,
        league,
        options.weekKey
      )
      const thresholds =
        fromCanonical ??
        computePitchingQualifyingMinIpByTeam(
          rows as Parameters<typeof rowMeetsPitchingQualifyingIp>[0][]
        )
      ordered = rows.filter((row) =>
        rowMeetsPitchingQualifyingIp(
          row as Parameters<typeof rowMeetsPitchingQualifyingIp>[0],
          thresholds
        )
      )
    }
  }
  return ordered.slice(0, topN).map((row, i) => toLeaderRow(row, i + 1, metricLabel, "pitching"))
}

function battingTopN(metricLabel: string, year: string, weekKey?: string): number {
  if (weekKey) return BATTING_WEEKLY_TAB_TOP_N
  if (metricLabel === "打点" && (year === "2025" || year === "2026")) {
    return BATTING_TOP_2025_RBI_TOP_N
  }
  if ((BATTING_TOP3_METRICS as readonly string[]).includes(metricLabel)) return 3
  return 1
}

function pitchingTopN(metricLabel: string): number {
  if ((PITCHING_TOP_2026_GRID_METRICS as readonly string[]).includes(metricLabel)) return 3
  return 1
}

export function hasBattingRankingsAtLeagueDir(leagueDir: string): boolean {
  return fs.existsSync(metricJsonPath(leagueDir, "OPS", "batting"))
}

export function hasPitchingRankingsAtLeagueDir(leagueDir: string): boolean {
  return fs.existsSync(metricJsonPath(leagueDir, "防御率", "pitching"))
}

export function buildBattingLeadersConfigAtLeagueDir(
  leagueDir: string,
  year: string,
  league: string,
  options: LeadersExtractOptions = {}
): LeadersConfig | null {
  if (!hasBattingRankingsAtLeagueDir(leagueDir)) return null
  const upperLeague = league.toUpperCase()
  const leaders: Record<string, LeaderRow[]> = {}

  const battingMetrics = options.weekKey ? BATTING_TOP_2025_GRID_METRICS : BATTING_ALL_METRICS

  for (const metricLabel of battingMetrics) {
    const rows = readMetricJson(leagueDir, metricLabel, "batting")
    if (!rows?.length) continue
    const topN = battingTopN(metricLabel, year, options.weekKey)
    const top = extractBattingTop(rows, metricLabel, topN, year, upperLeague, options)
    if (top.length > 0) leaders[metricLabel] = top
  }

  if (Object.keys(leaders).length === 0) return null

  return options.weekKey
    ? {
        top3Metrics: [...BATTING_TOP_2025_GRID_METRICS],
        miniMetrics: [],
        leaders,
      }
    : {
        top3Metrics: [...BATTING_TOP3_METRICS],
        miniMetrics: [...BATTING_MINI_METRICS],
        leaders,
      }
}

export function buildPitchingLeadersConfigAtLeagueDir(
  leagueDir: string,
  year: string,
  league: string,
  options: LeadersExtractOptions = {}
): LeadersConfig | null {
  if (!hasPitchingRankingsAtLeagueDir(leagueDir)) return null
  const upperLeague = league.toUpperCase()
  const leaders: Record<string, LeaderRow[]> = {}
  const allMetrics = [...PITCHING_TOP_2026_GRID_METRICS, ...PITCHING_TOP_2026_MINI_METRICS]

  for (const metricLabel of allMetrics) {
    const rows = readMetricJson(leagueDir, metricLabel, "pitching")
    if (!rows?.length) continue
    const topN = pitchingTopN(metricLabel)
    const top = extractPitchingTop(rows, metricLabel, topN, year, upperLeague, options)
    if (top.length > 0) leaders[metricLabel] = top
  }

  if (Object.keys(leaders).length === 0) return null

  return {
    top3Metrics: [...PITCHING_TOP_2026_GRID_METRICS],
    miniMetrics: [...PITCHING_TOP_2026_MINI_METRICS],
    leaders,
  }
}

/** 週間打撃ランキングのリーグディレクトリ */
export function weeklyBattingRankingsLeagueDir(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string
): string {
  return path.join(
    projectRoot,
    "public",
    "data",
    "rankings",
    "weekly",
    year,
    weekKey,
    league.toUpperCase()
  )
}

/** 週間投球ランキングのリーグディレクトリ */
export function weeklyPitchingRankingsLeagueDir(
  projectRoot: string,
  year: string,
  weekKey: string,
  league: string
): string {
  return path.join(
    projectRoot,
    "public",
    "data",
    "rankings",
    "pitching",
    "weekly",
    year,
    weekKey,
    league.toUpperCase()
  )
}
