/** 菊池 再配分候補5件 + none/r1 曖昧33件の score コンテキスト */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "1100082"
const CANONICAL = join(root, "_data/scraped_games/canonical")

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

const targets = new Set(
  JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_reassign_best.json"), "utf8"))
    .toNone.concat(JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_reassign_best.json"), "utf8")).toR3)
    .map((x: { paId: string }) => x.paId),
)

function main(): void {
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const doc = JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const has = allPas.some((p) => targets.has(p.paId))
    if (!has) continue
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    for (const pa of allPas) {
      if (!targets.has(pa.paId)) continue
      const ctx = scoreCtx.get(pa.paId)
      console.log(
        `${pa.paId}\tchain=${sit(ctx?.chainStart)}\tfirst=${sit(ctx?.firstClass)}\tlast=${sit(ctx?.lastClass)}\tline=${(playMap.get(pa.paId) ?? "").slice(0, 55)}`,
      )
    }
  }
}

main()
