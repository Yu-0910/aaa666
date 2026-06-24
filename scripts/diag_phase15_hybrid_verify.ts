/**
 * Phase15 結果球（resultBallClass）集計の平川・佐藤検証
 * npx tsx scripts/diag_phase15_hybrid_verify.ts
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesAtResultBallForSituationSplit,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  classifySituationAtPaStart,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

type RefRow = { pa: number; ab: number }

const REF: Record<string, Record<string, RefRow>> = {
  /** 平川蓮: スポナビ 塁状況別成績（結果球時点・2026） */
  "2110164": {
    none: { pa: 56, ab: 53 },
    r1: { pa: 19, ab: 18 },
    r2: { pa: 9, ab: 9 },
    r3: { pa: 3, ab: 3 },
    r12: { pa: 8, ab: 8 },
    r13: { pa: 1, ab: 1 },
    r23: { pa: 3, ab: 1 },
    loaded: { pa: 3, ab: 2 },
  },
  "2000051": {
    none: { pa: 123, ab: 113 },
    r1: { pa: 48, ab: 43 },
    r2: { pa: 20, ab: 12 },
    r3: { pa: 8, ab: 7 },
    r12: { pa: 14, ab: 11 },
    r13: { pa: 4, ab: 3 },
    r23: { pa: 3, ab: 3 },
    loaded: { pa: 5, ab: 4 },
  },
}

const AB_EXCL =
  /四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出/

function stripBrackets(s: string): string {
  return s.replace(/\[[^\]]*\]/g, "")
}

function statFromResult(result: string): { pa: number; ab: number } {
  const r = stripBrackets(result.trim())
  return { pa: 1, ab: AB_EXCL.test(r) ? 0 : 1 }
}

function l1PaAb(
  got: Map<string, { pa: number; ab: number }>,
  ref: Record<string, RefRow>,
): number {
  let d = 0
  for (const [k, r] of Object.entries(ref)) {
    const g = got.get(k) ?? { pa: 0, ab: 0 }
    d += Math.abs(g.pa - r.pa) + Math.abs(g.ab - r.ab)
  }
  return d
}

function aggregateResultBall(yahooId: string): Map<string, { pa: number; ab: number }> {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const agg = new Map<string, { pa: number; ab: number }>()

  for (const doc of docs) {
    const pas = [...(doc.domain.plateAppearances ?? [])]
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === yahooId)
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
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue
      const ctx = scoreCtx.get(pa.paId)
      const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playMap.get(pa.paId), ctx)
      const basesForSit = basesAtResultBallForSituationSplit(ctx, hybrid)
      if (!basesForSit) continue
      const { detail } = classifySituationAtPaStart(basesForSit)
      const st = statFromResult(result)
      const cur = agg.get(detail) ?? { pa: 0, ab: 0 }
      cur.pa += st.pa
      cur.ab += st.ab
      agg.set(detail, cur)
    }
  }
  return agg
}

function readDerived(yahooId: string): Map<string, { pa: number; ab: number }> | null {
  const p = join(
    root,
    "_data/derived/player_season_batting_splits/2026",
    `yahoo_${yahooId}.json`,
  )
  if (!existsSync(p)) return null
  const j = JSON.parse(readFileSync(p, "utf8")) as {
    rows: Array<{ split_type: string; split_value: string; pa: number; ab: number }>
  }
  const out = new Map<string, { pa: number; ab: number }>()
  for (const r of j.rows) {
    if (r.split_type !== "base_sit") continue
    out.set(r.split_value, { pa: r.pa, ab: r.ab })
  }
  return out
}

function printTable(
  title: string,
  got: Map<string, { pa: number; ab: number }>,
  ref: Record<string, RefRow>,
): number {
  const d = l1PaAb(got, ref)
  console.log(`\n${title}  L1(PA+AB)=${d}`)
  console.log("条件   | PA ref got dPA | AB ref got dAB")
  for (const [k, r] of Object.entries(ref)) {
    const g = got.get(k) ?? { pa: 0, ab: 0 }
    const dp = g.pa - r.pa
    const da = g.ab - r.ab
    if (dp || da) {
      console.log(
        `${k.padEnd(6)} | ${String(r.pa).padStart(3)} ${String(g.pa).padStart(3)} ${(dp >= 0 ? "+" : "") + dp} | ` +
          `${String(r.ab).padStart(3)} ${String(g.ab).padStart(3)} ${(da >= 0 ? "+" : "") + da}`,
      )
    }
  }
  return d
}

function main(): void {
  for (const [yahooId, ref] of Object.entries(REF)) {
    console.log(`\n======== yahoo_${yahooId} ========`)
    const resultBall = aggregateResultBall(yahooId)
    printTable("resultBallClass (in-memory)", resultBall, ref)
    const derived = readDerived(yahooId)
    if (derived) printTable("phase15 derived", derived, ref)
    else console.log("phase15 derived: (file not found yet)")
  }
}

main()
