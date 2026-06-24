/**
 * 二俣: 状況別 PA カウントをソース別に集計し REF と比較
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  basesBeforeForPlateAppearanceHybrid,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000066"

const REF: Record<string, number> = {
  none: 26, r1: 11, r2: 3, r3: 2, r12: 2, r13: 2, r23: 1, loaded: 0,
}

function add(m: Map<string, number>, key: string): void {
  m.set(key, (m.get(key) ?? 0) + 1)
}

function main(): void {
  const sources = ["text", "score", "hybrid"] as const
  const aggs = Object.fromEntries(sources.map((s) => [s, new Map<string, number>()])) as Record<
    (typeof sources)[number],
    Map<string, number>
  >
  const textVsRef: string[] = []

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
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue

      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const scoreB = basesBeforeFromScoreIllustration(scoreCtx.get(pa.paId))
      const hybridB = basesBeforeForPlateAppearanceHybrid(pa, playLine, scoreCtx.get(pa.paId))

      const textK = textB ? classifySituationAtPaStart(textB).detail : "?"
      const scoreK = scoreB ? classifySituationAtPaStart(scoreB).detail : "?"
      const hybridK = hybridB ? classifySituationAtPaStart(hybridB).detail : "?"

      add(aggs.text, textK)
      add(aggs.score, scoreK)
      add(aggs.hybrid, hybridK)

      const refKeys = Object.keys(REF)
      // list PAs where text matches score but differs from what we'd need for ref
      if (textK === scoreK && textK !== "?") {
        // no-op
      }
    }
  }

  console.log("=== PA count by source vs REF ===")
  for (const s of sources) {
    const parts: string[] = []
    let l1 = 0
    for (const [k, r] of Object.entries(REF)) {
      const g = aggs[s]!.get(k) ?? 0
      l1 += Math.abs(g - r)
      if (g !== r) parts.push(`${k}: got ${g} ref ${r} (${g - r >= 0 ? "+" : ""}${g - r})`)
    }
    console.log(`\n${s} L1=${l1}`)
    for (const p of parts) console.log(`  ${p}`)
  }

  // Per-PA listing for r1 and r2
  console.log("\n=== 全打席 (text=score の状況キー) ===")
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
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const k = textB ? classifySituationAtPaStart(textB).detail : "?"
      if (k !== "r1" && k !== "r2") continue
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      const ctx = scoreCtx.get(pa.paId)
      console.log(
        `${pa.paId}\t${k}\t${token}\tfirst=${JSON.stringify(ctx?.firstClass)}\t${result.slice(0, 28)}`,
      )
    }
  }
}

main()
