/**
 * 佐藤輝明のみ: 塁＝テキスト速報、結果＝テキスト速報（TOPPAGE_PLATE_RESULT_SOURCE=text_pbp）で状況別集計。
 *
 *   npx tsx scripts/compute_sato_text_pbp_situation.ts
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { basesBeforeForPlateAppearance } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { classifySituationAtPaStart, rbiCreditFromPlayResult } from "../lib/yahooGame/paSituationSim"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import { fileURLToPath } from "url"
import { join } from "path"

process.env.TOPPAGE_PLATE_RESULT_SOURCE = "text_pbp"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"

const REF: Record<string, { pa: number; ab: number; h: number; bb: number; rbi: number }> = {
  none: { pa: 123, ab: 113, h: 41, bb: 10, rbi: 9 },
  r1: { pa: 48, ab: 43, h: 14, bb: 5, rbi: 8 },
  r2: { pa: 20, ab: 12, h: 6, bb: 8, rbi: 6 },
  r3: { pa: 8, ab: 7, h: 3, bb: 1, rbi: 5 },
  r12: { pa: 14, ab: 11, h: 6, bb: 3, rbi: 6 },
  r13: { pa: 4, ab: 3, h: 0, bb: 0, rbi: 1 },
  r23: { pa: 3, ab: 3, h: 1, bb: 0, rbi: 1 },
  loaded: { pa: 5, ab: 4, h: 2, bb: 0, rbi: 5 },
  risp: { pa: 54, ab: 40, h: 18, bb: 12, rbi: 24 },
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
  risp: "得点圏",
}

function obp(agg: BattingSeasonAggYahoo): string {
  const d = agg.ab + agg.bb + agg.hbp + agg.sf
  return slashRate3FromCounts(agg.h + agg.bb + agg.hbp, d)
}

function addPaToBucket(agg: BattingSeasonAggYahoo, gameId: string, result: string, rbiCredit: number): void {
  agg.gameIds.add(gameId)
  agg.pa += 1
  updateBattingAggFromResultJa(agg, result)
  agg.rbi += rbiCredit
}

function main(): void {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let noBases = 0
  let noResult = 0
  let noLine = 0
  const inferredRbiByGame = new Map<string, number>()

  for (const doc of docs) {
    const playLines = buildPaIdToSportsnaviPlayLineMap(doc)
    let gameInferred = 0

    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== YAHOO) continue
      totalPa++

      const playLine = playLines.get(pa.paId)
      if (!playLine) noLine++

      const basesBefore = basesBeforeForPlateAppearance(pa, playLine)
      if (!basesBefore) {
        noBases++
        continue
      }

      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) {
        noResult++
        continue
      }

      const rbiCredit = rbiCreditFromPlayResult(basesBefore, result)
      gameInferred += rbiCredit

      const { detail, risp } = classifySituationAtPaStart(basesBefore)
      const keys = risp ? [detail, "risp"] : [detail]
      for (const key of keys) {
        const agg = bySit.get(key) ?? emptyBattingSeasonAggYahoo()
        addPaToBucket(agg, doc.gameId, result, rbiCredit)
        bySit.set(key, agg)
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
    if (gameInferred !== 0 || lineRbi !== 0) {
      inferredRbiByGame.set(doc.gameId, lineRbi)
    }
  }

  console.log("佐藤輝明 (yahoo_2000051) — 塁・結果ともテキスト速報 (text_pbp)")
  console.log(`打席数: ${totalPa} | 実況行なし: ${noLine} | 塁不明: ${noBases} | 結果パース不可: ${noResult}\n`)

  const keys = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"] as const
  console.log("状況 | PA | AB | H | BB | RBI | AVG | OBP | 参照PA | ΔPA")
  console.log("-----|----|----|---|----|-----|-----|-----|--------|----")
  for (const k of keys) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]
    const avg = slashRate3FromCounts(a.h, a.ab)
    const dPa = a.pa - r.pa
    console.log(
      `${LABEL[k] ?? k} | ${a.pa} | ${a.ab} | ${a.h} | ${a.bb} | ${a.rbi} | ${avg} | ${obp(a)} | ${r.pa} | ${dPa >= 0 ? "+" : ""}${dPa}`,
    )
  }
}

main()
