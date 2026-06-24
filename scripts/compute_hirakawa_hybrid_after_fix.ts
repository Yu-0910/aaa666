/**
 * 平川蓮: 4点修正後の状況別試算
 * npx tsx scripts/compute_hirakawa_hybrid_after_fix.ts
 */
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
} from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { slashRate3FromCounts } from "../lib/battingRateFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"

const REF: Record<
  string,
  { pa: number; ab: number; h: number; so: number; bb: number; hbp: number; sh: number; sf: number; rbi: number }
> = {
  none: { pa: 51, ab: 48, h: 6, so: 19, bb: 2, hbp: 1, sh: 0, sf: 0, rbi: 0 },
  r1: { pa: 18, ab: 17, h: 6, so: 3, bb: 0, hbp: 0, sh: 1, sf: 0, rbi: 0 },
  r2: { pa: 8, ab: 8, h: 1, so: 4, bb: 0, hbp: 0, sh: 0, sf: 0, rbi: 1 },
  r3: { pa: 3, ab: 3, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, rbi: 2 },
  r12: { pa: 8, ab: 8, h: 1, so: 3, bb: 0, hbp: 0, sh: 0, sf: 0, rbi: 2 },
  r13: { pa: 1, ab: 1, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, rbi: 2 },
  r23: { pa: 2, ab: 1, h: 0, so: 1, bb: 1, hbp: 0, sh: 0, sf: 0, rbi: 0 },
  loaded: { pa: 3, ab: 2, h: 1, so: 0, bb: 1, hbp: 0, sh: 0, sf: 0, rbi: 3 },
}

const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const
const LABEL: Record<string, string> = {
  none: "なし",
  r1: "一塁",
  r2: "二塁",
  r3: "三塁",
  r12: "一二塁",
  r13: "一三塁",
  r23: "二三塁",
  loaded: "満塁",
}

function main(): void {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let total = 0
  let noBases = 0

  for (const doc of docs) {
    const pas = [...(doc.domain.plateAppearances ?? [])]
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (pas.length === 0) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of pas) {
      total++
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue
      const basesBefore = basesBeforeForPlateAppearanceHybrid(
        pa,
        playMap.get(pa.paId),
        scoreCtx.get(pa.paId),
      )
      if (!basesBefore) {
        noBases++
        continue
      }
      const { detail } = classifySituationAtPaStart(basesBefore)
      const rbi = rbiCreditFromPlayResult(basesBefore, result)
      const agg = bySit.get(detail) ?? emptyBattingSeasonAggYahoo()
      agg.gameIds.add(doc.gameId)
      agg.pa += 1
      updateBattingAggFromResultJa(agg, result)
      agg.rbi += rbi
      bySit.set(detail, agg)
    }
  }

  let l1 = 0
  console.log("平川蓮 — 4点修正後（実況+競合解決+代打+出場成績結果）\n")
  console.log(`打席: ${total} | 塁不明: ${noBases}\n`)
  console.log("ランナー\t打率\t打数\t安打\t本塁打\t打点\t三振\t四球\t死球\t犠打\t犠飛")
  for (const k of KEYS) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    console.log(
      `${LABEL[k]}\t${slashRate3FromCounts(g.h, g.ab)}\t${g.ab}\t${g.h}\t${g.hr}\t${g.rbi}\t${g.so}\t${g.bb}\t${g.hbp}\t${g.sh}\t${g.sf}`,
    )
    l1 +=
      Math.abs(g.pa - r.pa) +
      Math.abs(g.ab - r.ab) +
      Math.abs(g.h - r.h) +
      Math.abs(g.so - r.so) +
      Math.abs(g.bb - r.bb) +
      Math.abs(g.hbp - r.hbp) +
      Math.abs(g.sh - r.sh)
  }

  console.log("\n--- 正常値との差分 ---")
  for (const k of KEYS) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const diffs: string[] = []
    if (g.pa !== r.pa) diffs.push(`PA${g.pa - r.pa >= 0 ? "+" : ""}${g.pa - r.pa}`)
    if (g.ab !== r.ab) diffs.push(`AB${g.ab - r.ab >= 0 ? "+" : ""}${g.ab - r.ab}`)
    if (g.h !== r.h) diffs.push(`H${g.h - r.h >= 0 ? "+" : ""}${g.h - r.h}`)
    if (g.so !== r.so) diffs.push(`SO${g.so - r.so >= 0 ? "+" : ""}${g.so - r.so}`)
    if (g.bb !== r.bb) diffs.push(`BB${g.bb - r.bb >= 0 ? "+" : ""}${g.bb - r.bb}`)
    if (g.hbp !== r.hbp) diffs.push(`HBP${g.hbp - r.hbp >= 0 ? "+" : ""}${g.hbp - r.hbp}`)
    if (g.sh !== r.sh) diffs.push(`SH${g.sh - r.sh >= 0 ? "+" : ""}${g.sh - r.sh}`)
    if (diffs.length) console.log(`  ${LABEL[k]}: ${diffs.join(" ")}`)
  }
  console.log(`\nL1(PA+AB+H+SO+BB+HBP+SH) = ${l1}`)
}

main()
