/**
 * トップページ打撃リーダー = ランキングページと同じ JSON から上位 N 件を切り出すだけ。
 * （phase12 が既に指標ごとにソート済み。CSV からの再計算はしない。）
 *
 * 率系指標のみ、ランキングページと同じ規定打席フィルタをかけたうえで先頭から取る。
 */

import fs from "fs"
import path from "path"
import { getJsonKey } from "@/lib/ranking/metricMap"
import { sanitizeMetricForPath } from "@/lib/ranking/url"
import { calculateMinPA, shouldRequireQualifyingPA } from "@/lib/ranking/qualifyingPA"
import { computeDynamicMinPAByTeam, rowPassesQualifyingPA } from "@/lib/ranking/dynamicQualifyingPA"
import {
  resolveMinPAByTeamForRanking,
  rowPassesQualifyingPAWithMinMap,
} from "@/lib/ranking/qualifyingThresholds"
import type { LeaderRow, LeadersConfig } from "@/lib/ranking/leadersTypes"
import { BATTING_TOP_2025_RBI_TOP_N } from "@/lib/topPageBatting2025Grid"

const TOP3_METRICS = ["OPS", "打率", "本塁打"] as const
const MINI_METRICS = ["出塁率", "長打率", "打点", "安打", "盗塁"] as const
const ALL_TOP_METRICS = [...TOP3_METRICS, ...MINI_METRICS] as const

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

function rankingsMetricJsonPath(year: string, league: string, metricLabel: string): string {
  const fileBase = sanitizeMetricForPath(metricLabel)
  return path.join(process.cwd(), "public", "data", "rankings", year, league.toUpperCase(), `${fileBase}.json`)
}

export function hasBattingRankingsJsonForLeague(year: string, league: string): boolean {
  return fs.existsSync(rankingsMetricJsonPath(year, league, "OPS"))
}

function readRankingMetricJson(year: string, league: string, metricLabel: string): RankingJsonRow[] | null {
  const p = rankingsMetricJsonPath(year, league, metricLabel)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown
    return Array.isArray(raw) ? (raw as RankingJsonRow[]) : null
  } catch {
    return null
  }
}

function metricValueFromRow(row: RankingJsonRow, metricLabel: string): string | number {
  const key = getJsonKey(metricLabel)
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

/**
 * ランキング JSON（指標別・降順ソート済み）から、ランキングページ表示と同じ行集合の先頭 topN 件を取る。
 */
function extractTopLeadersFromRankingRows(
  rows: RankingJsonRow[],
  metricLabel: string,
  topN: number,
  year: string,
  league: string
): LeaderRow[] {
  const metricKey = getJsonKey(metricLabel)
  const requiresQualifyingPA = shouldRequireQualifyingPA(metricKey)

  let ordered = rows
  if (requiresQualifyingPA) {
    const fallback = calculateMinPA(year, league)
    const fromCanonical = resolveMinPAByTeamForRanking(process.cwd(), year, league)
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

  return ordered.slice(0, topN).map((row, i) => toLeaderRow(row, i + 1, metricLabel))
}

function topNForMetricLabel(metricLabel: string, year: string): number {
  if (metricLabel === "打点" && (year === "2025" || year === "2026")) {
    return BATTING_TOP_2025_RBI_TOP_N
  }
  if ((TOP3_METRICS as readonly string[]).includes(metricLabel)) return 3
  return 1
}

/**
 * ランキング JSON から LeadersConfig を組み立てる（ファイルが無ければ null）
 */
export function buildBattingLeadersConfigFromRankings(
  year: string,
  league: string
): LeadersConfig | null {
  const upperLeague = league.toUpperCase()
  if (!hasBattingRankingsJsonForLeague(year, upperLeague)) return null

  const leaders: Record<string, LeaderRow[]> = {}
  for (const metricLabel of ALL_TOP_METRICS) {
    const rows = readRankingMetricJson(year, upperLeague, metricLabel)
    if (!rows?.length) continue
    const topN = topNForMetricLabel(metricLabel, year)
    const top = extractTopLeadersFromRankingRows(rows, metricLabel, topN, year, upperLeague)
    if (top.length > 0) leaders[metricLabel] = top
  }

  if (Object.keys(leaders).length === 0) return null

  return {
    top3Metrics: [...TOP3_METRICS],
    miniMetrics: [...MINI_METRICS],
    leaders,
  }
}
