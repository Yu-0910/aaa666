/**
 * 二俣: score_illustration vs hybrid の塁差分
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
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

function main(): void {
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
      const scoreB = basesBeforeFromScoreIllustration(ctx)
      const hybridB = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      const sk = scoreB ? classifySituationAtPaStart(scoreB).detail : "?"
      const hk = hybridB ? classifySituationAtPaStart(hybridB).detail : "?"
      if (sk === hk) continue
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      console.log(
        [
          pa.paId,
          `score=${sk}`,
          `hybrid=${hk}`,
          token,
          `first=${JSON.stringify(ctx?.firstClass)}`,
          `chain=${JSON.stringify(ctx?.chainStart)}`,
          `em=${JSON.stringify(ctx?.firstEm)}`,
          result.slice(0, 30),
        ].join("\t"),
      )
    }
  }
}

main()
