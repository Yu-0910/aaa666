/**
 * 状況別打点不一致の原因究明
 * - resultBall 塁 vs hybrid 開始塁 での打点推定差
 * - 安打種別ごとの推定ルールと実況の突合
 *
 *   npx tsx scripts/diag_rbi_situation_gap.ts
 *   npx tsx scripts/diag_rbi_situation_gap.ts --yahoo 2000051
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
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { hitBases } from "../lib/yahooGame/resultJaHitBases"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

const TARGETS: Record<string, string> = {
  "1100082": "菊池涼介",
  "2000051": "佐藤輝明",
}

function sitLabel(b: Bases): string {
  return classifySituationAtPaStart(b).detail
}

function basesStr(b: Bases): string {
  const p: string[] = []
  if (b.r1) p.push("1")
  if (b.r2) p.push("2")
  if (b.r3) p.push("3")
  return p.length ? p.join("") : "0"
}

/** ルール上の「推定打点上限」（塁+結果から機械的に導ける最大値） */
function rbiCeilingFromRules(before: Bases, result: string): number {
  const r = result.trim()
  const runners = (before.r1 ? 1 : 0) + (before.r2 ? 1 : 0) + (before.r3 ? 1 : 0)
  const hb = hitBases(r)
  if (hb === 4) return runners + 1
  if (/犠飛|犠牲フライ/.test(r)) return before.r3 ? 1 : 0
  if (hb === 3) return runners
  if (hb === 2) return (before.r3 ? 1 : 0) + (before.r2 ? 1 : 0) + (before.r1 ? 1 : 0)
  if (hb === 1) return (before.r3 ? 1 : 0) + (before.r2 ? 1 : 0) + (before.r1 ? 1 : 0)
  const explicit = r.match(/(\d+)点/)
  if (explicit) return parseInt(explicit[1]!, 10)
  return 0
}

function causeTag(before: Bases, result: string, credit: number): string {
  const r = result.trim()
  const hb = hitBases(r)
  const ceiling = rbiCeilingFromRules(before, r)
  if (credit > 0) return "credited"
  if (/(\d+)点/.test(r)) return "explicit_in_result_but_0?"
  if (hb === 2 && before.r1 && !before.r2 && !before.r3) return "2B_r1_only_no_credit"
  if (hb === 2 && before.r1) return "2B_r1_runner_no_credit"
  if (hb === 1 && before.r2 && !before.r3) return "1B_r2_runner_no_credit"
  if (hb === 1 && before.r1 && !before.r2 && !before.r3) return "1B_r1_only_no_credit"
  if (/タイムリー|適時打/.test(r) && credit === 0) return "timely_no_credit"
  if (/犠飛/.test(r) && before.r2 && !before.r3) return "SF_r2_not_r3"
  if (/四球|敬遠|死球/.test(r) && ceiling > 0) return "walk_hbp_forced_run?"
  if (ceiling > credit) return `ceiling_${ceiling}_got_${credit}`
  return "zero_expected"
}

type Row = {
  paId: string
  sitResult: string
  sitStart: string
  basesResult: string
  basesStart: string
  rbiResult: number
  rbiStart: number
  hb: number
  result: string
  line: string
  cause: string
}

function collectRows(yahooId: string): Row[] {
  const rows: Row[] = []
  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const pas = [...(doc.domain.plateAppearances ?? [])]
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === yahooId)
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
      const atResult = basesAtResultBallForSituationSplit(ctx, hybrid)
      if (!atResult || !hybrid) continue

      const rbiResult = rbiCreditFromPlayResult(atResult, result)
      const rbiStart = rbiCreditFromPlayResult(hybrid, result)
      const hb = hitBases(result)
      const cause = causeTag(atResult, result, rbiResult)

      if (rbiResult > 0 || rbiStart > 0 || /タイムリー|適時打|\d+点|本塁|２|2塁打|3塁打|犠飛/.test(result)) {
        rows.push({
          paId: pa.paId,
          sitResult: sitLabel(atResult),
          sitStart: sitLabel(hybrid),
          basesResult: basesStr(atResult),
          basesStart: basesStr(hybrid),
          rbiResult,
          rbiStart,
          hb,
          result: result.slice(0, 50),
          line: (playMap.get(pa.paId) ?? "").slice(0, 80),
          cause,
        })
      }
    }
  }
  return rows
}

function summarizeBySit(rows: Row[]): void {
  const bySit = new Map<string, { rbiResult: number; rbiStart: number; n: number }>()
  for (const r of rows) {
    const cur = bySit.get(r.sitResult) ?? { rbiResult: 0, rbiStart: 0, n: 0 }
    cur.rbiResult += r.rbiResult
    cur.rbiStart += r.rbiStart
    cur.n += 1
    bySit.set(r.sitResult, cur)
  }
  console.log("状況(resultBall) | 推定打点合計 | 開始塁推定 | 打点あり打席数")
  for (const [k, v] of [...bySit.entries()].sort()) {
    console.log(`${k.padEnd(16)} | ${String(v.rbiResult).padStart(10)} | ${String(v.rbiStart).padStart(10)} | ${v.n}`)
  }
}

function main(): void {
  const argYahoo = process.argv.find((a, i) => process.argv[i - 1] === "--yahoo")
  const ids = argYahoo ? [argYahoo] : Object.keys(TARGETS)

  for (const yid of ids) {
    const name = TARGETS[yid] ?? yid
    console.log(`\n${"=".repeat(72)}`)
    console.log(`${name} (yahoo_${yid})`)
    console.log("=".repeat(72))

    const rows = collectRows(yid)
    summarizeBySit(rows)

    const suspects = rows.filter(
      (r) =>
        r.cause.includes("no_credit") ||
        r.cause.includes("timely") ||
        r.cause.includes("SF_r2") ||
        r.cause.includes("walk_hbp") ||
        r.rbiResult !== r.rbiStart,
    )

    console.log(`\n--- 打点推定が0だが得点がありそうな打席 (${suspects.length}) ---`)
    for (const r of suspects) {
      console.log(
        `${r.paId} | sit=${r.sitResult}(${r.basesResult}) start=${r.sitStart}(${r.basesStart}) | rbi=${r.rbiResult}/${r.rbiStart} hb=${r.hb} | ${r.cause}`,
      )
      console.log(`  result: ${r.result}`)
      if (r.line) console.log(`  line:   ${r.line}`)
    }

    const credited = rows.filter((r) => r.rbiResult > 0)
    console.log(`\n--- 打点>0の打席 (${credited.length}) ---`)
    for (const r of credited) {
      console.log(
        `${r.paId} | ${r.sitResult}(${r.basesResult}) rbi=${r.rbiResult} hb=${r.hb} | ${r.result}`,
      )
    }
  }
}

main()
