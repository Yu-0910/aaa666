/**
 * 結果一球（pitch_pbp）+ 塁ソース別の状況別試算
 *
 *   npx tsx scripts/compute_batter_pa_start_pitch_pbp_situation.ts 1100082
 *   npx tsx scripts/compute_batter_pa_start_pitch_pbp_situation.ts 1100082 --score-only
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResultTextFromPitchOnly,
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
import { classifySituationAtPaStart, rbiCreditFromPlayResult, type Bases } from "../lib/yahooGame/paSituationSim"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

type RefRow = {
  pa: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  sh: number
  sf: number
}

/** スポナビ公式ランナー別（diag_* / verify 参照） */
const SPORTSNAVI_REF: Record<string, Record<string, RefRow>> = {
  "1100082": {
    none: { pa: 120, ab: 108, h: 23, hr: 0, so: 28, bb: 12, hbp: 0, sh: 0, sf: 0 },
    r1: { pa: 27, ab: 18, h: 6, hr: 1, so: 5, bb: 4, hbp: 0, sh: 5, sf: 0 },
    r2: { pa: 10, ab: 7, h: 2, hr: 0, so: 1, bb: 1, hbp: 0, sh: 2, sf: 0 },
    r3: { pa: 8, ab: 5, h: 1, hr: 0, so: 1, bb: 2, hbp: 0, sh: 0, sf: 1 },
    r12: { pa: 13, ab: 9, h: 2, hr: 1, so: 1, bb: 4, hbp: 0, sh: 0, sf: 0 },
    r13: { pa: 4, ab: 2, h: 0, hr: 0, so: 1, bb: 1, hbp: 0, sh: 1, sf: 0 },
    r23: { pa: 1, ab: 1, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    loaded: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  },
  "2112143": {
    none: { pa: 6, ab: 6, h: 0, hr: 0, so: 2, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r1: { pa: 3, ab: 2, h: 0, hr: 0, so: 1, bb: 0, hbp: 1, sh: 0, sf: 0 },
    r2: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r3: { pa: 1, ab: 1, h: 0, hr: 0, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r12: { pa: 1, ab: 1, h: 0, hr: 0, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r13: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r23: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    loaded: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  },
  "2000051": {
    none: { pa: 123, ab: 113, h: 41, hr: 0, so: 0, bb: 10, hbp: 0, sh: 0, sf: 0 },
    r1: { pa: 48, ab: 43, h: 14, hr: 0, so: 0, bb: 5, hbp: 0, sh: 0, sf: 0 },
    r2: { pa: 20, ab: 12, h: 6, hr: 0, so: 0, bb: 8, hbp: 0, sh: 0, sf: 0 },
    r3: { pa: 8, ab: 7, h: 3, hr: 0, so: 0, bb: 1, hbp: 0, sh: 0, sf: 0 },
    r12: { pa: 14, ab: 11, h: 6, hr: 0, so: 0, bb: 3, hbp: 0, sh: 0, sf: 0 },
    r13: { pa: 4, ab: 3, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    r23: { pa: 3, ab: 3, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    loaded: { pa: 5, ab: 4, h: 2, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  },
}

const NAME: Record<string, string> = {
  "1100082": "広島・菊池涼介",
  "2000066": "広島・二俣翔一",
  "2112143": "広島・佐藤啓介",
  "2000051": "阪神・佐藤輝明",
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

const SIT_KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const
const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const

type BasesMode = "illustration" | "score_only"

function basesAtPaStart(
  mode: BasesMode,
  ctx: ScoreBasesContext | null | undefined,
  playLine: string,
  pa: { baseBefore?: unknown },
): Bases | null {
  if (mode === "score_only") {
    return ctx?.firstClass ?? null
  }
  return basesBeforeFromScoreIllustration(ctx, playLine, pa)
}

function aggregate(yahooId: string, basesMode: BasesMode): {
  bySit: Map<string, BattingSeasonAggYahoo>
  totalPa: number
  countedPa: number
  noPitch: number
  noTerminal: number
  noBases: number
} {
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let countedPa = 0
  let noPitch = 0
  let noTerminal = 0
  let noBases = 0

  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === yahooId)
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
      totalPa++
      const hasPitch = (pa.pitchEvents ?? []).length > 0
      const result = plateAppearanceResultTextFromPitchOnly(pa).trim()
      if (!hasPitch) noPitch++
      if (hasPitch && !result) noTerminal++

      const basesBefore = basesAtPaStart(basesMode, scoreCtx.get(pa.paId), "", pa)
      if (!basesBefore) {
        noBases++
        continue
      }
      if (!result) continue

      countedPa++
      const rbiCredit = rbiCreditFromPlayResult(basesBefore, result)
      const { detail } = classifySituationAtPaStart(basesBefore)
      const agg = bySit.get(detail) ?? emptyBattingSeasonAggYahoo()
      agg.gameIds.add(doc.gameId)
      agg.pa += 1
      updateBattingAggFromResultJa(agg, result)
      agg.rbi += rbiCredit
      bySit.set(detail, agg)
    }
  }

  return { bySit, totalPa, countedPa, noPitch, noTerminal, noBases }
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const scoreOnly = process.argv.includes("--score-only")
  const yahooId = (args[0] ?? "1100082").trim()
  const basesMode: BasesMode = scoreOnly ? "score_only" : "illustration"
  const refBySit = SPORTSNAVI_REF[yahooId]
  if (!refBySit) {
    console.error(`REF 未定義: ${yahooId}`)
    process.exit(1)
  }

  const r = aggregate(yahooId, basesMode)
  let l1All = 0
  const diffs: string[] = []

  console.log(`${NAME[yahooId] ?? yahooId} (yahoo_${yahooId}) — 結果一球 + 塁${scoreOnly ? "（一球入口イラストのみ）" : "（score_illustration）"}`)
  console.log(
    scoreOnly
      ? "設定: 塁=一球速報 score 入口 #base class のみ（実況・補正なし） / 結果=一球決着 resultJa のみ\n"
      : "設定: 塁=score_illustration（イラスト+実況補正） / 結果=一球決着 resultJa のみ\n",
  )
  console.log(
    `打席数: ${r.totalPa} | 集計対象: ${r.countedPa} | 一球ログなし: ${r.noPitch} | 決着パース不可: ${r.noTerminal} | 打席開始塁不明: ${r.noBases}\n`,
  )

  console.log("状況 | 集計 PA AB H HR SO BB HBP SH SF | 公式 PA AB H HR SO BB HBP SH SF")
  console.log("-----|--------------------------------|--------------------------------")
  for (const k of SIT_KEYS) {
    const a = r.bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const ref = refBySit[k]!
    const got = STAT_KEYS.map((sk) => a[sk]).join(" ")
    const sn = STAT_KEYS.map((sk) => ref[sk]).join(" ")
    console.log(`${LABEL[k] ?? k} | ${got} | ${sn}`)
    for (const sk of STAT_KEYS) {
      const d = a[sk] - ref[sk]
      l1All += Math.abs(d)
      if (d !== 0) diffs.push(`${LABEL[k]} ${sk.toUpperCase()}${d >= 0 ? "+" : ""}${d}`)
    }
  }

  console.log(`\nL1(全指標) vs スポナビ = ${l1All}`)
  if (diffs.length) console.log(`差分: ${diffs.join(", ")}`)
  else console.log("全指標: スポナビ公式と完全一致")
}

main()
