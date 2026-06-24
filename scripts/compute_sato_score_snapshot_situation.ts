/**
 * 佐藤輝明: 塁＝一球速報 score HTML（イラスト/class + em ランナー表記）、結果＝出場成績（既定）。
 *
 *   npx tsx scripts/compute_sato_score_snapshot_situation.ts
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  basesFromScoreHtmlBaseClass,
  buildPaStartBasesFromScoreSnapshots,
  firstSnapshotHtmlForPaPrefix,
  scoreIndexPrefixForPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { parsePaId, comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import { fileURLToPath } from "url"
import { join } from "path"

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

type SitStats = {
  bySit: Map<string, BattingSeasonAggYahoo>
  totalPa: number
  noSnap: number
  noBases: number
  noResult: number
}

function halfKey(paId: string): string | null {
  const p = parsePaId(paId)
  if (!p) return null
  return `${p.inning}-${p.half}`
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

function runBothModes(): { chain: SitStats; first: SitStats } {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const chainBySit = new Map<string, BattingSeasonAggYahoo>()
  const firstBySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let chainNoBases = 0
  let firstNoSnap = 0
  let firstNoBases = 0
  let noResult = 0

  for (const doc of docs) {
    const satoPas = (doc.domain.plateAppearances ?? []).filter(
      (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
    )
    if (satoPas.length === 0) continue

    const snapshots = loadSportsnaviScoreSnapshots(root, doc.gameId)
    const pas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const halfGroups = new Map<string, string[]>()
    for (const pa of pas) {
      const hk = halfKey(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa.paId)
      halfGroups.set(hk, list)
    }

    const startBasesByPa = new Map<string, Bases | null>()
    for (const [, ids] of halfGroups) {
      const m = buildPaStartBasesFromScoreSnapshots(ids, snapshots)
      for (const [id, b] of m) startBasesByPa.set(id, b)
    }

    let gameInferredChain = 0
    let gameInferredFirst = 0

    for (const pa of satoPas) {
      totalPa++

      const chainBefore = startBasesByPa.get(pa.paId) ?? null
      const prefix = scoreIndexPrefixForPaId(pa.paId)
      const html = prefix ? firstSnapshotHtmlForPaPrefix(prefix, snapshots) : null
      if (!html) firstNoSnap++
      const firstBefore = html ? basesFromScoreHtmlBaseClass(html) : null

      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) {
        noResult++
        continue
      }

      const apply = (
        basesBefore: Bases | null,
        bySit: Map<string, BattingSeasonAggYahoo>,
        onMissing: () => void,
        rbiAcc: { v: number },
      ) => {
        if (!basesBefore) {
          onMissing()
          return
        }
        const rbiCredit = rbiCreditFromPlayResult(basesBefore, result)
        rbiAcc.v += rbiCredit
        const { detail, risp } = classifySituationAtPaStart(basesBefore)
        const keys = risp ? [detail, "risp"] : [detail]
        for (const key of keys) {
          const agg = bySit.get(key) ?? emptyBattingSeasonAggYahoo()
          addPa(agg, doc.gameId, result, rbiCredit)
          bySit.set(key, agg)
        }
      }

      const chainAcc = { v: 0 }
      apply(chainBefore, chainBySit, () => chainNoBases++, chainAcc)
      gameInferredChain += chainAcc.v

      const firstAcc = { v: 0 }
      apply(firstBefore, firstBySit, () => firstNoBases++, firstAcc)
      gameInferredFirst += firstAcc.v
    }

    const line = doc.domain?.battingLines?.find((l) => String(l.yahooPlayerId ?? "").trim() === YAHOO)
    const lineRbi = line?.rbi ?? 0
    for (const [bySit, inferred] of [
      [chainBySit, gameInferredChain],
      [firstBySit, gameInferredFirst],
    ] as const) {
      const delta = lineRbi - inferred
      if (delta !== 0) {
        const risp = bySit.get("risp")
        if (risp && risp.pa > 0) {
          risp.rbi += delta
          bySit.set("risp", risp)
        }
      }
    }
  }

  return {
    chain: {
      bySit: chainBySit,
      totalPa,
      noSnap: 0,
      noBases: chainNoBases,
      noResult,
    },
    first: {
      bySit: firstBySit,
      totalPa,
      noSnap: firstNoSnap,
      noBases: firstNoBases,
      noResult,
    },
  }
}

function printTable(title: string, stats: SitStats): void {
  console.log(`\n${title}`)
  console.log(
    `打席数: ${stats.totalPa} | スナップショットなし: ${stats.noSnap} | 塁不明: ${stats.noBases} | 結果なし: ${stats.noResult}`,
  )
  console.log("\n状況 | PA | AB | H | BB | RBI | AVG | OBP | 参照PA | ΔPA")
  console.log("-----|----|----|---|----|-----|-----|-----|--------|----")
  const keys = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"] as const
  for (const k of keys) {
    const a = stats.bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]
    const avg = slashRate3FromCounts(a.h, a.ab)
    const dPa = a.pa - r.pa
    console.log(
      `${LABEL[k] ?? k} | ${a.pa} | ${a.ab} | ${a.h} | ${a.bb} | ${a.rbi} | ${avg} | ${obp(a)} | ${r.pa} | ${dPa >= 0 ? "+" : ""}${dPa}`,
    )
  }
}

function main(): void {
  console.log("佐藤輝明 (yahoo_2000051) — 塁: score HTML イラスト / 結果: 出場成績")
  const { chain, first } = runBothModes()
  printTable(
    "【A】前打席終了塁を引き継ぎ + em ランナー表記優先（打席開始推定）",
    chain,
  )
  printTable("【B】各打席 suffix00 の #base class のみ（打席後イラスト）", first)
}

main()
