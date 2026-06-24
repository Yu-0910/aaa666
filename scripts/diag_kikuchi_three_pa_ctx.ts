/** 8699/8624/8817 前打席コンテキスト */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const CANONICAL = join(root, "_data/scraped_games/canonical")
const IDS = ["2021038624-9-裏-2", "2021038817-2-表-2", "2021038699-1-表-2"]

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
  const ctx = buildScoreBasesContextByPaId(allPas.map((p) => p.paId), loadSportsnaviScoreSnapshots(root, doc.gameId))
  for (const id of IDS) {
    const i = allPas.findIndex((p) => p.paId === id)
    if (i < 0) continue
    const prev = i > 0 ? allPas[i - 1] : null
    const c = ctx.get(id)
    const pc = prev ? ctx.get(prev.paId) : null
    console.log(id)
    console.log(`  prev ${prev?.paId ?? "-"} end last=${sit(pc?.lastClass)}`)
    console.log(`  chain=${sit(c?.chainStart)} em=${sit(c?.firstEm)} first=${sit(c?.firstClass)}`)
  }
}
