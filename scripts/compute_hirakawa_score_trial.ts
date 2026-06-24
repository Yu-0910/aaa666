/**
 * 平川蓮: score を塁定義に入れた試算（再取得不要・既存 raw_sportsnavi_score 使用）
 *
 *   npx tsx scripts/compute_hirakawa_score_trial.ts
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
  basesBeforeForPlateAppearance,
  extractSportsnaviSituationTokenFromPlayLine,
  basesFromSportsnaviSituationToken,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { slashRate3FromCounts } from "../lib/battingRateFormat"
import { fileURLToPath } from "url"
import { join } from "path"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"

/** 個人ページ・ユーザー提示の正常値（2026） */
const REF: Record<
  string,
  { pa: number; ab: number; h: number; so: number; bb: number; hbp: number; sh: number; rbi: number }
> = {
  none: { pa: 51, ab: 48, h: 6, so: 19, bb: 2, hbp: 1, sh: 0, rbi: 0 },
  r1: { pa: 18, ab: 17, h: 6, so: 3, bb: 0, hbp: 0, sh: 1, rbi: 0 },
  r2: { pa: 8, ab: 8, h: 1, so: 4, bb: 0, hbp: 0, sh: 0, rbi: 1 },
  r3: { pa: 3, ab: 3, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, rbi: 2 },
  r12: { pa: 8, ab: 8, h: 1, so: 3, bb: 0, hbp: 0, sh: 0, rbi: 2 },
  r13: { pa: 1, ab: 1, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, rbi: 2 },
  r23: { pa: 2, ab: 1, h: 0, so: 1, bb: 1, hbp: 0, sh: 0, rbi: 0 },
  loaded: { pa: 3, ab: 2, h: 1, so: 0, bb: 1, hbp: 0, sh: 0, rbi: 3 },
}

const DETAIL_KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const
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

type ModeFn = (doc: CanonicalGameDocument, pa: PlateAppearance, ctx: ModeCtx) => Bases | null

type ModeCtx = {
  playMap: Map<string, string>
  chainStart: Map<string, Bases | null>
  snapshots: ReturnType<typeof loadSportsnaviScoreSnapshots>
}

function halfKey(paId: string): string | null {
  const p = parsePaId(paId)
  if (!p) return null
  return `${p.inning}-${p.half}`
}

function addPa(agg: BattingSeasonAggYahoo, gameId: string, result: string, rbiCredit: number): void {
  agg.gameIds.add(gameId)
  agg.pa += 1
  updateBattingAggFromResultJa(agg, result)
  agg.rbi += rbiCredit
}

function dist(stats: Map<string, BattingSeasonAggYahoo>): number {
  let d = 0
  for (const k of DETAIL_KEYS) {
    const a = stats.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]
    d += Math.abs(a.pa - r.pa) + Math.abs(a.ab - r.ab) + Math.abs(a.h - r.h)
  }
  return d
}

const modes: Record<string, ModeFn> = {
  phase15_text: (doc, pa, ctx) => basesBeforeForPlateAppearance(pa, ctx.playMap.get(pa.paId)),
  score_chain: (_doc, pa, ctx) => ctx.chainStart.get(pa.paId) ?? null,
  score_first: (_doc, pa, ctx) => {
    const prefix = scoreIndexPrefixForPaId(pa.paId)
    const html = prefix ? firstSnapshotHtmlForPaPrefix(prefix, ctx.snapshots) : null
    return html ? basesFromScoreHtmlBaseClass(html) : null
  },
  text_or_score_first: (doc, pa, ctx) => {
    const line = ctx.playMap.get(pa.paId) ?? ""
    const tok = extractSportsnaviSituationTokenFromPlayLine(line)
    if (tok) {
      const b = basesFromSportsnaviSituationToken(tok)
      if (b) return b
    }
    const prefix = scoreIndexPrefixForPaId(pa.paId)
    const html = prefix ? firstSnapshotHtmlForPaPrefix(prefix, ctx.snapshots) : null
    return html ? basesFromScoreHtmlBaseClass(html) : null
  },
}

function runMode(name: string, pickBases: ModeFn) {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let noBases = 0
  let noResult = 0

  for (const doc of docs) {
    const target = (doc.domain.plateAppearances ?? []).filter(
      (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
    )
    if (target.length === 0) continue

    const snapshots = loadSportsnaviScoreSnapshots(root, doc.gameId)
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
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
    const chainStart = new Map<string, Bases | null>()
    for (const [, ids] of halfGroups) {
      const m = buildPaStartBasesFromScoreSnapshots(ids, snapshots)
      for (const [id, b] of m) chainStart.set(id, b)
    }
    const ctx: ModeCtx = { playMap, chainStart, snapshots }

    for (const pa of target) {
      totalPa++
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) {
        noResult++
        continue
      }
      const basesBefore = pickBases(doc, pa, ctx)
      if (!basesBefore) {
        noBases++
        continue
      }
      const rbiCredit = rbiCreditFromPlayResult(basesBefore, result)
      const { detail } = classifySituationAtPaStart(basesBefore)
      const agg = bySit.get(detail) ?? emptyBattingSeasonAggYahoo()
      addPa(agg, doc.gameId, result, rbiCredit)
      bySit.set(detail, agg)
    }
  }

  return { name, bySit, totalPa, noBases, noResult, dist: dist(bySit) }
}

function main(): void {
  console.log("平川蓮 (yahoo_2110164) — score 試算 vs 正常値")
  console.log("塁: 各モード / 結果: plateAppearanceResolvedResultText（出場成績）\n")

  const results = Object.entries(modes).map(([name, fn]) => runMode(name, fn))
  results.sort((a, b) => a.dist - b.dist)

  console.log("=== モード比較（L1 = |PA|+|AB|+|H| の合計、小さいほど近い）===\n")
  console.log("mode                  L1   noBases  noResult  PA合計")
  for (const r of results) {
    const paSum = DETAIL_KEYS.reduce((s, k) => s + (r.bySit.get(k)?.pa ?? 0), 0)
    console.log(
      `${r.name.padEnd(22)} ${String(r.dist).padStart(4)} ${String(r.noBases).padStart(8)} ${String(r.noResult).padStart(9)} ${String(paSum).padStart(7)}`,
    )
  }

  const best = results[0]!
  console.log(`\n=== 最良モード: ${best.name} (L1=${best.dist}) ===\n`)
  console.log("条件   | PA  ref  Δ  | AB  ref  Δ  | H  ref  Δ  | SO ref Δ | AVG")
  console.log("-------|-------------|-------------|-----------|----------|-----")
  for (const k of DETAIL_KEYS) {
    const a = best.bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]
    const avg = slashRate3FromCounts(a.h, a.ab)
    console.log(
      `${LABEL[k]!.padEnd(6)} | ${String(a.pa).padStart(3)} ${String(r.pa).padStart(3)} ${(a.pa - r.pa >= 0 ? "+" : "") + (a.pa - r.pa)} | ` +
        `${String(a.ab).padStart(3)} ${String(r.ab).padStart(3)} ${(a.ab - r.ab >= 0 ? "+" : "") + (a.ab - r.ab)} | ` +
        `${String(a.h).padStart(2)} ${String(r.h).padStart(2)} ${(a.h - r.h >= 0 ? "+" : "") + (a.h - r.h)} | ` +
        `${String(r.so).padStart(2)} ${(a.so - r.so >= 0 ? "+" : "") + (a.so - r.so)} | ${avg}`,
    )
  }

  const phase15 = results.find((r) => r.name === "phase15_text")!
  console.log(`\n=== 参考: 現行 Phase15 相当 (phase15_text) L1=${phase15.dist} ===\n`)
  for (const k of DETAIL_KEYS) {
    const a = phase15.bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]
    if (a.pa !== r.pa || a.ab !== r.ab || a.h !== r.h) {
      console.log(
        `  ${LABEL[k]}: PA ${a.pa}→${r.pa}  AB ${a.ab}→${r.ab}  H ${a.h}→${r.h}`,
      )
    }
  }
}

main()
