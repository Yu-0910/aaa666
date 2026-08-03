import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { rosterTeamToRankingShort } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import type { StandingsLeague, TeamStandingRow } from "@/lib/standings/types"

export type BaseballDataTeamPitchingRow = {
  teamName: string
  era: number
  era_starter: number
  era_relief: number
  w: number
  l: number
  sv: number
  so: number
  g: number
  ip: string
  k_pct_pitch: number
  pitches: number
  bf: number
  h_allowed: number
  hr_allowed: number
  bb_allowed: number
  hbp_allowed: number
  ibb_allowed: number
  runs_allowed: number
  er: number
  cg: number
  sho: number
  no_walks: number
  avg_allowed: number
  qs_rate: number
  support_runs: number
  support_rate: number
  whip: number
  hr_wpo_bf: number
  hr_wpo_h: number
  hr_wpo_avg: number
  hr_wpo_hr: number
  hp: number
}

export type BaseballDataTeamPitchingSnapshot = {
  source: "baseballdata.jp"
  year: string
  league: StandingsLeague
  fetchedAt: string
  rows: BaseballDataTeamPitchingRow[]
}

const TEAM_PITCHING_COLUMNS: readonly (keyof Omit<BaseballDataTeamPitchingRow, "teamName">)[] = [
  "era",
  "era_starter",
  "era_relief",
  "w",
  "l",
  "sv",
  "so",
  "g",
  "ip",
  "k_pct_pitch",
  "pitches",
  "bf",
  "h_allowed",
  "hr_allowed",
  "bb_allowed",
  "hbp_allowed",
  "ibb_allowed",
  "runs_allowed",
  "er",
  "cg",
  "sho",
  "no_walks",
  "avg_allowed",
  "qs_rate",
  "support_runs",
  "support_rate",
  "whip",
  "hr_wpo_bf",
  "hr_wpo_h",
  "hr_wpo_avg",
  "hr_wpo_hr",
  "hp",
]

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim()
}

function parseNumericCell(raw: string): number {
  const s = raw.replace(/,/g, "").replace(/%$/, "").trim()
  const normalized = s.startsWith(".") ? `0${s}` : s
  const n = Number(normalized)
  if (!Number.isFinite(n)) {
    throw new Error(`baseballdata team pitching numeric parse failed: ${raw}`)
  }
  return n
}

function parseCell(key: keyof Omit<BaseballDataTeamPitchingRow, "teamName">, raw: string): number | string {
  if (key === "ip") return raw.trim()
  return parseNumericCell(raw)
}

export function parseBaseballDataTeamPitchingRows(html: string): BaseballDataTeamPitchingRow[] {
  const tableMatch = html.match(/<table[^>]*class="[^"]*\bpitching-table\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    throw new Error("baseballdata pitching table not found")
  }

  const tbody = tableMatch[1] ?? ""
  const rows: BaseballDataTeamPitchingRow[] = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(tbody))) {
    const rowHtml = rowMatch[1] ?? ""
    if (!/<td[\s>]/i.test(rowHtml)) continue

    const thMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i)
    if (!thMatch) continue
    const teamName = stripTags(thMatch[1] ?? "")
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1] ?? ""))
    if (cells.length !== TEAM_PITCHING_COLUMNS.length) {
      throw new Error(`baseballdata pitching cells mismatch: ${teamName} cells=${cells.length}`)
    }

    const out: Partial<BaseballDataTeamPitchingRow> = { teamName }
    for (let i = 0; i < TEAM_PITCHING_COLUMNS.length; i++) {
      const key = TEAM_PITCHING_COLUMNS[i]!
      ;(out as Record<string, number | string>)[key] = parseCell(key, cells[i]!)
    }
    rows.push(out as BaseballDataTeamPitchingRow)
  }

  if (rows.length === 0) {
    throw new Error("baseballdata pitching table has no team rows")
  }
  return rows
}

export function loadBaseballDataTeamPitchingSnapshot(
  projectRoot: string,
  year: string,
  league: StandingsLeague,
): BaseballDataTeamPitchingSnapshot | null {
  const path = join(projectRoot, "_data", "baseballdata_team_pitching", year, `${league}.json`)
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, "utf8")) as BaseballDataTeamPitchingSnapshot
  if (parsed.year !== year || parsed.league !== league) {
    throw new Error(`baseballdata team pitching snapshot key mismatch: ${path}`)
  }
  return parsed
}

export function applyBaseballDataTeamPitchingRows(
  rows: TeamStandingRow[],
  snapshotRows: readonly BaseballDataTeamPitchingRow[],
): TeamStandingRow[] {
  const byShort = new Map<string, BaseballDataTeamPitchingRow>()
  for (const sourceRow of snapshotRows) {
    const short = rosterTeamToRankingShort(sourceRow.teamName)
    if (!short) continue
    byShort.set(short, sourceRow)
  }

  return rows.map((row) => {
    const sourceRow = byShort.get(row.teamName)
    if (!sourceRow) return row
    return {
      ...row,
      era: sourceRow.era,
      era_starter: sourceRow.era_starter,
      era_relief: sourceRow.era_relief,
      w: sourceRow.w,
      l: sourceRow.l,
      sv: sourceRow.sv,
      so: sourceRow.so,
      g: sourceRow.g,
      ip: sourceRow.ip,
      k_pct_pitch: sourceRow.k_pct_pitch,
      pitches: sourceRow.pitches,
      bf: sourceRow.bf,
      h_allowed: sourceRow.h_allowed,
      hr_allowed: sourceRow.hr_allowed,
      bb_allowed: sourceRow.bb_allowed,
      hbp_allowed: sourceRow.hbp_allowed,
      ibb_allowed: sourceRow.ibb_allowed,
      runs_allowed: sourceRow.runs_allowed,
      er: sourceRow.er,
      cg: sourceRow.cg,
      sho: sourceRow.sho,
      no_walks: sourceRow.no_walks,
      avg_allowed: sourceRow.avg_allowed,
      qs_rate: sourceRow.qs_rate,
      support_runs: sourceRow.support_runs,
      support_rate: sourceRow.support_rate,
      whip: sourceRow.whip,
      hr_wpo_bf: sourceRow.hr_wpo_bf,
      hr_wpo_h: sourceRow.hr_wpo_h,
      hr_wpo_avg: sourceRow.hr_wpo_avg,
      hr_wpo_hr: sourceRow.hr_wpo_hr,
      hp: sourceRow.hp,
      hld: sourceRow.hp,
    }
  })
}
