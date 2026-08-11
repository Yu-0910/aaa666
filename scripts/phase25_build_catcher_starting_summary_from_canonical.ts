/**
 * Phase 25: canonical から「試合内 BF 最大の実守備捕手」として帰属した試合を集計し、捕手別の基本サマリを生成する。
 *
 * 要件:
 * - 先発: 試合内 BF 最大の実守備捕手として帰属した回数（phase6 と同じ主捕手定義）
 * - 勝利/敗戦/勝率: 主捕手として帰属した試合のチーム勝敗
 * - QS率/HQS率/SQS率: 母数は主捕手回数（その試合の先発投手が条件を満たしたかでカウント）
 *
 * 出力:
 *   _data/derived/player_catcher_starting_summary/{year}/npb_{npbCatcherId}.json
 *
 * 入力は Phase11 と同一の `loadCanonicalGamesMergedForDerivedPipeline`。
 * scoreboard が空の試合は順位表と同様に出場成績 HTML の「計」列で得点を補完する。
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CanonicalGameDocument, PitchingLine } from "@/lib/yahooGame/types"
import { primaryCatcherYahooIdByFieldingTeam } from "@/lib/yahooGame/activeCatcherFromCanonical"
import { catcherYahooIdsFromCanonical } from "@/lib/catcherAppearances"
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { teamsRoughlyMatch } from "@/lib/yahooGame/startingCatcherFromCanonical"
import { rosterTeamToRankingShort } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import { teamCodeFromShort, teamRankingShortFromGameTeamName } from "@/lib/standings/teamCodes"
import type {
  CatcherStartingSummaryDerived,
  CatcherStartingSummaryTeamTotals,
} from "@/lib/catcherStartingSummary"
import {
  getGameScoreSides,
  type ScoreboardSide,
} from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { writeJsonFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"

function parseArgs(argv: string[]): {
  year: string
  from: string | null
  to: string | null
  onlyNpbIds: string[] | null
} {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const onlyIdx = argv.indexOf("--only-npb-ids")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : null
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : null
  const onlyNpbIds =
    onlyIdx >= 0
      ? String(argv[onlyIdx + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null
  return { year: year || "2026", from, to, onlyNpbIds }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const t = String(ip).trim()
  if (!t) return 0
  if (t.includes(".")) {
    const [w, frac] = t.split(".")
    const whole = parseInt(w, 10) || 0
    const f = parseInt(frac ?? "0", 10) || 0
    return whole * 3 + Math.min(2, f)
  }
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n * 3 : 0
}

function qsFlagsFromStarter(line: PitchingLine | null): { qs: boolean; hqs: boolean; sqs: boolean } {
  if (!line) return { qs: false, hqs: false, sqs: false }
  const outs = ipToOuts(line.ip)
  const er = line.er ?? 999
  const qs = outs >= 18 && er <= 3
  const hqs = outs >= 21 && er <= 2
  const sqs = outs >= 24 && er <= 1
  return { qs, hqs, sqs }
}

function starterPitcherLineForTeam(
  doc: CanonicalGameDocument,
  teamName: string,
  starterYahooIdByTeamShort: Map<string, string>,
): PitchingLine | null {
  const teamShort = teamRankingShortFromGameTeamName(teamName) || rosterTeamToRankingShort(teamName)
  const starterYahooId = starterYahooIdByTeamShort.get(teamShort)
  if (!starterYahooId) return null
  return (
    (doc.domain?.pitchingLines ?? []).find(
      (pl) => (pl.yahooPlayerId ?? "").trim() === starterYahooId,
    ) ?? null
  )
}

function findTeamScoreSide(teamName: string, sides: ScoreboardSide[]): ScoreboardSide | null {
  const short = rosterTeamToRankingShort(teamName)
  for (const side of sides) {
    if (side.teamShort === short) return side
    if (teamsRoughlyMatch(side.teamShort, teamName)) return side
    if (teamsRoughlyMatch(side.teamShort, short)) return side
  }
  return null
}

type StartingSummaryAccumulator = {
  starts: number
  wins: number
  losses: number
  draws: number
  qs: number
  hqs: number
  sqs: number
}

type CatcherStartingSummaryAccumulator = StartingSummaryAccumulator & {
  teams: Map<string, StartingSummaryAccumulator>
}

function createAccumulator(): StartingSummaryAccumulator {
  return { starts: 0, wins: 0, losses: 0, draws: 0, qs: 0, hqs: 0, sqs: 0 }
}

function totalsFromAccumulator(a: StartingSummaryAccumulator): CatcherStartingSummaryTeamTotals {
  const starts = a.starts
  const games = a.wins + a.losses
  return {
    starts,
    teamWins: a.wins,
    teamLosses: a.losses,
    teamDraws: a.draws,
    teamWinPct: games > 0 ? a.wins / games : null,
    qsCount: a.qs,
    hqsCount: a.hqs,
    sqsCount: a.sqs,
    qsPct: starts > 0 ? (a.qs / starts) * 100 : null,
    hqsPct: starts > 0 ? (a.hqs / starts) * 100 : null,
    sqsPct: starts > 0 ? (a.sqs / starts) * 100 : null,
  }
}

function main() {
  const root = getProjectRoot()
  const { year, from, to, onlyNpbIds } = parseArgs(process.argv.slice(2))
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase25] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root, { year })
  if (!docs.length) {
    console.error("[phase25] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const byCatcher = new Map<
    string,
    CatcherStartingSummaryAccumulator
  >()
  let targetNpbIds = onlyNpbIds ? new Set(onlyNpbIds) : null
  if (!targetNpbIds && (from || to)) {
    targetNpbIds = new Set<string>()
    for (const doc of docs) {
      const ymd = extractCanonicalGameYmd(doc)
      if (!ymd || !ymd.startsWith(`${year}-`)) continue
      if (from && ymd < from) continue
      if (to && ymd > to) continue
      for (const yahooId of catcherYahooIdsFromCanonical(doc)) {
        const npbId = resolveNpbPlayerIdFromPublicId(String(yahooId).trim())
        if (npbId) targetNpbIds.add(npbId)
      }
    }
    if (targetNpbIds.size === 0) {
      console.log(`[phase25] no affected catchers for range=${from ?? "(start)"}..${to ?? "(end)"}`)
      return
    }
  }

  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    const sides = getGameScoreSides(doc, {
      sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId),
    })
    if (!sides || sides.length < 2) continue

    const primaryByTeam = primaryCatcherYahooIdByFieldingTeam(doc)
    const starterYahooIdByTeamShort = collectStarterYahooIdByRankingShort(doc)
    for (const t of doc.game.teams ?? []) {
      const teamName = (t.teamName ?? "").trim()
      if (!teamName) continue
      const primaryYid =
        primaryByTeam.get(teamName) ??
        [...primaryByTeam.entries()].find(([tn]) => teamsRoughlyMatch(tn, teamName))?.[1] ??
        null
      if (!primaryYid) continue
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(primaryYid)
      if (!catcherNpbId) continue
      if (targetNpbIds && !targetNpbIds.has(catcherNpbId)) continue

      const teamShort = teamRankingShortFromGameTeamName(teamName) || rosterTeamToRankingShort(teamName)
      const teamCode = teamCodeFromShort(teamShort)
      let agg = byCatcher.get(catcherNpbId)
      if (!agg) {
        agg = { ...createAccumulator(), teams: new Map() }
        byCatcher.set(catcherNpbId, agg)
      }
      let teamAgg = teamCode ? agg.teams.get(teamCode) : null
      if (teamCode && !teamAgg) {
        teamAgg = createAccumulator()
        agg.teams.set(teamCode, teamAgg)
      }
      agg.starts += 1
      if (teamAgg) teamAgg.starts += 1

      const teamSide = findTeamScoreSide(teamName, sides)
      if (teamSide) {
        const other = sides.find((s) => s !== teamSide)
        if (other) {
          if (teamSide.runs > other.runs) {
            agg.wins += 1
            if (teamAgg) teamAgg.wins += 1
          } else if (teamSide.runs < other.runs) {
            agg.losses += 1
            if (teamAgg) teamAgg.losses += 1
          } else {
            agg.draws += 1
            if (teamAgg) teamAgg.draws += 1
          }
        }
      }

      const starter = starterPitcherLineForTeam(doc, teamName, starterYahooIdByTeamShort)
      const flags = qsFlagsFromStarter(starter)
      if (flags.qs) {
        agg.qs += 1
        if (teamAgg) teamAgg.qs += 1
      }
      if (flags.hqs) {
        agg.hqs += 1
        if (teamAgg) teamAgg.hqs += 1
      }
      if (flags.sqs) {
        agg.sqs += 1
        if (teamAgg) teamAgg.sqs += 1
      }
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_starting_summary", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [npbCatcherId, a] of byCatcher) {
    const totals = totalsFromAccumulator(a)
    const teams = Object.fromEntries(
      [...a.teams.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([teamCode, teamTotals]) => [teamCode, totalsFromAccumulator(teamTotals)]),
    )

    const payload: CatcherStartingSummaryDerived = {
      schemaVersion: "player-catcher-starting-summary-v1",
      seasonYear: year,
      npbCatcherId,
      ...totals,
      teams,
    }
    writeJsonFileWithRetrySync(path.join(outDir, `npb_${npbCatcherId}.json`), payload)
    wrote += 1
  }

  console.log(
    `[phase25] wrote ${wrote} files → ${outDir}${from || to ? ` (affected range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )
}

main()
