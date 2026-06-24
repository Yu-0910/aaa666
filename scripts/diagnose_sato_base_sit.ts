/**
 * 佐藤輝明 (2000051) ランナー別成績と参照値の差分
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { basesBeforeFromSportsnaviPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import {
  classifySituationAtPaStart,
  emptyGameState,
  applyPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { emptyBattingSeasonAggYahoo, updateBattingAggFromPa } from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const Y = "2000051"

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

function halfKey(paId: string): string | null {
  const p = paId.split("-")
  if (p.length < 4) return null
  return `${p[p.length - 3]}-${p[p.length - 2]}`
}

function aggSit(useText: boolean) {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const by = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  const add = (k: string, doc: typeof docs[0], pa: Parameters<typeof updateBattingAggFromPa>[2], b: Bases) => {
    const agg = by.get(k) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, doc.gameId, pa, doc, b)
    by.set(k, agg)
  }
  for (const doc of docs) {
    const lines = buildPaIdToSportsnaviPlayLineMap(doc)
    const pas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) => a.paId.localeCompare(b.paId))
    const groups = new Map<string, typeof pas>()
    for (const pa of pas) {
      const hk = halfKey(pa.paId)
      if (!hk) continue
      const g = groups.get(hk) ?? []
      g.push(pa)
      groups.set(hk, g)
    }
    for (const [, groupPas] of groups) {
      let state = emptyGameState()
      for (const pa of groupPas) {
        const bid = (pa.yahooBatterId ?? "").trim()
        if (bid !== Y) {
          state = applyPlayResult(state, plateAppearanceResolvedResultText(doc, pa))
          continue
        }
        const textB = useText ? basesBeforeFromSportsnaviPlayLine(lines.get(pa.paId)) : null
        const b = textB ?? state.b
        const { detail, risp } = classifySituationAtPaStart(b)
        add(detail, doc, pa, b)
        if (risp) add("risp", doc, pa, b)
        if (!risp) add("no_risp", doc, pa, b)
        state = applyPlayResult(state, plateAppearanceResolvedResultText(doc, pa))
      }
    }
  }
  return by
}

const text = aggSit(true)
const sim = aggSit(false)

console.log("=== textPlayByPlay bases (new) ===")
for (const k of Object.keys(REF)) {
  const r = REF[k]
  const g = text.get(k)
  const pa = g?.pa ?? 0
  const d = pa - r.pa
  if (d !== 0 || (g?.ab ?? 0) !== r.ab || (g?.h ?? 0) !== r.h) {
    console.log(
      `${k}: PA ${pa}(${d >= 0 ? "+" : ""}${d}) AB ${g?.ab} H ${g?.h} BB ${g?.bb} RBI ${g?.rbi} | ref PA${r.pa} AB${r.ab} H${r.h}`,
    )
  }
}

console.log("\n=== text: all keys ===")
for (const k of ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"]) {
  const r = REF[k]
  const g = text.get(k)
  console.log(`${k}: PA ${g?.pa ?? 0} AB ${g?.ab ?? 0} H ${g?.h ?? 0} BB ${g?.bb ?? 0} | ref PA${r.pa} AB${r.ab}`)
}

let withLine = 0
let noLine = 0
for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
  const lines = buildPaIdToSportsnaviPlayLineMap(doc)
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== Y) continue
    if (lines.get(pa.paId)) withLine++
    else noLine++
  }
}
console.log(`\nSato PA with text line: ${withLine}, without: ${noLine}`)

console.log("\n=== sim only (old) ===")
for (const k of Object.keys(REF)) {
  const r = REF[k]
  const g = sim.get(k)
  const pa = g?.pa ?? 0
  const d = pa - r.pa
  if (d !== 0 || (g?.ab ?? 0) !== r.ab) {
    console.log(`${k}: PA ${pa}(${d >= 0 ? "+" : ""}${d}) AB ${g?.ab} | ref PA${r.pa}`)
  }
}
