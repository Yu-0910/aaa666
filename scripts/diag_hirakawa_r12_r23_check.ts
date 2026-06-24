/**
 * 平川蓮のみ: text r12 & chain r23 の有無（新ルール影響確認）
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  applyMidPaStealChainOverride,
  basesBeforeFromSportsnaviPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const Y = "2110164"
const CANONICAL = join(root, "_data/scraped_games/canonical")

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

for (const f of readdirSync(CANONICAL)) {
  if (!f.endsWith(".json")) continue
  const raw = readFileSync(join(CANONICAL, f), "utf8")
  if (!raw.includes(`"yahooBatterId": "${Y}"`)) continue
  const doc = JSON.parse(raw) as CanonicalGameDocument
  const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
    comparePaIdChronological(a.paId, b.paId),
  )
  const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === Y)
  const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
  const scoreCtx = buildScoreBasesContextByPaId(
    allPas.map((p) => p.paId),
    loadSportsnaviScoreSnapshots(root, doc.gameId),
  )
  for (const pa of pas) {
    const line = playMap.get(pa.paId)
    const textB = basesBeforeFromSportsnaviPlayLine(line)
    const ctx = scoreCtx.get(pa.paId)
    if (!textB || !ctx?.chainStart) continue
    const ts = sit(textB)
    const cs = sit(ctx.chainStart)
    if (ts === "r12" && cs === "r23") {
      const adj = sit(applyMidPaStealChainOverride(textB, ctx))
      console.log(`${pa.paId} text=${ts} chain=${cs} stealAdj=${adj}`)
    }
  }
}
