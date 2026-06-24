import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { basesBeforeFromScoreIllustration } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const PA = "2021038624-10-裏-3"
const doc = JSON.parse(
  readFileSync(join(root, "_data/scraped_games/canonical/2021038624.json"), "utf8"),
) as CanonicalGameDocument
const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
  comparePaIdChronological(a.paId, b.paId),
)
const ctx = buildScoreBasesContextByPaId(
  allPas.map((p) => p.paId),
  loadSportsnaviScoreSnapshots(root, doc.gameId),
).get(PA)!
const playLine = buildPaIdToSportsnaviPlayLineMap(doc).get(PA) ?? ""
console.log("line:", playLine)
console.log("ctx:", JSON.stringify(ctx, null, 2))
console.log("score:", classifySituationAtPaStart(basesBeforeFromScoreIllustration(ctx, playLine)!).detail)
