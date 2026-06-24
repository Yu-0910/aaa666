/**
 * 菊池 L1=2 (r1+1, r2-1): score_illustration の r1/r2 打席を列挙
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { fileURLToPath } from "url"
import { join } from "path"

const YAHOO = "1100082"
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

const rows: string[] = []
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
    const scoreK = sit(basesBeforeFromScoreIllustration(ctx, playLine, pa))
    const textK = sit(basesBeforeFromSportsnaviPlayLine(playLine))
    if (scoreK !== "r1" && scoreK !== "r2") continue
    if (scoreK === textK) continue
    const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
    const result = plateAppearanceResolvedResultText(doc, pa).trim()
    rows.push(
      `${pa.paId}\tscore=${scoreK}\ttext=${textK}\t${token}\tfirst=${JSON.stringify(ctx?.firstClass)}\tchain=${JSON.stringify(ctx?.chainStart)}\tem=${JSON.stringify(ctx?.firstEm)}\t${result.slice(0, 24)}`,
    )
  }
}

console.log(`score≠text (r1/r2 only): ${rows.length}`)
for (const r of rows) console.log(r)
