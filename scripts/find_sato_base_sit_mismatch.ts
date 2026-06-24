import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { getProjectRoot } from "../lib/projectRoot"

const Y = "2000051"
const docs = loadCanonicalGamesMergedForDerivedPipeline(getProjectRoot())

for (const doc of docs) {
  const lines = buildPaIdToSportsnaviPlayLineMap(doc)
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== Y) continue
    const line = lines.get(pa.paId)
    const b = basesBeforeFromSportsnaviPlayLine(line)
    if (!b) continue
    const { detail } = classifySituationAtPaStart(b)
    const tok = extractSportsnaviSituationTokenFromPlayLine(line ?? "") ?? ""
    if (detail === "r1" && /二塁|三塁|一二|一三|二三|満/.test(tok) && !/^一死一塁$|^二死一塁$|^無死一塁$|^一死一塁$/.test(tok)) {
      console.log(detail, tok, pa.paId)
      console.log(" ", (line ?? "").slice(0, 100))
    }
    if (detail === "r2" && !/二塁/.test(tok)) {
      console.log("r2?", tok, pa.paId)
    }
  }
}
