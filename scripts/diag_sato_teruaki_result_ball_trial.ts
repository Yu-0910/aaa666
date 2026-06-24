/**
 * 佐藤輝明: resultBallClass（打撃確定スナップ）試算 vs スポナビ公式
 *
 *   npx tsx scripts/diag_sato_teruaki_result_ball_trial.ts
 */
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesAtResultBallForSituationSplit,
  buildScoreBasesContextByPaId,
  rbiCreditForPlateAppearance,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart, rbiCreditFromPlayResult, type Bases } from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import {
  SATO_TERUAKI_SITUATION_REF_2026,
  rispAbFromSatoTeruakiSituationRef,
} from "../lib/yahooGame/sportsnaviSatoTeruakiSituationRef"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const REF = SATO_TERUAKI_SITUATION_REF_2026

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

const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const

function aggregate(
  pickBases: (
    hybrid: Bases | null,
    ctx: ReturnType<typeof buildScoreBasesContextByPaId> extends Map<string, infer V> ? V : never,
  ) => Bases | null,
): Map<string, BattingSeasonAggYahoo> {
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let noBases = 0

  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const pas = [...(doc.domain.plateAppearances ?? [])]
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!pas.length) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of pas) {
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue
      const ctx = scoreCtx.get(pa.paId)
      const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playMap.get(pa.paId), ctx)
      const bases = pickBases(hybrid, ctx)
      if (!bases) {
        noBases++
        continue
      }
      const { detail } = classifySituationAtPaStart(bases)
      const agg = bySit.get(detail) ?? emptyBattingSeasonAggYahoo()
      agg.gameIds.add(doc.gameId)
      agg.pa += 1
      updateBattingAggFromResultJa(agg, result)
      agg.rbi += rbiCreditForPlateAppearance(ctx, bases, result, rbiCreditFromPlayResult)
      bySit.set(detail, agg)
    }
  }

  if (noBases) console.error(`  (塁不明 ${noBases} 打席)`)
  return bySit
}

function fmtAvg(h: number, ab: number): string {
  if (ab === 0) return "-"
  return slashRate3FromCounts(h, ab)
}

function printTable(title: string, bySit: Map<string, BattingSeasonAggYahoo>): void {
  console.log(`\n${title}`)
  console.log(
    "ランナー | 打率 | 打数 | 安打 | 本塁 | 打点 | 三振 | 四球 | 死球 | 犠打 | 犠飛",
  )
  console.log(
    "---------|------|------|------|------|------|------|------|------|------|------",
  )
  for (const k of KEYS) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const avg = fmtAvg(a.h, a.ab)
    const refAvg = fmtAvg(r.h, r.ab)
    const mark =
      a.ab === r.ab &&
      a.h === r.h &&
      a.hr === r.hr &&
      a.rbi === r.rbi &&
      a.so === r.so &&
      a.bb === r.bb &&
      a.hbp === r.hbp &&
      a.sh === r.sh &&
      a.sf === r.sf
        ? ""
        : " *"
    console.log(
      `${(LABEL[k] ?? k).padEnd(8)} | ${avg.padStart(5)} | ${String(a.ab).padStart(4)} | ${String(a.h).padStart(4)} | ${String(a.hr).padStart(4)} | ${String(a.rbi).padStart(4)} | ${String(a.so).padStart(4)} | ${String(a.bb).padStart(4)} | ${String(a.hbp).padStart(4)} | ${String(a.sh).padStart(4)} | ${String(a.sf).padStart(4)}${mark}`,
    )
    if (mark) {
      console.log(
        `  公式   | ${refAvg.padStart(5)} | ${String(r.ab).padStart(4)} | ${String(r.h).padStart(4)} | ${String(r.hr).padStart(4)} | ${String(r.rbi).padStart(4)} | ${String(r.so).padStart(4)} | ${String(r.bb).padStart(4)} | ${String(r.hbp).padStart(4)} | ${String(r.sh).padStart(4)} | ${String(r.sf).padStart(4)}`,
      )
    }
  }
}

function countMismatches(bySit: Map<string, BattingSeasonAggYahoo>): number {
  let n = 0
  for (const k of KEYS) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    for (const field of ["ab", "h", "hr", "rbi", "so", "bb", "hbp", "sh", "sf"] as const) {
      if (a[field] !== r[field]) {
        console.error(`  mismatch ${LABEL[k] ?? k}.${field}: got=${a[field]} want=${r[field]}`)
        n++
      }
    }
  }
  const rispAb = KEYS.filter((k) => k !== "none" && k !== "r1").reduce(
    (sum, k) => sum + (bySit.get(k)?.ab ?? 0),
    0,
  )
  const refRispAb = rispAbFromSatoTeruakiSituationRef(REF)
  console.log(`\n得点圏 AB 合算（なし・1塁以外）: ${rispAb}（公式 ${refRispAb}）`)
  if (rispAb !== refRispAb) n++
  return n
}

function main(): void {
  console.log("広島・佐藤輝明 (yahoo_2000051)")
  console.log("結果=出場成績 / 塁=resultBallClass（打撃確定スナップ）\n")

  const resultBall = aggregate((h, ctx) => basesAtResultBallForSituationSplit(ctx, h))
  printTable("【試算】resultBallClass", resultBall)
  const mismatches = countMismatches(resultBall)
  if (mismatches === 0) {
    console.log("\n✓ 佐藤輝明: 結果球集計がスポナビ公式と一致")
  } else {
    console.log(`\n✗ 差分あり: 不一致 ${mismatches} 項目`)
  }
}

main()
