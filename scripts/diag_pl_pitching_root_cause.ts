/** PL投手 根本原因診断 npx tsx scripts/diag_pl_pitching_root_cause.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import { collectStarterYahooIdByRankingShort } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { inferPitcherTeamForNf3Line } from "@/lib/yahooGame/pitcherPocHelpers"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"
const league = "PL" as const

const OFFICIAL: Record<
  string,
  { era: number; st: number; rel: number; k9: number; ba: number; qs: number; cg: number; so: number; er: number; h: number; bf: number }
> = {
  西武: { era: 2.44, st: 2.17, rel: 3.22, k9: 7.71, ba: 0.206, qs: 70.31, cg: 6, so: 499, er: 158, h: 437, bf: 2321 },
  ソフトバンク: { era: 3.17, st: 3.78, rel: 2.17, k9: 8.3, ba: 0.24, qs: 46.77, cg: 2, so: 508, er: 194, h: 504, bf: 2315 },
  日本ハム: { era: 3.29, st: 3.22, rel: 3.43, k9: 7.83, ba: 0.233, qs: 53.85, cg: 7, so: 500, er: 210, h: 515, bf: 2398 },
  オリックス: { era: 3.28, st: 3.03, rel: 3.69, k9: 7.98, ba: 0.237, qs: 52.38, cg: 3, so: 487, er: 200, h: 500, bf: 2289 },
  ロッテ: { era: 3.51, st: 4.08, rel: 2.62, k9: 7.13, ba: 0.231, qs: 42.86, cg: 0, so: 445, er: 210, h: 489, bf: 2247 },
  楽天: { era: 3.62, st: 3.26, rel: 4.24, k9: 8.25, ba: 0.244, qs: 51.61, cg: 1, so: 501, er: 215, h: 523, bf: 2328 },
}

function teamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

type Mode = "maxIp" | "current" | "lineFirst"

function splitEra(docs: CanonicalGameDocument[], team: string, mode: Mode) {
  let stIp = 0, stEr = 0, relIp = 0, relEr = 0
  let qs = 0, cg = 0, games = 0
  let so = 0, er = 0, h = 0, bf = 0, ipOuts = 0
  let unknownTeamLines = 0

  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const byId = new Map<string, NonNullable<typeof enriched.domain>["pitchingLines"]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    }

    const entries: { pid: string; outs: number; er: number; so: number; h: number; bf: number; order: number; name: string }[] = []
    let order = 0
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      const ts = teamShort(enriched, pid)
      if (!ts) unknownTeamLines++
      if (ts !== team) continue
      entries.push({ pid, outs, er: m.er ?? 0, so: m.so ?? 0, h: m.h ?? 0, bf: m.bf ?? 0, order: order++, name: m.playerName ?? pid })
    }
    if (entries.length === 0) continue
    games++

    for (const e of entries) {
      so += e.so; er += e.er; h += e.h; bf += e.bf; ipOuts += e.outs
    }

    const startersByTeam = collectStarterYahooIdByRankingShort(enriched)
    let starterPid = ""
    if (mode === "maxIp") {
      const max = Math.max(...entries.map((e) => e.outs))
      starterPid = entries.find((e) => e.outs === max)?.pid ?? ""
    } else if (mode === "current") {
      starterPid = startersByTeam.get(team) ?? ""
    } else {
      starterPid = [...entries].sort((a, b) => a.order - b.order)[0]?.pid ?? ""
    }

    const st = entries.find((e) => e.pid === starterPid)
    if (st && st.outs >= 18 && st.er <= 3) qs++
    if (st && st.outs >= 27) cg++

    for (const e of entries) {
      if (e.pid === starterPid) { stIp += e.outs; stEr += e.er }
      else { relIp += e.outs; relEr += e.er }
    }
  }

  return {
    era: ipOuts > 0 ? (er * 27) / ipOuts : 0,
    st: stIp > 0 ? (stEr * 27) / stIp : 0,
    rel: relIp > 0 ? (relEr * 27) / relIp : 0,
    qs: games > 0 ? (qs / games) * 100 : 0,
    cg, so, er, h, bf, ipOuts, games, unknownTeamLines,
  }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const json = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/PL.json"), "utf8"))

console.log("=== PL投手: 現状 vs 公式 ===\n")
for (const row of json.rows) {
  const t = teamShortFromCode(row.team)
  const o = OFFICIAL[t]
  if (!o) continue
  const d = (a: number | null, b: number, n = 2) =>
    a == null ? "—" : `${a.toFixed(n)} (${a - b >= 0 ? "+" : ""}${(a - b).toFixed(n)})`
  console.log(`【${t}】`)
  console.log(`  防御率   現=${d(row.era, o.era)} 公式=${o.era}`)
  console.log(`  先発ERA  現=${d(row.era_starter, o.st)} 公式=${o.st}`)
  console.log(`  救援ERA  現=${d(row.era_relief, o.rel)} 公式=${o.rel}`)
  console.log(`  K率     現=${d(row.k_pct_pitch, o.k9)} 公式=${o.k9}`)
  console.log(`  被打率   現=${d(row.avg_allowed, o.ba, 3)} 公式=${o.ba.toFixed(3)}`)
  console.log(`  QS率    現=${d(row.qs_rate, o.qs, 1)}% 公式=${o.qs}%`)
  console.log(`  完投    現=${row.cg} 公式=${o.cg}`)
  console.log()
}

console.log("=== 先発/救援按分: maxIp vs current(lineFirst+PA) vs lineFirst ===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  console.log(`【${team}】公式 先発${o.st} 救援${o.rel}`)
  for (const mode of ["maxIp", "current", "lineFirst"] as Mode[]) {
    const s = splitEra(docs, team, mode)
    console.log(
      `  ${mode.padEnd(10)} 先発=${s.st.toFixed(2)}(Δ${(s.st - o.st).toFixed(2)}) 救援=${s.rel.toFixed(2)}(Δ${(s.rel - o.rel).toFixed(2)}) QS=${s.qs.toFixed(1)}% CG=${s.cg}`,
    )
  }
  console.log()
}

console.log("=== 生カウント（current集計 vs 公式）===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const s = splitEra(docs, team, "current")
  console.log(
    `${team}: SO ${s.so}(${s.so - o.so >= 0 ? "+" : ""}${s.so - o.so}) ER ${s.er}(${s.er - o.er >= 0 ? "+" : ""}${s.er - o.er}) H ${s.h}(${s.h - o.h >= 0 ? "+" : ""}${s.h - o.h}) BF ${s.bf}(${s.bf - o.bf >= 0 ? "+" : ""}${s.bf - o.bf}) CG ${s.cg}(${s.cg - o.cg >= 0 ? "+" : ""}${s.cg - o.cg})`,
  )
}

console.log("\n=== maxIp vs current の先発不一致試合（PL）===\n")
for (const team of Object.keys(OFFICIAL)) {
  let games = 0, mismatch = 0
  const examples: string[] = []
  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, league, opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const byId = new Map<string, NonNullable<typeof enriched.domain>["pitchingLines"]>()
    for (const pl of enriched.domain?.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) continue
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    }
    const entries: { pid: string; outs: number; name: string; order: number }[] = []
    let order = 0
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      if (teamShort(enriched, pid) !== team) continue
      entries.push({ pid, outs, name: m.playerName ?? pid, order: order++ })
    }
    if (entries.length === 0) continue
    games++
    const maxOuts = Math.max(...entries.map((e) => e.outs))
    const maxPid = entries.find((e) => e.outs === maxOuts)?.pid
    const curPid = collectStarterYahooIdByRankingShort(enriched).get(team)
    if (maxPid && curPid && maxPid !== curPid) {
      mismatch++
      if (examples.length < 3) {
        const maxE = entries.find((e) => e.pid === maxPid)!
        const curE = entries.find((e) => e.pid === curPid)!
        examples.push(`${doc.gameId}: current=${curE.name}(${curE.outs}outs) maxIp=${maxE.name}(${maxE.outs}outs)`)
      }
    }
  }
  console.log(`${team}: ${mismatch}/${games}試合で先発判定が食い違う`)
  for (const ex of examples) console.log(`  例: ${ex}`)
}
