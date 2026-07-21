/**
 * Team standings batting input audit.
 *
 * This does not compare against completed external tables. It validates the
 * game-level SportsNavi inputs we aggregate from:
 * - scoreboard totals (R/H/E) parsed from raw_sportsnavi_stats
 * - player battingLines totals parsed from the same game's appearance table
 *
 * Usage:
 *   npx tsx scripts/audit_team_standings_batting_inputs.ts --year 2026 --league CL
 *   npx tsx scripts/audit_team_standings_batting_inputs.ts --year 2026 --league CL --json
 */

import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import {
  batterTeamShortInGame,
  shouldIncludeStandingsGame,
} from "@/lib/standings/leagueGameFilter"
import {
  teamCodeFromShort,
  teamDisplayNameFromShort,
} from "@/lib/standings/teamCodes"
import {
  leagueBucketForTeamShort,
  rosterTeamToRankingShort,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { BattingLine, CanonicalGameDocument, ScoreboardTeamLine } from "@/lib/yahooGame/types"
import type { StandingsLeague } from "@/lib/standings/types"

type Args = {
  year: string
  league: StandingsLeague
  json: boolean
  includeExtraBaseWarnings: boolean
}

type TeamLineTotals = {
  players: number
  duplicatePlayerIds: string[]
  ab: number
  r: number
  h: number
  h2: number
  h3: number
  hr: number
  rbi: number
  so: number
  bb: number
  hbp: number
  sh: number
  sb: number
  e: number
  missingExtraBaseBreakdownRows: number
  componentOverflowRows: string[]
}

type ScoreboardTotals = {
  runs: number | null
  hits: number | null
  errors: number | null
}

type AuditIssue = {
  gameId: string
  date: string
  teamShort: string
  teamCode: string
  teamName: string
  kind:
    | "scoreboard_runs_mismatch"
    | "scoreboard_hits_mismatch"
    | "scoreboard_errors_mismatch"
    | "duplicate_batting_line"
    | "missing_extra_base_breakdown"
    | "hit_component_overflow"
  expected?: number | null
  actual?: number | null
  detail?: string
}

type GameAudit = {
  gameId: string
  date: string
  title: string
  issues: AuditIssue[]
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const value = (name: string, fallback = ""): string => {
    const eq = args.find((a) => a.startsWith(`${name}=`))
    if (eq) return eq.split("=").slice(1).join("=").trim()
    const i = args.indexOf(name)
    if (i >= 0) return String(args[i + 1] ?? "").trim()
    return fallback
  }
  const league = value("--league", "CL").toUpperCase()
  if (league !== "CL" && league !== "PL") {
    throw new Error(`--league must be CL or PL: ${league}`)
  }
  return {
    year: value("--year", "2026"),
    league,
    json: args.includes("--json"),
    includeExtraBaseWarnings: args.includes("--include-extra-base-warnings"),
  }
}

function intOrNull(raw: string | undefined): number | null {
  const s = String(raw ?? "").trim()
  if (!s || s === "—" || s === "-") return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function scoreboardByTeamShort(board: ScoreboardTeamLine[] | null): Map<string, ScoreboardTotals> {
  const out = new Map<string, ScoreboardTotals>()
  for (const row of board ?? []) {
    const short = rosterTeamToRankingShort(String(row.teamName ?? "").trim())
    if (!short) continue
    out.set(short, {
      runs: intOrNull(row.runs),
      hits: intOrNull(row.hits),
      errors: intOrNull(row.errors),
    })
  }
  return out
}

function emptyTotals(): TeamLineTotals {
  return {
    players: 0,
    duplicatePlayerIds: [],
    ab: 0,
    r: 0,
    h: 0,
    h2: 0,
    h3: 0,
    hr: 0,
    rbi: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    sh: 0,
    sb: 0,
    e: 0,
    missingExtraBaseBreakdownRows: 0,
    componentOverflowRows: [],
  }
}

function addLine(totals: TeamLineTotals, line: BattingLine): void {
  totals.players += 1
  totals.ab += line.ab ?? 0
  totals.r += line.r ?? 0
  totals.h += line.h ?? 0
  totals.h2 += line.h2 ?? 0
  totals.h3 += line.h3 ?? 0
  totals.hr += line.hr ?? 0
  totals.rbi += line.rbi ?? 0
  totals.so += line.so ?? 0
  totals.bb += line.bb ?? 0
  totals.hbp += line.hbp ?? 0
  totals.sh += line.sh ?? 0
  totals.sb += line.sb ?? 0
  totals.e += line.e ?? 0

  if ((line.h ?? 0) > (line.hr ?? 0) && line.h2 == null && line.h3 == null) {
    totals.missingExtraBaseBreakdownRows += 1
  }

  const h = line.h ?? 0
  const h2 = line.h2 ?? 0
  const h3 = line.h3 ?? 0
  const hr = line.hr ?? 0
  if (h2 + h3 + hr > h) {
    totals.componentOverflowRows.push(`${line.playerName}(${line.yahooPlayerId}) H=${h} 2B=${h2} 3B=${h3} HR=${hr}`)
  }
}

function teamShortHintFromBattingLine(line: BattingLine): string {
  return rosterTeamToRankingShort(String(line.teamName ?? "").trim())
}

function battingLineTotalsByTeam(doc: CanonicalGameDocument): Map<string, TeamLineTotals> {
  const out = new Map<string, TeamLineTotals>()
  const playerCountByTeam = new Map<string, Map<string, number>>()

  for (const line of doc.domain?.battingLines ?? []) {
    const bid = String(line.yahooPlayerId ?? "").trim()
    if (!bid) continue
    const teamShort = teamShortHintFromBattingLine(line) || batterTeamShortInGame(doc, bid)
    if (!teamShort) continue

    const totals = out.get(teamShort) ?? emptyTotals()
    addLine(totals, line)
    out.set(teamShort, totals)

    const counts = playerCountByTeam.get(teamShort) ?? new Map<string, number>()
    counts.set(bid, (counts.get(bid) ?? 0) + 1)
    playerCountByTeam.set(teamShort, counts)
  }

  for (const [teamShort, counts] of playerCountByTeam) {
    const totals = out.get(teamShort)
    if (!totals) continue
    totals.duplicatePlayerIds = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id, count]) => `${id}x${count}`)
  }

  return out
}

function auditTeam(
  doc: CanonicalGameDocument,
  league: StandingsLeague,
  teamShort: string,
  lineTotals: TeamLineTotals,
  boardTotals: ScoreboardTotals | undefined,
): AuditIssue[] {
  const gameId = String(doc.gameId ?? "").trim()
  const date = parseGameDateYmdFromCanonical(doc) ?? ""
  const teamCode = teamCodeFromShort(teamShort)
  const teamName = teamDisplayNameFromShort(teamShort)
  const base = { gameId, date, teamShort, teamCode, teamName }
  const issues: AuditIssue[] = []

  if (leagueBucketForTeamShort(teamShort) !== league) return issues

  if (boardTotals?.runs != null && boardTotals.runs !== lineTotals.r) {
    issues.push({
      ...base,
      kind: "scoreboard_runs_mismatch",
      expected: boardTotals.runs,
      actual: lineTotals.r,
    })
  }
  if (boardTotals?.hits != null && boardTotals.hits !== lineTotals.h) {
    issues.push({
      ...base,
      kind: "scoreboard_hits_mismatch",
      expected: boardTotals.hits,
      actual: lineTotals.h,
    })
  }
  if (boardTotals?.errors != null && boardTotals.errors !== lineTotals.e) {
    issues.push({
      ...base,
      kind: "scoreboard_errors_mismatch",
      expected: boardTotals.errors,
      actual: lineTotals.e,
    })
  }
  if (lineTotals.duplicatePlayerIds.length > 0) {
    issues.push({
      ...base,
      kind: "duplicate_batting_line",
      detail: lineTotals.duplicatePlayerIds.join(", "),
    })
  }
  if (lineTotals.missingExtraBaseBreakdownRows > 0) {
    issues.push({
      ...base,
      kind: "missing_extra_base_breakdown",
      actual: lineTotals.missingExtraBaseBreakdownRows,
    })
  }
  if (lineTotals.componentOverflowRows.length > 0) {
    issues.push({
      ...base,
      kind: "hit_component_overflow",
      detail: lineTotals.componentOverflowRows.join("; "),
    })
  }
  return issues
}

function main(): void {
  const args = parseArgs()
  const root = process.cwd()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)

  const gameAudits: GameAudit[] = []
  const issueCounts = new Map<string, number>()
  let includedGames = 0

  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    const scoreOptions = {
      sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, gameId),
    }
    if (!shouldIncludeStandingsGame(doc, args.year, args.league, scoreOptions)) continue
    includedGames += 1

    const board = scoreboardByTeamShort(scoreOptions.sportsnaviStatsScoreboard)
    const byTeam = battingLineTotalsByTeam(doc)
    const issues: AuditIssue[] = []

    for (const [teamShort, lineTotals] of byTeam) {
      const teamIssues = auditTeam(doc, args.league, teamShort, lineTotals, board.get(teamShort))
      issues.push(
        ...teamIssues.filter(
          (issue) => args.includeExtraBaseWarnings || issue.kind !== "missing_extra_base_breakdown",
        ),
      )
    }

    for (const issue of issues) {
      issueCounts.set(issue.kind, (issueCounts.get(issue.kind) ?? 0) + 1)
    }

    if (issues.length > 0) {
      gameAudits.push({
        gameId,
        date: parseGameDateYmdFromCanonical(doc) ?? "",
        title: String(doc.game?.meta?.documentTitle ?? ""),
        issues,
      })
    }
  }

  const payload = {
    year: args.year,
    league: args.league,
    includedGames,
    issueCounts: Object.fromEntries([...issueCounts.entries()].sort()),
    issueGames: gameAudits.length,
    games: gameAudits,
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(`[audit-team-standings-batting] year=${args.year} league=${args.league}`)
  console.log(`includedGames=${includedGames} issueGames=${gameAudits.length}`)
  for (const [kind, count] of [...issueCounts.entries()].sort()) {
    console.log(`  ${kind}: ${count}`)
  }

  for (const game of gameAudits.slice(0, 40)) {
    console.log(`\n${game.date} ${game.gameId} ${game.title}`)
    for (const issue of game.issues) {
      const expected = issue.expected == null ? "" : ` expected=${issue.expected}`
      const actual = issue.actual == null ? "" : ` actual=${issue.actual}`
      const detail = issue.detail ? ` ${issue.detail}` : ""
      console.log(`  ${issue.teamName} ${issue.kind}${expected}${actual}${detail}`)
    }
  }
  if (gameAudits.length > 40) {
    console.log(`\n... ${gameAudits.length - 40} more issue games. Re-run with --json for full details.`)
  }
}

main()
