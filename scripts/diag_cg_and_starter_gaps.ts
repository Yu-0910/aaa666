/** 完投・先発判定のギャップ診断 npx tsx scripts/diag_cg_and_starter_gaps.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import { shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import {
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"
const league = "CL" as const

const OFFICIAL_CG: Record<string, number> = {
  巨人: 3,
  阪神: 6,
  ヤクルト: 2,
  DeNA: 1,
  広島: 3,
  中日: 4,
}

function teamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const clJson = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/CL.json"), "utf8"))

for (const row of clJson.rows) {
  const teamKey = teamShortFromCode(row.team)
  const official = OFFICIAL_CG[teamKey]
  if (official == null) continue

  let cgStarter27 = 0
  let cgAny27 = 0
  let cgSolo27 = 0
  const missing: string[] = []

  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const startersByTeam = collectStarterYahooIdByRankingShort(enriched)
    const byId = new Map<string, NonNullable<typeof enriched.domain>["pitchingLines"]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      const arr = byId.get(id) ?? []
      arr.push(pl)
      byId.set(id, arr)
    }

    const teamEntries: { pid: string; outs: number; name: string; isStarter: boolean }[] = []
    for (const [pid, lines] of byId) {
      const merged = mergePitchingLinesInGame(lines)
      if (!merged) continue
      const ts = teamShort(enriched, pid)
      if (ts !== teamKey) continue
      const outs = ipStringToOuts(merged.ip)
      if (outs === 0 && (merged.bf ?? 0) === 0) continue
      teamEntries.push({
        pid,
        outs,
        name: merged.playerName ?? pid,
        isStarter: startersByTeam.get(teamKey) === pid,
      })
    }
    if (teamEntries.length === 0) continue

    const any27 = teamEntries.filter((e) => e.outs >= 27)
    if (any27.length > 0) cgAny27++
    if (teamEntries.length === 1 && teamEntries[0]!.outs >= 27) cgSolo27++

    const st27 = teamEntries.find((e) => e.isStarter && e.outs >= 27)
    if (st27) {
      cgStarter27++
    } else if (any27.length > 0) {
      const g = String(doc.gameId ?? "")
      const detail = any27.map((e) => `${e.name} ${e.outs}outs starter=${e.isStarter}`).join("; ")
      missing.push(`${g}: ${detail}`)
    }
  }

  console.log(`【${teamKey}】公式CG=${official} 現JSON=${row.cg} starter27=${cgStarter27} any27=${cgAny27} solo27=${cgSolo27}`)
  if (missing.length) {
    console.log(`  27アウトだが先発扱いでない試合 (${missing.length}):`)
    for (const m of missing.slice(0, 5)) console.log(`    ${m}`)
    if (missing.length > 5) console.log(`    ...他${missing.length - 5}件`)
  }
  console.log()
}
