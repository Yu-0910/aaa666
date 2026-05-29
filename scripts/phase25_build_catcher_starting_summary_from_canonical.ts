/**
 * Phase 25: canonical から「スタメン捕手として出た試合」を集計し、捕手別の基本サマリを生成する。
 *
 * 要件:
 * - 先発: スタメン捕手の回数
 * - 勝利/敗戦/勝率: スタメン捕手として出た試合のチーム勝敗
 * - QS率/HQS率/SQS率: 母数はスタメン捕手回数（その試合の先発投手が条件を満たしたかでカウント）
 *
 * 出力:
 *   _data/derived/player_catcher_starting_summary/{year}/npb_{npbCatcherId}.json
 *
 * 入力は各試合 JSON を `mergePhase10RestoredIntoDocIfPresent` 後に読む（Phase11 と同一前提）。
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CanonicalGameDocument, PitchingLine } from "@/lib/yahooGame/types"
import { getStartingCatcherForTeam } from "@/lib/yahooGame/startingCatcherFromCanonical"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import { resolveNpbPlayerIdFromPublicId } from "@/lib/yahooNpbBatterIdMap"
import type { CatcherStartingSummaryDerived } from "@/lib/catcherStartingSummary"

function parseArgs(argv: string[]): { year: string } {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : ""
  return { year: year || "2026" }
}

function readCanonicalFile(p: string): CanonicalGameDocument | null {
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CanonicalGameDocument
    if (j?.schemaVersion !== "yahoo-game-canonical-v1" || !j.gameId) return null
    return mergePhase10RestoredIntoDocIfPresent(j)
  } catch {
    return null
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function parseRuns(s: string | undefined): number | null {
  const t = String(s ?? "").trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
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

function starterPitcherLineForTeam(doc: CanonicalGameDocument, teamName: string): PitchingLine | null {
  // pitchingLines はチーム情報を直接持たないため、推定関数でチームを割り当てる
  const lines = doc.domain?.pitchingLines ?? []
  const forTeam = lines.filter((pl) => inferPitcherTeamForNf3Line(doc, (pl.yahooPlayerId ?? "").trim()) === teamName)
  // 先発はそのチームの投球行の先頭（従来の前提と揃える）
  return forTeam.length > 0 ? forTeam[0]! : null
}

function main() {
  const root = getProjectRoot()
  const { year } = parseArgs(process.argv.slice(2))
  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(canonicalDir)) {
    console.error("[phase25] missing canonical dir:", canonicalDir)
    process.exit(1)
  }
  const files = fs.readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))
  if (!files.length) {
    console.error("[phase25] no canonical files under:", canonicalDir)
    process.exit(1)
  }

  const byCatcher = new Map<
    string,
    { starts: number; wins: number; losses: number; qs: number; hqs: number; sqs: number }
  >()

  for (const f of files) {
    const p = path.join(canonicalDir, f)
    const doc = readCanonicalFile(p)
    if (!doc) continue

    const board = doc.game.scoreboard ?? []
    if (board.length < 2) continue
    const visitor = (board[0]?.teamName ?? "").trim()
    const home = (board[1]?.teamName ?? "").trim()
    const vRuns = parseRuns(board[0]?.runs)
    const hRuns = parseRuns(board[1]?.runs)
    if (!visitor || !home || vRuns == null || hRuns == null) continue

    const winner = vRuns > hRuns ? visitor : hRuns > vRuns ? home : null
    const loser = vRuns > hRuns ? home : hRuns > vRuns ? visitor : null

    for (const t of doc.game.teams ?? []) {
      const teamName = (t.teamName ?? "").trim()
      if (!teamName) continue
      const cat = getStartingCatcherForTeam(doc, teamName)
      if (!cat?.yahooPlayerId) continue
      const catcherNpbId = resolveNpbPlayerIdFromPublicId(cat.yahooPlayerId)
      if (!catcherNpbId) continue

      let agg = byCatcher.get(catcherNpbId)
      if (!agg) {
        agg = { starts: 0, wins: 0, losses: 0, qs: 0, hqs: 0, sqs: 0 }
        byCatcher.set(catcherNpbId, agg)
      }
      agg.starts += 1

      if (winner && teamName === winner) agg.wins += 1
      if (loser && teamName === loser) agg.losses += 1

      const starter = starterPitcherLineForTeam(doc, teamName)
      const flags = qsFlagsFromStarter(starter)
      if (flags.qs) agg.qs += 1
      if (flags.hqs) agg.hqs += 1
      if (flags.sqs) agg.sqs += 1
    }
  }

  const outDir = path.join(root, "_data", "derived", "player_catcher_starting_summary", year)
  ensureDir(outDir)

  let wrote = 0
  for (const [npbCatcherId, a] of byCatcher) {
    const starts = a.starts
    const games = a.wins + a.losses
    const teamWinPct = games > 0 ? a.wins / games : null
    const qsPct = starts > 0 ? (a.qs / starts) * 100 : null
    const hqsPct = starts > 0 ? (a.hqs / starts) * 100 : null
    const sqsPct = starts > 0 ? (a.sqs / starts) * 100 : null

    const payload: CatcherStartingSummaryDerived = {
      schemaVersion: "player-catcher-starting-summary-v1",
      seasonYear: year,
      npbCatcherId,
      starts,
      teamWins: a.wins,
      teamLosses: a.losses,
      teamWinPct,
      qsCount: a.qs,
      hqsCount: a.hqs,
      sqsCount: a.sqs,
      qsPct,
      hqsPct,
      sqsPct,
    }
    fs.writeFileSync(path.join(outDir, `npb_${npbCatcherId}.json`), JSON.stringify(payload, null, 2), "utf8")
    wrote += 1
  }

  console.log(`[phase25] wrote ${wrote} files → ${outDir}`)
}

main()

