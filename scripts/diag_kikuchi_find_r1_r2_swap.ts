/**
 * 菊池 L1=2: どの打席を r1↔r2 に動かせばスポナビ REF と一致するか
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { fileURLToPath } from "url"
import { join } from "path"

const YAHOO = "1100082"
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const REF: Record<string, number> = {
  none: 120, r1: 27, r2: 10, r3: 8, r12: 13, r13: 4, r23: 1, loaded: 1,
}
const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const

type PaRec = { paId: string; key: string; token: string; result: string; first: string; chain: string }

const pas: PaRec[] = []
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
    const playLine = playMap.get(pa.paId) ?? ""
    const ctx = scoreCtx.get(pa.paId)
    const b = basesBeforeFromScoreIllustration(ctx, playLine, pa)
    if (!b || !plateAppearanceResolvedResultText(doc, pa).trim()) continue
    const key = classifySituationAtPaStart(b).detail
    const token = playLine.match(/^(無死|一死|二死|三死)[^\s]*/)?.[0] ?? playLine.slice(0, 30)
    pas.push({
      paId: pa.paId,
      key,
      token: playLine.split(/\s+/).find((t) => /^(無死|一死|二死|三死)/.test(t)) ?? "-",
      result: plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 20),
      first: JSON.stringify(ctx?.firstClass),
      chain: JSON.stringify(ctx?.chainStart),
    })
  }
}

function l1(counts: Map<string, number>): number {
  let d = 0
  for (const k of KEYS) d += Math.abs((counts.get(k) ?? 0) - REF[k])
  return d
}

function baseCounts(): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pas) m.set(p.key, (m.get(p.key) ?? 0) + 1)
  return m
}

console.log("baseline L1", l1(baseCounts()))
console.log("\n--- r1→r2 に1打席動かすと L1=0 になる候補 ---")
for (const p of pas.filter((x) => x.key === "r1")) {
  const m = baseCounts()
  m.set("r1", m.get("r1")! - 1)
  m.set("r2", (m.get("r2") ?? 0) + 1)
  if (l1(m) === 0) {
    console.log(p.paId, p.token, p.result, "first", p.first, "chain", p.chain)
  }
}

console.log("\n--- r2→r1 に1打席動かすと L1=0 になる候補 ---")
for (const p of pas.filter((x) => x.key === "r2")) {
  const m = baseCounts()
  m.set("r2", m.get("r2")! - 1)
  m.set("r1", (m.get("r1") ?? 0) + 1)
  if (l1(m) === 0) {
    console.log(p.paId, p.token, p.result, "first", p.first, "chain", p.chain)
  }
}
