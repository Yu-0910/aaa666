/** 一死一塁 + entry r1 + em/chain r2 + 犠打 → r2 の候補 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { extractSportsnaviSituationTokenFromPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
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
      const line = playMap.get(pa.paId) ?? ""
      const token = extractSportsnaviSituationTokenFromPlayLine(line)
      if (!ctx?.firstClass || !ctx.chainStart || !ctx.firstEm) continue
      if (token !== "一死一塁") continue
      if (!isR1(ctx.firstClass) || !isR2(ctx.chainStart) || !isR2(ctx.firstEm)) continue
      if (!/犠打|送りバント/.test(line)) continue
      console.log(
        `${yid}\t${pa.paId}\t${plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 16)}\tlast=${JSON.stringify(ctx.lastClass)}`,
      )
    }
  }
}
