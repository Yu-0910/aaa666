import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const PA = "2021038962-9-裏-2"
const doc = JSON.parse(
  readFileSync(join(root, "_data/scraped_games/canonical/2021038962.json"), "utf8"),
) as CanonicalGameDocument
const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
  comparePaIdChronological(a.paId, b.paId),
)
const ctx = buildScoreBasesContextByPaId(
  allPas.map((p) => p.paId),
  loadSportsnaviScoreSnapshots(root, doc.gameId),
).get(PA)
const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
console.log("ctx", JSON.stringify(ctx, null, 2))
console.log("playLine", playMap.get(PA))
