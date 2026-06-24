/** CL投手 根本原因診断（高速版） npx tsx scripts/diag_cl_pitching_root_cause.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
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

const OFFICIAL: Record<string, { era: number; st: number; rel: number; k9: number; ba: number; qs: number; cg: number; so: number; er: number; h: number; bf: number }> = {
  巨人: { era: 3.01, st: 3.17, rel: 2.75, k9: 8.15, ba: 0.23, qs: 47.62, cg: 3, so: 511, er: 189, h: 488, bf: 2325 },
  阪神: { era: 3.14, st: 2.88, rel: 3.69, k9: 8.24, ba: 0.229, qs: 62.3, cg: 6, so: 491, er: 187, h: 465, bf: 2190 },
  ヤクルト: { era: 3.2, st: 3.3, rel: 3.01, k9: 8.13, ba: 0.231, qs: 49.21, cg: 2, so: 501, er: 197, h: 491, bf: 2320 },
  DeNA: { era: 3.57, st: 3.96, rel: 3.01, k9: 8.45, ba: 0.245, qs: 41.27, cg: 1, so: 523, er: 221, h: 533, bf: 2373 },
  広島: { era: 2.93, st: 2.84, rel: 3.14, k9: 7.57, ba: 0.231, qs: 53.33, cg: 3, so: 455, er: 176, h: 476, bf: 2251 },
  中日: { era: 3.48, st: 3.26, rel: 3.96, k9: 8.2, ba: 0.242, qs: 58.73, cg: 4, so: 509, er: 216, h: 523, bf: 2368 },
}

function teamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const inf = inferPitcherTeamForNf3Line(doc, yid)
  if (inf) return rosterTeamToRankingShort(inf)
  const r = findRosterPlayerByPublicId(yid)
  return r?.team ? rosterTeamToRankingShort(r.team) : ""
}

type Mode = "maxIp" | "paFirst" | "lineFirst"

function splitEra(
  docs: CanonicalGameDocument[],
  team: string,
  mode: Mode,
): { era: number; st: number; rel: number; qs: number; cg: number; so: number; er: number; h: number; bf: number; ipOuts: number } {
  let stIp = 0, stEr = 0, relIp = 0, relEr = 0
  let qs = 0, cg = 0, games = 0
  let so = 0, er = 0, h = 0, bf = 0, ipOuts = 0

  for (const doc of docs) {
    const opts = { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
    if (!shouldIncludeStandingsGame(doc, year, "CL", opts)) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const lines = enriched.domain?.pitchingLines ?? []
    const byId = new Map<string, typeof lines>()
    lines.forEach((pl, i) => {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) return
      ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
    })

    const entries: { pid: string; outs: number; er: number; so: number; h: number; bf: number; order: number; name: string }[] = []
    let order = 0
    for (const [pid, pls] of byId) {
      const m = mergePitchingLinesInGame(pls)
      if (!m) continue
      const outs = ipStringToOuts(m.ip)
      if (outs === 0 && (m.bf ?? 0) === 0) continue
      if (teamShort(enriched, pid) !== team) continue
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
    } else if (mode === "paFirst") {
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
    cg, so, er, h, bf, ipOuts,
  }
}

const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
const json = JSON.parse(readFileSync(join(root, "_data/derived/team_standings/2026/CL.json"), "utf8"))

console.log("=== CL投手: 現状 vs 公式（差分付き）===\n")
for (const row of json.rows) {
  const t = teamShortFromCode(row.team)
  const o = OFFICIAL[t]
  if (!o) continue
  const d = (a: number | null, b: number, n = 2) => a == null ? "—" : `${a.toFixed(n)} (${a - b >= 0 ? "+" : ""}${(a - b).toFixed(n)})`
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

console.log("=== 先発/救援按分: 3方式比較（公式に最も近い方式を探す）===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  console.log(`【${team}】公式 先発${o.st} 救援${o.rel}`)
  for (const mode of ["maxIp", "paFirst", "lineFirst"] as Mode[]) {
    const s = splitEra(docs, team, mode)
    const dst = Math.abs(s.st - o.st)
    const drel = Math.abs(s.rel - o.rel)
    console.log(`  ${mode.padEnd(9)} 先発=${s.st.toFixed(2)}(Δ${(s.st - o.st).toFixed(2)}) 救援=${s.rel.toFixed(2)}(Δ${(s.rel - o.rel).toFixed(2)}) 合計誤差=${(dst + drel).toFixed(2)} QS=${s.qs.toFixed(1)}% CG=${s.cg}`)
  }
  console.log()
}

console.log("=== 生カウント差分（maxIp集計 vs 公式）===\n")
for (const team of Object.keys(OFFICIAL)) {
  const o = OFFICIAL[team]!
  const s = splitEra(docs, team, "maxIp")
  console.log(`${team}: SO ${s.so}(${s.so - o.so}) ER ${s.er}(${s.er - o.er}) H ${s.h}(${s.h - o.h}) BF ${s.bf}(${s.bf - o.bf}) CG ${s.cg}(${s.cg - o.cg})`)
}
