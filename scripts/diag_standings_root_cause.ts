/**
 * 順位表 vs 公式値 — 根本原因診断
 *   npx tsx scripts/diag_standings_root_cause.ts
 */
import { aggregateTeamStandingsByLeagueFromCanonical } from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import { teamShortFromCode } from "@/lib/standings/teamCodes"
import {
  aggregatePitchingSeasonByYahooPlayer,
  mergePitchingLinesInGame,
  rosterTeamToRankingShort,
  teamNameForYahooInDoc,
} from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import {
  aggregateBattingForBatterInGameHybrid,
  aggregateBattingSeasonByYahooBatterFromAppearanceSlots,
  mergeBattingSeasonAggYahoo,
  emptyBattingSeasonAggYahoo,
} from "@/lib/yahooGame/canonicalBattingSeasonAgg"
import { collectStartersYahooIdsFromStatLines } from "@/lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { injectTeamsFromTextPbpIfMissing } from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { batterTeamShortInGame, shouldIncludeStandingsGame } from "@/lib/standings/leagueGameFilter"
import { loadScoreboardFromSportsnaviStatsRaw } from "@/lib/standings/sportsnaviStatsScoreboard"
import { ipStringToOuts } from "@/lib/ranking/ipBaseball"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

const root = process.cwd()
const year = "2026"

const OFFICIAL_PL_PITCH: Record<
  string,
  { era: number; eraSt: number; eraRel: number; k9: number; avgA: number; qs: number; so: number }
> = {
  西武: { era: 2.44, eraSt: 2.17, eraRel: 3.22, k9: 7.71, avgA: 0.206, qs: 70.31, so: 499 },
  ソフトバンク: { era: 3.17, eraSt: 3.78, eraRel: 2.17, k9: 8.3, avgA: 0.24, qs: 46.77, so: 508 },
  日本ハム: { era: 3.29, eraSt: 3.22, eraRel: 3.43, k9: 7.83, avgA: 0.233, qs: 53.85, so: 500 },
  オリックス: { era: 3.28, eraSt: 3.03, eraRel: 3.69, k9: 7.98, avgA: 0.237, qs: 52.38, so: 487 },
  ロッテ: { era: 3.51, eraSt: 4.08, eraRel: 2.62, k9: 7.13, avgA: 0.231, qs: 42.86, so: 445 },
  楽天: { era: 3.62, eraSt: 3.26, eraRel: 4.24, k9: 8.25, avgA: 0.244, qs: 51.61, so: 501 },
}

function scoreOpts(doc: CanonicalGameDocument) {
  return { sportsnaviStatsScoreboard: loadScoreboardFromSportsnaviStatsRaw(root, doc.gameId) }
}

function resolveTeamShort(doc: CanonicalGameDocument, yid: string): string {
  const tn = teamNameForYahooInDoc(doc, yid)
  if (tn) return rosterTeamToRankingShort(tn)
  const r = findRosterPlayerByPublicId(yid)
  if (r?.team) return rosterTeamToRankingShort(r.team)
  return ""
}

function teamBattingByMode(
  docs: CanonicalGameDocument[],
  league: "PL" | "CL",
  teamShort: string,
  mode: "slots" | "hybrid",
) {
  const bucket = emptyBattingSeasonAggYahoo()
  const bids = new Set<string>()

  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid) bids.add(bid)
    }
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (bid) bids.add(bid)
    }
  }

  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    for (const bid of bids) {
      if (batterTeamShortInGame(doc, bid) !== teamShort) continue
      if (mode === "hybrid") {
        const g = aggregateBattingForBatterInGameHybrid(doc, bid, { projectRoot: root, skipRisp: true })
        if (g) mergeBattingSeasonAggYahoo(bucket, g)
      }
    }
  }

  if (mode === "slots") {
    const season = aggregateBattingSeasonByYahooBatterFromAppearanceSlots(docs)
    for (const [bid, agg] of season) {
      for (const doc of docs) {
        if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
        if (batterTeamShortInGame(doc, bid) === teamShort) {
          mergeBattingSeasonAggYahoo(bucket, agg)
          break
        }
      }
    }
  }

  return { h: bucket.h, h2: bucket.h2, ab: bucket.ab, hr: bucket.hr }
}

function starterSplitEra(
  docs: CanonicalGameDocument[],
  league: "PL" | "CL",
  teamShort: string,
  mode: "maxIp" | "paFirst" | "lineOrder",
) {
  let stIp = 0,
    stEr = 0,
    relIp = 0,
    relEr = 0,
    qs = 0,
    games = 0

  for (const doc of docs) {
    if (!shouldIncludeStandingsGame(doc, year, league, scoreOpts(doc))) continue
    const enriched = injectTeamsFromTextPbpIfMissing(doc)
    const lines = enriched.domain?.pitchingLines ?? []
    const byId = new Map<string, typeof lines>()
    lines.forEach((pl, i) => {
      const id = String(pl.yahooPlayerId ?? "").trim()
      if (!id) return
      const arr = byId.get(id) ?? []
      arr.push(pl)
      byId.set(id, arr)
    })

    const entries: { pid: string; outs: number; er: number; order: number }[] = []
    let order = 0
    for (const [pid, pls] of byId) {
      const merged = mergePitchingLinesInGame(pls)
      if (!merged) continue
      const outs = ipStringToOuts(merged.ip)
      if (outs === 0 && (merged.bf ?? 0) === 0) continue
      if (resolveTeamShort(enriched, pid) !== teamShort) continue
      entries.push({ pid, outs, er: merged.er ?? 0, order: order++ })
    }
    if (entries.length === 0) continue
    games++

    let starterPid = ""
    if (mode === "maxIp") {
      const max = Math.max(...entries.map((e) => e.outs))
      starterPid = entries.find((e) => e.outs === max)?.pid ?? ""
    } else if (mode === "paFirst") {
      const starters = collectStartersYahooIdsFromStatLines(enriched)
      starterPid = entries.find((e) => starters.has(e.pid))?.pid ?? ""
    } else {
      starterPid = [...entries].sort((a, b) => a.order - b.order)[0]?.pid ?? ""
    }

    const starter = entries.find((e) => e.pid === starterPid)
    if (starter && starter.outs >= 18 && starter.er <= 3) qs++

    for (const e of entries) {
      if (e.pid === starterPid) {
        stIp += e.outs
        stEr += e.er
      } else {
        relIp += e.outs
        relEr += e.er
      }
    }
  }

  return {
    games,
    qsPct: games > 0 ? (qs / games) * 100 : 0,
    eraSt: stIp > 0 ? (stEr * 27) / stIp : null,
    eraRel: relIp > 0 ? (relEr * 27) / relIp : null,
    era: stIp + relIp > 0 ? ((stEr + relEr) * 27) / (stIp + relIp) : null,
  }
}

function main() {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const standings = aggregateTeamStandingsByLeagueFromCanonical(docs, year, { projectRoot: root })
  const byPlayer = aggregatePitchingSeasonByYahooPlayer(docs)

  console.log("========== 1. 投手カウント（個人合算 vs 順位表 vs 公式）==========\n")
  for (const row of standings.PL) {
    const short = teamShortFromCode(row.team)
    const off = OFFICIAL_PL_PITCH[short]
    if (!off) continue

    let so = 0,
      ipOuts = 0
    for (const [id, { agg, league }] of byPlayer) {
      if (league !== "PL") continue
      let team = ""
      for (const doc of docs) {
        const tn = teamNameForYahooInDoc(doc, id)
        if (tn) {
          team = rosterTeamToRankingShort(tn)
          break
        }
      }
      if (!team) {
        const r = findRosterPlayerByPublicId(id)
        if (r?.team) team = rosterTeamToRankingShort(r.team)
      }
      if (team !== short) continue
      so += agg.so
      ipOuts += agg.ipOuts
    }
    const k9 = ipOuts > 0 ? (so * 27) / ipOuts : 0
    console.log(`${short}:`)
    console.log(`  奪三振: 個人合算=${so} 公式=${off.so} Δ=${so - off.so}`)
    console.log(`  K/9: 順位表=${row.k_pct_pitch?.toFixed(2)} 個人合算=${k9.toFixed(2)} 公式=${off.k9}`)
    console.log(`  防御率: 順位表=${row.era?.toFixed(2)} 公式=${off.era}`)
    console.log(
      `  先発防御率: 順位表=${row.era_starter?.toFixed(2)} 公式=${off.eraSt} | 救援=${row.era_relief?.toFixed(2)} 公式=${off.eraRel}`,
    )
    console.log(`  QS率: 順位表=${row.qs_rate?.toFixed(2)}% 公式=${off.qs}%`)
    console.log()
  }

  console.log("========== 2. 先発/救援按分 — 判定方式の比較（ソフトバンク・オリックス・ロッテ）==========\n")
  for (const team of ["ソフトバンク", "オリックス", "ロッテ"] as const) {
    const off = OFFICIAL_PL_PITCH[team]
    console.log(`--- ${team} (公式 先発${off.eraSt} / 救援${off.eraRel}) ---`)
    for (const mode of ["maxIp", "paFirst", "lineOrder"] as const) {
      const s = starterSplitEra(docs, "PL", team, mode)
      console.log(
        `  ${mode}: 先発ERA=${s.eraSt?.toFixed(2) ?? "—"} 救援ERA=${s.eraRel?.toFixed(2) ?? "—"} QS=${s.qsPct.toFixed(1)}%`,
      )
    }
    console.log()
  }

  console.log("========== 3. 打撃 — appearance_slots vs hybrid（公式 H）==========\n")
  const targets: Record<string, number> = {
    ソフトバンク: 516,
    西武: 541,
    巨人: 472,
  }
  for (const [team, officialH] of Object.entries(targets)) {
    const lg = team === "巨人" ? "CL" : "PL"
    const slots = teamBattingByMode(docs, lg, team, "slots")
    const hybrid = teamBattingByMode(docs, lg, team, "hybrid")
    const row = [...standings.PL, ...standings.CL].find((r) => r.teamName === team || teamShortFromCode(r.team) === team)
    console.log(`${team} (公式H=${officialH}):`)
    console.log(`  appearance_slots: H=${slots.h} 2B=${slots.h2}`)
    console.log(`  hybrid(順位表):   H=${hybrid.h} 2B=${hybrid.h2}`)
    console.log(`  順位表JSON:       H=${row?.h}`)
    console.log()
  }

  console.log("========== 4. PA先発 vs 最大IP先発 の不一致試合数（PL）==========\n")
  for (const team of ["西武", "ソフトバンク", "オリックス", "ロッテ"] as const) {
    let games = 0,
      mismatch = 0
    const examples: string[] = []
    for (const doc of docs) {
      if (!shouldIncludeStandingsGame(doc, year, "PL", scoreOpts(doc))) continue
      const enriched = injectTeamsFromTextPbpIfMissing(doc)
      const paStarters = collectStartersYahooIdsFromStatLines(enriched)
      const entries: { pid: string; outs: number; er: number; name: string }[] = []
      const byId = new Map<string, typeof enriched.domain.pitchingLines>()
      for (const pl of enriched.domain?.pitchingLines ?? []) {
        const id = String(pl.yahooPlayerId ?? "").trim()
        if (!id) continue
        ;(byId.get(id) ?? byId.set(id, []).get(id)!).push(pl)
      }
      for (const [pid, pls] of byId) {
        const merged = mergePitchingLinesInGame(pls)
        if (!merged) continue
        const outs = ipStringToOuts(merged.ip)
        if (outs === 0 && (merged.bf ?? 0) === 0) continue
        if (resolveTeamShort(enriched, pid) !== team) continue
        entries.push({ pid, outs, er: merged.er ?? 0, name: merged.playerName ?? pid })
      }
      if (entries.length === 0) continue
      games++
      const maxOuts = Math.max(...entries.map((e) => e.outs))
      const maxPid = entries.find((e) => e.outs === maxOuts)?.pid
      const paPid = entries.find((e) => paStarters.has(e.pid))?.pid
      if (maxPid && paPid && maxPid !== paPid) {
        mismatch++
        if (examples.length < 3) {
          const maxE = entries.find((e) => e.pid === maxPid)!
          const paE = entries.find((e) => e.pid === paPid)!
          examples.push(
            `${doc.gameId}: PA先発=${paE.name}(${paE.outs}outs) maxIP=${maxE.name}(${maxE.outs}outs)`,
          )
        }
      }
    }
    console.log(`${team}: ${mismatch}/${games}試合で先発判定が食い違う`)
    for (const ex of examples) console.log(`  例: ${ex}`)
  }
}

main()
