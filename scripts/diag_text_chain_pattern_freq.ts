/**
 * text≠chain の塁パターン頻度（canonical 全打席・実況行あり）
 * npx tsx scripts/diag_text_chain_pattern_freq.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { basesBeforeFromSportsnaviPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { extractSportsnaviSituationTokenFromPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const CANONICAL = join(root, "_data/scraped_games/canonical")

const FOCUS = new Set([
  "none=>r1",
  "r3=>r1",
  "r1=>r12",
  "r12=>r23",
  "r13=>r23",
  "none=>r2",
  "r1=>r2",
])

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function main(): void {
  const counts = new Map<string, number>()
  const samples = new Map<string, string[]>()

  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const doc = JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument
    const allPas = doc.domain.plateAppearances ?? []
    if (!allPas.length) continue
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of allPas) {
      const line = playMap.get(pa.paId)
      const textB = basesBeforeFromSportsnaviPlayLine(line)
      const chain = scoreCtx.get(pa.paId)?.chainStart
      if (!textB || !chain) continue
      const ts = sit(textB)
      const cs = sit(chain)
      if (ts === cs) continue
      const key = `${ts}=>${cs}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (FOCUS.has(key)) {
        const list = samples.get(key) ?? []
        if (list.length < 8) {
          const token = extractSportsnaviSituationTokenFromPlayLine(line ?? "") ?? "-"
          list.push(`${pa.paId} y=${pa.yahooBatterId} ${token}`)
          samples.set(key, list)
        }
      }
    }
  }

  console.log("=== focus patterns ===")
  for (const k of FOCUS) {
    console.log(`${k}\t${counts.get(k) ?? 0}`)
    for (const s of samples.get(k) ?? []) console.log(`  ${s}`)
  }
}

main()
