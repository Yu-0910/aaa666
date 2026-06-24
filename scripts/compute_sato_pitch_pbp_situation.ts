/**
 * 佐藤輝明のみ: 塁＝一球速報シミュ（打席結果でイニング内走者を更新）、結果＝一球決着 resultJa。
 *
 *   npx tsx scripts/compute_sato_pitch_pbp_situation.ts
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResultTextFromPitchOnly,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
  rbiCreditFromPlayResult,
} from "../lib/yahooGame/paSituationSim"
import type { PlateAppearance } from "../lib/yahooGame/types"
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
  let noPitch = 0
  let noTerminal = 0

  for (const doc of docs) {
    const pas = [...(doc.domain.plateAppearances ?? [])].sort(comparePlateAppearances)
    const halfGroups = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa)
      halfGroups.set(hk, list)
    }

    let gameInferred = 0

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
        }

        if (result) state = applyPlayResult(state, result)
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

  console.log("佐藤輝明 (yahoo_2000051) — 塁・結果とも一球速報 (pitch_pbp)")
  console.log(
    `打席数: ${totalPa} | 一球ログなし: ${noPitch} | 一球あり・決着パース不可: ${noTerminal}\n`,
  )

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
