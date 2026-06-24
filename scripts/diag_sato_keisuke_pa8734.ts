import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { basesBeforeFromScoreIllustration } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const PA = "2021038734-9-裏-4"
const doc = JSON.parse(
  readFileSync(join(root, "_data/scraped_games/canonical/2021038734.json"), "utf8"),
) as CanonicalGameDocument
const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
  comparePaIdChronological(a.paId, b.paId),
)
const pa = allPas.find((p) => p.paId === PA)!
const ctx = buildScoreBasesContextByPaId(
  allPas.map((p) => p.paId),
  loadSportsnaviScoreSnapshots(root, doc.gameId),
).get(PA)
const playLine = buildPaIdToSportsnaviPlayLineMap(doc).get(PA) ?? ""

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

console.log("token", extractSportsnaviSituationTokenFromPlayLine(playLine))
console.log("playLine", playLine)
console.log("ctx", JSON.stringify(ctx, null, 2))
console.log("text", sit(basesBeforeFromSportsnaviPlayLine(playLine)))
console.log("score_illustration", sit(basesBeforeFromScoreIllustration(ctx)))
console.log("hybrid", sit(basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)))
