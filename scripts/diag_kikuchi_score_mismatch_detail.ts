/**
 * 菊池: score_illustration ≠ hybrid の5打席詳細
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const YAHOO = "1100082"
const FOCUS = [
  "2021038636-4-裏-3",
  "2021038699-1-表-2",
  "2021038734-3-裏-3",
  "2021038788-6-表-4",
  "2021038920-6-裏-3",
]

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const perPa = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")).paRows as Array<{
  paId: string
  hybrid: string
}>

for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
  const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
    comparePaIdChronological(a.paId, b.paId),
  )
  const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
  const scoreCtx = buildScoreBasesContextByPaId(
    allPas.map((p) => p.paId),
    loadSportsnaviScoreSnapshots(root, doc.gameId),
  )
  for (const paId of FOCUS) {
    const pa = allPas.find((p) => p.paId === paId && (p.yahooBatterId ?? "").trim() === YAHOO)
    if (!pa) continue
    const playLine = playMap.get(paId) ?? ""
    const ctx = scoreCtx.get(paId)
    const refRow = perPa.find((r) => r.paId === paId)
    console.log(`\n=== ${paId} ===`)
    console.log("token:", extractSportsnaviSituationTokenFromPlayLine(playLine))
    console.log("text:", sit(basesBeforeFromSportsnaviPlayLine(playLine)))
    console.log("score:", sit(basesBeforeFromScoreIllustration(ctx)))
    console.log("hybrid:", sit(basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)))
    console.log("per_pa hybrid:", refRow?.hybrid)
    console.log("ctx:", JSON.stringify(ctx))
    console.log("line:", playLine.slice(0, 120))
  }
}
