/**
 * 平川蓮: resultBallClass（打撃確定スナップ）試算 vs スポナビ公式
 *
 *   npx tsx scripts/diag_hirakawa_result_ball_trial.ts
 */
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesAtResultBallForSituationSplit,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart, type Bases } from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import {
  HIRAKAWA_SITUATION_REF_2026,
  rispAbFromSituationRef,
} from "../lib/yahooGame/sportsnaviHirakawaSituationRef"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"

const REF = HIRAKAWA_SITUATION_REF_2026

const LABEL: Record<string, string> = {
  none: "無し",
  r1: "1塁",
  r2: "2塁",
  r3: "3塁",
  r12: "1・2塁",
  r13: "1・3塁",
  r23: "2・3塁",
  loaded: "満塁",
}

const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const

function sitKey(b: Bases | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

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
      bySit.set(detail, agg)
    }
  }

  if (noBases) console.error(`  (塁不明 ${noBases} 打席)`)
  return bySit
}

function printTable(title: string, bySit: Map<string, BattingSeasonAggYahoo>): number {
  console.log(`\n${title}`)
  console.log("状況 | AB | H | SO | BB | HBP | SH | AVG | 公式AB | Δ")
  console.log("-----|----|----|----|----|-----|----|-----|--------|----")
  let l1 = 0
  for (const k of KEYS) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const dAb = a.ab - r.ab
    l1 += Math.abs(dAb)
    console.log(
      `${LABEL[k] ?? k} | ${a.ab} | ${a.h} | ${a.so} | ${a.bb} | ${a.hbp} | ${a.sh} | ${slashRate3FromCounts(a.h, a.ab)} | ${r.ab} | ${dAb >= 0 ? "+" : ""}${dAb}`,
    )
  }
  console.log(`L1(AB) vs スポナビ = ${l1}`)
  return l1
}

function verifyDetail(bySit: Map<string, BattingSeasonAggYahoo>): number {
  let mismatches = 0
  for (const k of KEYS) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    for (const [field, got, want] of [
      ["ab", a.ab, r.ab],
      ["h", a.h, r.h],
      ["so", a.so, r.so],
      ["bb", a.bb, r.bb],
      ["hbp", a.hbp, r.hbp],
      ["sh", a.sh, r.sh],
    ] as const) {
      if (got !== want) {
        console.error(`  mismatch ${LABEL[k] ?? k}.${field}: got=${got} want=${want}`)
        mismatches++
      }
    }
  }
  const rispAb = KEYS.filter((k) => k !== "none" && k !== "r1").reduce(
    (sum, k) => sum + (bySit.get(k)?.ab ?? 0),
    0,
  )
  const refRispAb = rispAbFromSituationRef(REF)
  console.log(`得点圏 AB 合算（なし・1塁以外）: ${rispAb}（公式 ${refRispAb}）`)
  if (rispAb !== refRispAb) mismatches++
  return mismatches
}

function main(): void {
  console.log("広島・平川蓮 (yahoo_2110164)")
  console.log("結果=出場成績 / 塁=hybrid開始 vs resultBallClass vs lastClass（旧）\n")

  const hybrid = aggregate((h) => h)
  const resultBall = aggregate((h, ctx) =>
    basesAtResultBallForSituationSplit(ctx, h),
  )
  const lastClass = aggregate((_h, ctx) => ctx?.lastClass ?? null)

  const l1Hybrid = printTable("【A】hybrid 開始（実況+score補正・旧）", hybrid)
  const l1Result = printTable("【B】resultBallClass（打撃確定スナップ・Phase15 正）", resultBall)
  const l1Last = printTable("【C】lastClass（suffix最大・参考）", lastClass)

  console.log("\n--- サマリ ---")
  console.log(`hybrid開始 L1(AB)=${l1Hybrid}  resultBallClass L1(AB)=${l1Result}  lastClass L1(AB)=${l1Last}`)
  const detailMiss = verifyDetail(resultBall)
  if (detailMiss === 0 && l1Result === 0) {
    console.log("\n✓ 平川蓮: 結果球集計がスポナビ公式と一致")
  } else {
    console.log(`\n✗ 差分あり: L1(AB)=${l1Result}, 詳細不一致=${detailMiss}`)
  }

  const drift: string[] = []
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
      const hybridB = basesBeforeForPlateAppearanceHybrid(pa, playMap.get(pa.paId), ctx)
      const rb = basesAtResultBallForSituationSplit(ctx, hybridB)
      if (!hybridB || !rb) continue
      const h = sitKey(hybridB)
      const r = sitKey(rb)
      if (h !== r) {
        drift.push(
          `  ${pa.paId} | hybrid=${LABEL[h] ?? h} → resultBall=${LABEL[r] ?? r} | ${result.slice(0, 24)}`,
        )
      }
    }
  }
  console.log(`\nhybrid≠resultBall の打席: ${drift.length}`)
  for (const line of drift.slice(0, 20)) console.log(line)
}

main()
