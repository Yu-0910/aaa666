/**
 * 塁=score_illustration + 結果=出場成績 をスポナビ公式（REF）と比較する。
 *
 *   npx tsx scripts/verify_score_illustration_batter.ts 1100082
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { extractSportsnaviSituationTokenFromPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
} from "../lib/yahooGame/paSituationSim"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

/** スポナビ公式ランナー別 PA（diag_* / 手入力参照） */
const SPORTSNAVI_REF_PA: Record<string, Record<string, { pa: number }>> = {
  "2112143": {
    none: { pa: 6 },
    r1: { pa: 3 },
    r2: { pa: 0 },
    r3: { pa: 1 },
    r12: { pa: 1 },
    r13: { pa: 0 },
    r23: { pa: 1 },
    loaded: { pa: 0 },
  },
  "2000051": {
    none: { pa: 123 },
    r1: { pa: 48 },
    r2: { pa: 20 },
    r3: { pa: 8 },
    r12: { pa: 14 },
    r13: { pa: 4 },
    r23: { pa: 3 },
    loaded: { pa: 5 },
  },
  "1100082": {
    none: { pa: 120 },
    r1: { pa: 27 },
    r2: { pa: 10 },
    r3: { pa: 8 },
    r12: { pa: 13 },
    r13: { pa: 4 },
    r23: { pa: 1 },
    loaded: { pa: 1 },
  },
  "2000066": {
    none: { pa: 26 },
    r1: { pa: 11 },
    r2: { pa: 3 },
    r3: { pa: 2 },
    r12: { pa: 2 },
    r13: { pa: 2 },
    r23: { pa: 1 },
    loaded: { pa: 0 },
  },
}

const NAME: Record<string, string> = {
  "2112143": "広島・佐藤啓介",
  "2000051": "阪神・佐藤輝明",
  "1100082": "広島・菊池涼介",
  "2000066": "広島・二俣翔一",
}

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

function aggregateScoreIllustration(yahooId: string): Map<string, BattingSeasonAggYahoo> {
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === yahooId)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!targetPas.length) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    let gameInferred = 0
    for (const pa of targetPas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = scoreCtx.get(pa.paId)
      const basesBefore = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result || !basesBefore) continue
      const rbi = rbiCreditFromPlayResult(basesBefore, result)
      gameInferred += rbi
      const { detail, risp } = classifySituationAtPaStart(basesBefore)
      const keys = risp ? [detail, "risp"] : [detail]
      for (const key of keys) {
        const agg = bySit.get(key) ?? emptyBattingSeasonAggYahoo()
        agg.gameIds.add(doc.gameId)
        agg.pa += 1
        updateBattingAggFromResultJa(agg, result)
        agg.rbi += rbi
        bySit.set(key, agg)
      }
    }

    const line = doc.domain?.battingLines?.find((l) => String(l.yahooPlayerId ?? "").trim() === yahooId)
    const delta = (line?.rbi ?? 0) - gameInferred
    if (delta !== 0) {
      const risp = bySit.get("risp")
      if (risp && risp.pa > 0) {
        risp.rbi += delta
        bySit.set("risp", risp)
      }
    }
  }
  return bySit
}

function l1Pa(bySit: Map<string, BattingSeasonAggYahoo>, ref: Record<string, { pa: number }>): number {
  let d = 0
  for (const k of KEYS) d += Math.abs((bySit.get(k)?.pa ?? 0) - (ref[k]?.pa ?? 0))
  return d
}

function main(): void {
  const yahooId = (process.argv[2] ?? "1100082").trim()
  const ref = SPORTSNAVI_REF_PA[yahooId]
  if (!ref) {
    console.error(`スポナビ REF 未定義: ${yahooId}`)
    process.exit(1)
  }

  const agg = aggregateScoreIllustration(yahooId)
  const overrideHits: string[] = []

  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === yahooId)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!targetPas.length) continue
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of targetPas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = scoreCtx.get(pa.paId)
      if (!ctx?.firstClass) continue
      const raw = classifySituationAtPaStart(ctx.firstClass).detail
      const resolved = classifySituationAtPaStart(
        basesBeforeFromScoreIllustration(ctx, playLine, pa),
      ).detail
      if (raw !== resolved) {
        overrideHits.push(
          `${pa.paId}\t${extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"}\t入口${LABEL[raw] ?? raw}→${LABEL[resolved] ?? resolved}\t${plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 28)}`,
        )
      }
    }
  }

  console.log(`${NAME[yahooId] ?? yahooId} (yahoo_${yahooId})`)
  console.log("設定: 塁=score_illustration / 結果=出場成績")
  console.log("比較対象: スポナビ公式ランナー別 PA のみ\n")

  console.log("状況 | 集計PA | スポナビPA | ΔPA")
  console.log("-----|--------|------------|-----")
  const diffs: string[] = []
  for (const k of KEYS) {
    const got = agg.get(k)?.pa ?? 0
    const sn = ref[k]?.pa ?? 0
    const d = got - sn
    if (d !== 0) diffs.push(`${LABEL[k]}: ${d >= 0 ? "+" : ""}${d}`)
    console.log(`${LABEL[k]}\t${got}\t${sn}\t${d >= 0 ? "+" : ""}${d}`)
  }

  console.log(`\nL1(PA) vs スポナビ = ${l1Pa(agg, ref)}`)
  if (diffs.length) console.log(`差分: ${diffs.join(", ")}`)

  console.log(`\n入口補正が効いた打席: ${overrideHits.length}`)
  for (const line of overrideHits) console.log(`  ${line}`)
}

main()
