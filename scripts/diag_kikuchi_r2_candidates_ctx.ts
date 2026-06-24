/** 8624/8817 + r1→r2候補6件の score 各ソース比較 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromScoreHybrid,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const CANONICAL = join(root, "_data/scraped_games/canonical")
const IDS = [
  "2021038624-9-裏-2",
  "2021038817-2-表-2",
  "2021038640-4-表-4",
  "2021038830-8-裏-3",
  "2021038852-12-表-4",
  "2021038926-6-裏-3",
]

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

for (const f of readdirSync(CANONICAL)) {
  if (!f.endsWith(".json")) continue
  const doc = JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument
  const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
    comparePaIdChronological(a.paId, b.paId),
  )
  if (!IDS.some((id) => allPas.some((p) => p.paId === id))) continue
  const ctxMap = buildScoreBasesContextByPaId(
    allPas.map((p) => p.paId),
    loadSportsnaviScoreSnapshots(root, doc.gameId),
  )
  const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
  console.log(`game ${doc.gameId}\n`)
  for (const id of IDS) {
    const pa = allPas.find((p) => p.paId === id)
    if (!pa) continue
    const line = playMap.get(id) ?? ""
    const ctx = ctxMap.get(id)
    const text = basesBeforeFromSportsnaviPlayLine(line)
    const scoreH = ctx ? basesBeforeFromScoreHybrid(ctx) : null
    const hybrid = basesBeforeForPlateAppearanceHybrid(pa, line, ctx)
    console.log(id)
    console.log(`  line: ${line}`)
    console.log(
      `  text=${sit(text)} scoreHybrid=${sit(scoreH)} hybrid=${sit(hybrid)} | first=${sit(ctx?.firstClass)} chain=${sit(ctx?.chainStart)} em=${sit(ctx?.firstEm)} last=${sit(ctx?.lastClass)}`,
    )
    console.log()
  }
}
