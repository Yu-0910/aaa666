/**
 * 広島・佐藤啓介: 結果＝一球決着 resultJa（pitch_pbp）
 *
 *   npx tsx scripts/compute_sato_keisuke_pitch_pbp_situation.ts           # 半回シミュ（旧）
 *   npx tsx scripts/compute_sato_keisuke_pitch_pbp_situation.ts --start  # 打席開始時（score_illustration）
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
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
  rbiCreditFromPlayResult,
} from "../lib/yahooGame/paSituationSim"
import type { PlateAppearance } from "../lib/yahooGame/types"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2112143"

/** スポナビ公式ランナー別（diag_sato_keisuke_hybrid / verify 参照） */
const REF: Record<string, { pa: number; ab: number; h: number; bb: number; rbi: number }> = {
  none: { pa: 6, ab: 6, h: 0, bb: 0, rbi: 0 },
  r1: { pa: 3, ab: 2, h: 0, bb: 1, rbi: 0 },
  r2: { pa: 0, ab: 0, h: 0, bb: 0, rbi: 0 },
  r3: { pa: 1, ab: 1, h: 0, bb: 0, rbi: 0 },
  r12: { pa: 1, ab: 1, h: 0, bb: 0, rbi: 0 },
  r13: { pa: 0, ab: 0, h: 0, bb: 0, rbi: 0 },
  r23: { pa: 1, ab: 1, h: 0, bb: 0, rbi: 0 },
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

const SIT_KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const

function parsePaId(paId: string): { inning: number; half: number; seq: number } | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parseInt(parts[parts.length - 3]!, 10)
  const halfStr = parts[parts.length - 2]!
  const seq = parseInt(parts[parts.length - 1]!, 10)
  if (!Number.isFinite(inning) || !Number.isFinite(seq)) return null
  const half = halfStr === "表" ? 0 : halfStr === "裏" ? 1 : 9
  return { inning, half, seq }
}

function comparePlateAppearances(a: PlateAppearance, b: PlateAppearance): number {
  const pa = parsePaId(a.paId)
  const pb = parsePaId(b.paId)
  if (pa && pb) {
    if (pa.inning !== pb.inning) return pa.inning - pb.inning
    if (pa.half !== pb.half) return pa.half - pb.half
    return pa.seq - pb.seq
  }
  return (a.paId ?? "").localeCompare(b.paId ?? "")
}

function halfKeyFromPaId(paId: string): string | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parts[parts.length - 3]!
  const halfStr = parts[parts.length - 2]!
  if (halfStr !== "表" && halfStr !== "裏") return null
  return `${inning}-${halfStr}`
}

function compareHalfKeys(a: string, b: string): number {
  const [ia, ta] = a.split("-")
  const [ib, tb] = b.split("-")
  const nia = parseInt(ia!, 10) || 0
  const nib = parseInt(ib!, 10) || 0
  if (nia !== nib) return nia - nib
  const oa = ta === "表" ? 0 : 1
  const ob = tb === "表" ? 0 : 1
  return oa - ob
}

function aggregatePitchPbpSim(): {
  bySit: Map<string, BattingSeasonAggYahoo>
  totalPa: number
  countedPa: number
  noPitch: number
  noTerminal: number
} {
  const bySit = new Map<string, BattingSeasonAggYahoo>()
  let totalPa = 0
  let countedPa = 0
  let noPitch = 0
  let noTerminal = 0

  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const pas = [...(doc.domain.plateAppearances ?? [])].sort(comparePlateAppearances)
    const halfGroups = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa)
      halfGroups.set(hk, list)
    }

    for (const hk of [...halfGroups.keys()].sort(compareHalfKeys)) {
      let state = emptyGameState()
      for (const pa of halfGroups.get(hk) ?? []) {
        const basesBefore = { r1: state.b.r1, r2: state.b.r2, r3: state.b.r3 }
        const result = plateAppearanceResultTextFromPitchOnly(pa).trim()
        const hasPitch = (pa.pitchEvents ?? []).length > 0

        if ((pa.yahooBatterId ?? "").trim() === YAHOO) {
          totalPa++
          if (!hasPitch) noPitch++
          if (hasPitch && !result) noTerminal++

          if (result) {
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

        if (result) state = applyPlayResult(state, result)
      }
    }
  }

  return { bySit, totalPa, countedPa, noPitch, noTerminal }
}

function aggregatePaStartScoreIllustration(): {
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
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
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
      totalPa++
      const hasPitch = (pa.pitchEvents ?? []).length > 0
      const result = plateAppearanceResultTextFromPitchOnly(pa).trim()
      if (!hasPitch) noPitch++
      if (hasPitch && !result) noTerminal++

      const playLine = playMap.get(pa.paId) ?? ""
      const basesBefore = basesBeforeFromScoreIllustration(scoreCtx.get(pa.paId), playLine, pa)
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

function printReport(
  title: string,
  note: string,
  bySit: Map<string, BattingSeasonAggYahoo>,
  stats: { totalPa: number; countedPa: number; noPitch: number; noTerminal: number; noBases?: number },
): void {
  let l1 = 0
  const diffs: string[] = []
  for (const k of SIT_KEYS) {
    const d = (bySit.get(k)?.pa ?? 0) - REF[k]!.pa
    l1 += Math.abs(d)
    if (d !== 0) diffs.push(`${LABEL[k]}: ${d >= 0 ? "+" : ""}${d}`)
  }

  console.log(title)
  console.log(note)
  const extra = stats.noBases != null ? ` | 打席開始塁不明: ${stats.noBases}` : ""
  console.log(
    `打席数: ${stats.totalPa} | 集計対象: ${stats.countedPa} | 一球ログなし: ${stats.noPitch} | 決着パース不可: ${stats.noTerminal}${extra}\n`,
  )

  console.log("状況 | PA | AB | H | BB | SO | HBP | 参照PA | ΔPA")
  console.log("-----|----|----|---|----|----|-----|--------|----")
  for (const k of SIT_KEYS) {
    const a = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const dPa = a.pa - r.pa
    console.log(
      `${LABEL[k] ?? k} | ${a.pa} | ${a.ab} | ${a.h} | ${a.bb} | ${a.so} | ${a.hbp} | ${r.pa} | ${dPa >= 0 ? "+" : ""}${dPa}`,
    )
  }

  console.log(`\nL1(PA) vs スポナビ = ${l1}`)
  if (diffs.length) console.log(`差分: ${diffs.join(", ")}`)
  else console.log("差分: なし（PA完全一致）")
}

function main(): void {
  const paStart = process.argv.includes("--start")

  if (paStart) {
    const r = aggregatePaStartScoreIllustration()
    printReport(
      "広島・佐藤啓介 (yahoo_2112143) — 打席開始時 + 結果一球 (score_illustration + pitch_pbp)",
      "設定: 塁=一球速報入口イラスト+補正（打席開始時） / 結果=一球決着 resultJa のみ\n",
      r.bySit,
      r,
    )
    return
  }

  const r = aggregatePitchPbpSim()
  printReport(
    "広島・佐藤啓介 (yahoo_2112143) — 半回シミュ + 結果一球 (pitch_pbp_sim)",
    "設定: 塁=半回内を一球 resultJa でシミュ / 結果=一球決着 resultJa のみ\n",
    r.bySit,
    r,
  )
}

main()
