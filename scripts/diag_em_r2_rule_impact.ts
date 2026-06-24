/**
 * firstClass=r1 & chain=em=r2 → r2 ルールの影響範囲
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { basesBeforeFromScoreIllustration } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const IDS = ["1100082", "2000066", "2112143", "2000051"]

function isR1(b: { r1: boolean; r2: boolean; r3: boolean }) {
  return b.r1 && !b.r2 && !b.r3
}
function isR2(b: { r1: boolean; r2: boolean; r3: boolean }) {
  return !b.r1 && b.r2 && !b.r3
}

for (const yid of IDS) {
  let hits = 0
  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of allPas.filter((p) => (p.yahooBatterId ?? "").trim() === yid)) {
      const ctx = scoreCtx.get(pa.paId)
      if (!ctx?.firstClass || !ctx.chainStart || !ctx.firstEm) continue
      if (!isR1(ctx.firstClass) || !isR2(ctx.chainStart) || !isR2(ctx.firstEm)) continue
      const before = classifySituationAtPaStart(
        basesBeforeFromScoreIllustration(ctx, playMap.get(pa.paId), pa)!,
      ).detail
      if (before === "r1") {
        hits++
        console.log(
          `${yid}\t${pa.paId}\tlast=${JSON.stringify(ctx.lastClass)}\t${before}→r2\t${plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 20)}`,
        )
      }
    }
  }
  console.log(`--- ${yid} would change: ${hits}\n`)
}
