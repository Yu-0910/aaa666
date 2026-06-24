/**
 * 広島・二俣翔一: 塁＝一球速報イラスト、結果＝出場成績。
 * 打席開始時（入口 #base class）と結果球時（打席終了 #base class）を比較。
 *
 *   npx tsx scripts/compute_futamata_score_illustration_situation.ts
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
  type ScoreBasesContext,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000066"

/** スポナビ公式ランナー別（diag_futamata_hybrid 参照） */
const REF: Record<string, { pa: number; ab: number; h: number; bb: number; rbi: number }> = {
  none: { pa: 26, ab: 25, h: 3, bb: 1, rbi: 1 },
  r1: { pa: 11, ab: 11, h: 3, bb: 0, rbi: 1 },
  r2: { pa: 3, ab: 2, h: 0, bb: 0, rbi: 0 },
  r3: { pa: 2, ab: 2, h: 1, bb: 0, rbi: 1 },
  r12: { pa: 2, ab: 2, h: 1, bb: 0, rbi: 0 },
  r13: { pa: 2, ab: 1, h: 1, bb: 0, rbi: 1 },
  r23: { pa: 1, ab: 0, h: 0, bb: 0, rbi: 1 },
  loaded: { pa: 0, ab: 0, h: 0, bb: 0, rbi: 0 },
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

type SitStats = {
  bySit: Map<string, BattingSeasonAggYahoo>
  totalPa: number
  noBases: number
  noResult: number
  startVsEndDiff: number
}

function obp(agg: BattingSeasonAggYahoo): string {
  const d = agg.ab + agg.bb + agg.hbp + agg.sf
  return slashRate3FromCounts(agg.h + agg.bb + agg.hbp, d)
}

function addPa(agg: BattingSeasonAggYahoo, gameId: string, result: string, rbiCredit: number): void {
  agg.gameIds.add(gameId)
  agg.pa += 1
  updateBattingAggFromResultJa(agg, result)
  agg.rbi += rbiCredit
}

function runMode(
  pickBases: (ctx: ScoreBasesContext | undefined) => Bases | null,
): SitStats {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let noBases = 0
  let noResult = 0
  let startVsEndDiff = 0

  for (const doc of docs) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (targetPas.length === 0) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    let gameInferred = 0

    for (const pa of targetPas) {
      totalPa++
      const ctx = scoreCtx.get(pa.paId)
      const basesBefore = pickBases(ctx)
      const result = plateAppearanceResolvedResultText(doc, pa).trim()

      if (!result) {
        noResult++
        continue
      }
      if (!basesBefore) {
        noBases++
        continue
      }

      const rbiCredit = rbiCreditFromPlayResult(basesBefore, result)
      gameInferred += rbiCredit
      const { detail, risp } = classifySituationAtPaStart(basesBefore)
      const keys = risp ? [detail, "risp"] : [detail]
      for (const key of keys) {
        const agg = bySit.get(key) ?? emptyBattingSeasonAggYahoo()
        addPa(agg, doc.gameId, result, rbiCredit)
        bySit.set(key, agg)
      }

      const atStart = basesBeforeFromScoreIllustration(ctx)
      const atEnd = ctx?.lastClass ?? null
      if (atStart && atEnd) {
        const s = classifySituationAtPaStart(atStart).detail
        const e = classifySituationAtPaStart(atEnd).detail
        if (s !== e) startVsEndDiff++
      }
    }

    const line = doc.domain?.battingLines?.find((l) => String(l.yahooPlayerId ?? "").trim() === YAHOO)
    const lineRbi = line?.rbi ?? 0
    const delta = lineRbi - gameInferred
    if (delta !== 0) {
      const risp = bySit.get("risp")
      if (risp && risp.pa > 0) {
        risp.rbi += delta
        bySit.set("risp", risp)
      }
    }
  }

  return { bySit, totalPa, noBases, noResult, startVsEndDiff }
}

function printTable(title: string, stats: SitStats): void {
  console.log(`\n${title}`)
  console.log(
    `打席数: ${stats.totalPa} | 塁不明: ${stats.noBases} | 結果なし: ${stats.noResult} | 開始≠終了イラスト: ${stats.startVsEndDiff}打席`,
  )
  console.log("\n状況 | PA | AB | H | BB | RBI | AVG | OBP | 参照PA | ΔPA")
  console.log("-----|----|----|---|----|-----|-----|-----|--------|----")
  const keys = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const
  let l1 = 0
  for (const k of keys) {
    const a = stats.bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const avg = slashRate3FromCounts(a.h, a.ab)
    const dPa = a.pa - r.pa
    l1 += Math.abs(dPa)
    console.log(
      `${LABEL[k] ?? k} | ${a.pa} | ${a.ab} | ${a.h} | ${a.bb} | ${a.rbi} | ${avg} | ${obp(a)} | ${r.pa} | ${dPa >= 0 ? "+" : ""}${dPa}`,
    )
  }
  console.log(`L1(PA) vs スポナビ参照 = ${l1}`)
}

function main(): void {
  console.log("広島・二俣翔一 (yahoo_2000066)")
  console.log("塁: 一球速報 score イラスト / 結果: 出場成績（appearance_only）")

  const atStart = runMode((ctx) => basesBeforeFromScoreIllustration(ctx))
  const atResult = runMode((ctx) => ctx?.lastClass ?? null)

  printTable(
    "【A】打席開始時 — 入口 #base class イラスト → 半回チェーン → em",
    atStart,
  )
  printTable("【B】結果球時 — 打席終了（suffix 最大）#base class イラスト", atResult)

  console.log("\n--- 開始時 vs 結果球時で状況キーが変わった打席 ---")
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  let shown = 0
  for (const doc of docs) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!targetPas.length) continue
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of targetPas) {
      const ctx = scoreCtx.get(pa.paId)
      const bStart = basesBeforeFromScoreIllustration(ctx)
      const bEnd = ctx?.lastClass ?? null
      if (!bStart || !bEnd) continue
      const s = classifySituationAtPaStart(bStart).detail
      const e = classifySituationAtPaStart(bEnd).detail
      if (s === e) continue
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      console.log(
        `  ${pa.paId} | 開始=${LABEL[s] ?? s} → 結果球=${LABEL[e] ?? e} | ${result.slice(0, 36)}`,
      )
      if (++shown >= 25) return
    }
  }
  if (shown === 0) console.log("  （なし）")
}

main()
