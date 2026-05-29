/**
 * phase15b と同じ基準で、1試合×打者ごとの P0 目標（ハイブリッド）と PA ログ集計の差分を出す。
 * 負の差分（打席ログ > 出場成績）の行だけ表示。
 *
 * npx tsx scripts/diag_vs_hand_negative_delta_per_game.ts --year 2026
 * npx tsx scripts/diag_vs_hand_negative_delta_per_game.ts --year 2026 --batter 1300109
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import {
  aggregateBattingSeasonByYahooBatterHybridForProfiles,
  emptyBattingSeasonAggYahoo,
  plateAppearanceLastResultText,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { dedupePlateAppearancesByInningHalfOrder, mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import { yahooPitcherIdForVsHandFromPa } from "../lib/yahooGame/yahooPitcherIdForVsHandFromPa"
import { pitcherThrowHandRLFromYahooPitcherIdWithMentioned } from "../lib/yahooGame/batterHandFromCanonical"
import { defendingTeamFullNameFromPlateAppearance } from "../lib/yahooGame/inferTeamsFromTextPbp"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type P0 = { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }

function p0FromAgg(a: BattingSeasonAggYahoo): P0 {
  return { pa: a.pa, ab: a.ab, bb: a.bb, hbp: a.hbp, sh: a.sh, sf: a.sf }
}

function p0Sum(x: P0, y: P0): P0 {
  return { pa: x.pa + y.pa, ab: x.ab + y.ab, bb: x.bb + y.bb, hbp: x.hbp + y.hbp, sh: x.sh + y.sh, sf: x.sf + y.sf }
}

function p0Delta(target: P0, cur: P0): P0 {
  return { pa: target.pa - cur.pa, ab: target.ab - cur.ab, bb: target.bb - cur.bb, hbp: target.hbp - cur.hbp, sh: target.sh - cur.sh, sf: target.sf - cur.sf }
}

function loadCanonicalFiles(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function parseArgs(): { year: string; batter: string | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let batter: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--batter" && args[i + 1]) {
      batter = args[i + 1]!.trim()
      i++
    }
  }
  return { year, batter }
}

function main(): void {
  const { batter: onlyBatter } = parseArgs()
  const docs0 = loadCanonicalFiles()
  const docs = docs0.map((d) => mergePhase10RestoredIntoDocIfPresent(d))

  let n = 0
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    if (!gameId) continue

    const hybridOneGame = aggregateBattingSeasonByYahooBatterHybridForProfiles([doc])

    const gameAgg = new Map<string, { R: BattingSeasonAggYahoo; L: BattingSeasonAggYahoo; U: BattingSeasonAggYahoo }>()
    const ensureGame = (bid: string) => {
      let v = gameAgg.get(bid)
      if (!v) {
        v = { R: emptyBattingSeasonAggYahoo(), L: emptyBattingSeasonAggYahoo(), U: emptyBattingSeasonAggYahoo() }
        gameAgg.set(bid, v)
      }
      return v
    }

    const byBidPas = new Map<string, PlateAppearance[]>()
    for (const pa of doc.domain?.plateAppearances ?? []) {
      const bid = String(pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      if (onlyBatter && bid !== onlyBatter) continue
      const arr = byBidPas.get(bid) ?? []
      arr.push(pa)
      byBidPas.set(bid, arr)
    }

    for (const [bid, rawPas] of byBidPas) {
      if (onlyBatter && bid !== onlyBatter) continue
      const pas = dedupePlateAppearancesByInningHalfOrder(rawPas, gameId)
      for (const pa of pas) {
        if (!plateAppearanceLastResultText(pa).trim()) continue
        const pidRaw = yahooPitcherIdForVsHandFromPa(pa)
        const pid = pidRaw == null ? "" : String(pidRaw).trim()
        const hand = pid
          ? pitcherThrowHandRLFromYahooPitcherIdWithMentioned(pid, doc.game?.yahooPlayersMentioned, {
              defendingTeamFullName: defendingTeamFullNameFromPlateAppearance(doc, pa),
            })
          : null
        const bucket: "R" | "L" | "U" = hand === "R" ? "R" : hand === "L" ? "L" : "U"
        const g = ensureGame(bid)
        if (bucket === "R") updateBattingAggFromPa(g.R, gameId, pa)
        else if (bucket === "L") updateBattingAggFromPa(g.L, gameId, pa)
        else updateBattingAggFromPa(g.U, gameId, pa)
      }
    }

    const bidsThisGame = new Set<string>([...hybridOneGame.keys(), ...gameAgg.keys()])
    for (const bid of bidsThisGame) {
      if (onlyBatter && bid !== onlyBatter) continue
      const h = hybridOneGame.get(bid) ?? emptyBattingSeasonAggYahoo()
      const target: P0 = { pa: h.pa, ab: h.ab, bb: h.bb, hbp: h.hbp, sh: h.sh, sf: h.sf }
      const g = gameAgg.get(bid) ?? {
        R: emptyBattingSeasonAggYahoo(),
        L: emptyBattingSeasonAggYahoo(),
        U: emptyBattingSeasonAggYahoo(),
      }
      const cur = p0Sum(p0Sum(p0FromAgg(g.R), p0FromAgg(g.L)), p0FromAgg(g.U))
      const delta = p0Delta(target, cur)
      const neg = delta.pa < 0 || delta.ab < 0 || delta.bb < 0 || delta.hbp < 0 || delta.sh < 0 || delta.sf < 0
      if (!neg) continue

      const raw = byBidPas.get(bid) ?? []
      const ded = dedupePlateAppearancesByInningHalfOrder(raw, gameId)
      const paIdsDedup = ded.map((p) => String(p.paId ?? "").trim()).filter(Boolean)
      const paIdsRaw = raw.map((p) => String(p.paId ?? "").trim()).filter(Boolean)

      console.log(
        [
          `[neg] gameId=${gameId} batter=${bid}`,
          `  target P0: PA=${target.pa} AB=${target.ab} BB=${target.bb} HBP=${target.hbp} SH=${target.sh} SF=${target.sf}`,
          `  cur P0:    PA=${cur.pa} AB=${cur.ab} BB=${cur.bb} HBP=${cur.hbp} SH=${cur.sh} SF=${cur.sf}`,
          `  delta:     PA=${delta.pa} AB=${delta.ab} BB=${delta.bb} HBP=${delta.hbp} SH=${delta.sh} SF=${delta.sf}`,
          `  pas raw=${raw.length} deduped=${ded.length}`,
          `  paIds: ${paIdsDedup.join(" | ")}`,
        ].join("\n"),
      )
      n++
    }
  }

  console.log(`\n[diag] negative-delta rows: ${n}`)
}

main()
