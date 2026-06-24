/**
 * 山野太一 × 古賀捕手の捕手別成績を試合単位で検証する。
 *   npx tsx scripts/diag_yamano_koga_catcher_split.ts
 */
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { comparePlateAppearances, teamForYahooPlayerId } from "../lib/yahooGame/pitcherPocHelpers"
import {
  fieldingTeamNameFromInningHalf,
  getStartingCatcherForTeam,
  teamsRoughlyMatch,
} from "../lib/yahooGame/startingCatcherFromCanonical"
import { buildEstimatedErByPaId } from "../lib/yahooGame/estimatedErByPaIdFromTextPbp"
import { addPitcherPaCount, lastPitchResult } from "../lib/yahooGame/pitcherPaResultCommon"
import type { PitcherSeasonPocPayload } from "../lib/pitcherSeasonPocTypes"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const PITCHER = "2000025"
const KOGA = "1600078"
const SUZUKI = "2109495"
const NPB = "63365153"

function loadGame(gameId: string): CanonicalGameDocument | null {
  const p = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
  } catch {
    return null
  }
}

function outsToIp(outs: number): string {
  if (outs <= 0) return "0"
  const w = Math.floor(outs / 3)
  const f = outs % 3
  return f === 0 ? String(w) : `${w}.${f}`
}

function main(): void {
  const payload = JSON.parse(
    readFileSync(
      join(root, "_data", "derived", "player_season_pitching_poc", "2026", `npb_${NPB}.json`),
      "utf8",
    ),
  ) as PitcherSeasonPocPayload

  const gameIds = payload.source.canonicalGames
  let kogaBf = 0
  let suzukiBf = 0
  let kogaErEst = 0
  let suzukiErEst = 0
  let kogaOutsEst = 0
  let suzukiOutsEst = 0

  console.log("=== 山野太一 捕手別検証 ===")
  console.log("basic:", {
    ip: payload.basic.ip,
    ipOuts: payload.basic.ipOuts,
    bf: payload.basic.bf,
    er: payload.basic.er,
    era: payload.basic.era,
  })
  console.log("byCatcher (stored):", payload.splits.byCatcher)

  for (const gameId of gameIds) {
    const baseDoc = loadGame(gameId)
    if (!baseDoc) {
      console.log(`[${gameId}] canonical missing`)
      continue
    }
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    const erByPa = buildEstimatedErByPaId(doc)
    const pas = [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)
    let paK = 0
    let paS = 0
    for (const pa of pas) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (pid !== PITCHER) continue
      const fieldingTeam = fieldingTeamNameFromInningHalf(doc, (pa.inningHalf ?? "").trim())
      if (!fieldingTeam) continue
      const pitcherFromLineup = teamForYahooPlayerId(doc, pid)
      if (pitcherFromLineup && !teamsRoughlyMatch(pitcherFromLineup, fieldingTeam)) continue
      const cat = getStartingCatcherForTeam(doc, fieldingTeam)
      if (!cat) continue
      const res = lastPitchResult(pa)
      const agg = { bf: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, outs: 0, er: 0 }
      addPitcherPaCount(agg, res)
      const paEr = erByPa.get(pa.paId ?? "") ?? 0
      if (cat.yahooPlayerId === KOGA) {
        paK++
        kogaBf++
        kogaErEst += paEr
        kogaOutsEst += agg.outs
      } else if (cat.yahooPlayerId === SUZUKI) {
        paS++
        suzukiBf++
        suzukiErEst += paEr
        suzukiOutsEst += agg.outs
      }
    }
    const line = (baseDoc.domain?.pitchingLines ?? []).find(
      (pl) => (pl.yahooPlayerId ?? "").trim() === PITCHER,
    )
    if (line || paK > 0 || paS > 0) {
      const catcher =
        paK > 0 && paS > 0 ? "both" : paK > 0 ? "koga" : paS > 0 ? "suzuki" : "none"
      console.log(`[${gameId}] line ip=${line?.ip} bf=${line?.bf} er=${line?.er} | PA koga=${paK} suzuki=${paS} catcher=${catcher}`)
    }
  }

  console.log("\n--- PA 集計（phase6 と同じロジック）---")
  console.log({ kogaBf, suzukiBf, sum: kogaBf + suzukiBf, basicBf: payload.basic.bf })

  console.log("\n--- 試合 pitchingLines 帰属（phase6 現行）---")
  type LineAgg = { ipOuts: number; er: number; games: number }
  const lineByCatcher = new Map<string, LineAgg>()
  for (const gameId of gameIds) {
    const baseDoc = loadGame(gameId)
    if (!baseDoc) continue
    const perPitcher = new Map<string, Map<string, number>>()
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    for (const pa of [...(doc.domain?.plateAppearances ?? [])].sort(comparePlateAppearances)) {
      const pid = yahooPitcherIdForVsHandFromPa(pa)
      if (pid !== PITCHER) continue
      const fieldingTeam = fieldingTeamNameFromInningHalf(doc, (pa.inningHalf ?? "").trim())
      if (!fieldingTeam) continue
      const pitcherFromLineup = teamForYahooPlayerId(doc, pid)
      if (pitcherFromLineup && !teamsRoughlyMatch(pitcherFromLineup, fieldingTeam)) continue
      const cat = getStartingCatcherForTeam(doc, fieldingTeam)
      if (!cat) continue
      let m = perPitcher.get(pid)
      if (!m) {
        m = new Map()
        perPitcher.set(pid, m)
      }
      m.set(cat.yahooPlayerId, (m.get(cat.yahooPlayerId) ?? 0) + 1)
    }
    const perCatcher = perPitcher.get(PITCHER)
    if (!perCatcher) continue
    const line = (baseDoc.domain?.pitchingLines ?? []).find(
      (pl) => (pl.yahooPlayerId ?? "").trim() === PITCHER,
    )
    if (!line) continue
    const sorted = [...perCatcher.entries()].sort(
      (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
    )
    const cyid = sorted[0]?.[0]
    if (!cyid) continue
    const cur = lineByCatcher.get(cyid) ?? { ipOuts: 0, er: 0, games: 0 }
    const ip = String(line.ip ?? "").trim()
    let outs = 0
    if (ip.includes(".")) {
      const [w, f] = ip.split(".")
      outs = (parseInt(w, 10) || 0) * 3 + Math.min(2, parseInt(f ?? "0", 10) || 0)
    } else {
      outs = (parseInt(ip, 10) || 0) * 3
    }
    cur.ipOuts += outs
    cur.er += line.er ?? 0
    cur.games += 1
    lineByCatcher.set(cyid, cur)
  }
  for (const row of payload.splits.byCatcher ?? []) {
    const exp = lineByCatcher.get(row.yahooCatcherId)
    console.log(row.label, {
      stored: { ip: row.ip, era: row.era, wl: row.wl },
      expectedFromLines: exp
        ? {
            ip: outsToIp(exp.ipOuts),
            era: exp.ipOuts > 0 ? Number(((exp.er * 27) / exp.ipOuts).toFixed(2)) : null,
            er: exp.er,
          }
        : null,
    })
  }

  console.log("\n--- phase6 按分（旧・参考）---")
  const totalBf = payload.basic.bf
  const totalOuts = payload.basic.ipOuts
  const totalEr = payload.basic.er
  for (const [label, bf] of [
    ["古賀", kogaBf],
    ["鈴木叶", suzukiBf],
  ] as const) {
    const share = bf / totalBf
    const ipOutsC = Math.round(totalOuts * share)
    const erC = totalEr * share
    const era = ipOutsC > 0 ? (erC * 27) / ipOutsC : null
    console.log(label, {
      share: share.toFixed(4),
      ip: outsToIp(ipOutsC),
      ipOuts: ipOutsC,
      erProrated: erC.toFixed(3),
      eraProrated: era?.toFixed(3),
    })
  }

  console.log("\n--- 打席ベース推定 ER / outs（巡目別と同 SSOT）---")
  for (const [label, bf, er, outs] of [
    ["古賀", kogaBf, kogaErEst, kogaOutsEst],
    ["鈴木叶", suzukiBf, suzukiErEst, suzukiOutsEst],
  ] as const) {
    const era = outs > 0 ? (er * 27) / outs : null
    console.log(label, {
      bf,
      erFromPa: er.toFixed(3),
      ipFromPaOuts: outsToIp(outs),
      ipOuts: outs,
      eraFromPa: era?.toFixed(3),
    })
  }
}

main()
