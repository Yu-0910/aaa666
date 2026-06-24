/**
 * 佐藤: 塁復元ソース別 PA 集計 vs 正常値
 * npx tsx scripts/diag_sato_bases_source_compare.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart, type Bases } from "../lib/yahooGame/paSituationSim"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"

const REF: Record<string, number> = {
  none: 123,
  r1: 48,
  r2: 20,
  r3: 8,
  r12: 14,
  r13: 4,
  r23: 3,
  loaded: 5,
}

function loadSatoDocs(): CanonicalGameDocument[] {
  const dir = join(root, "_data", "scraped_games", "canonical")
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue
    const p = join(dir, f)
    const raw = readFileSync(p, "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    out.push(JSON.parse(raw) as CanonicalGameDocument)
  }
  return out
}

function l1(agg: Map<string, number>): number {
  let d = 0
  for (const [k, r] of Object.entries(REF)) {
    d += Math.abs((agg.get(k) ?? 0) - r)
  }
  return d
}

function add(agg: Map<string, number>, b: Bases | null | undefined): void {
  if (!b) return
  const { detail } = classifySituationAtPaStart(b)
  agg.set(detail, (agg.get(detail) ?? 0) + 1)
}

function main(): void {
  const sources = ["text", "firstClass", "chainStart", "firstEm", "lastClass"] as const
  const aggs = Object.fromEntries(sources.map((s) => [s, new Map<string, number>()])) as Record<
    (typeof sources)[number],
    Map<string, number>
  >
  const chainVsText: string[] = []

  for (const doc of loadSatoDocs()) {
    const satoPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!satoPas.length) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const snapshots = loadSportsnaviScoreSnapshots(root, doc.gameId)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      snapshots,
    )

    for (const pa of satoPas) {
      const playLine = playMap.get(pa.paId)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const ctx = scoreCtx.get(pa.paId)
      add(aggs.text, textB)
      add(aggs.firstClass, ctx?.firstClass)
      add(aggs.chainStart, ctx?.chainStart)
      add(aggs.firstEm, ctx?.firstEm)
      add(aggs.lastClass, ctx?.lastClass)

      if (textB && ctx?.chainStart) {
        const ts = classifySituationAtPaStart(textB).detail
        const cs = classifySituationAtPaStart(ctx.chainStart).detail
        if (ts !== cs) {
          const token = extractSportsnaviSituationTokenFromPlayLine(playLine ?? "") ?? "-"
          chainVsText.push(
            `${pa.paId}\t${ts}→${cs}\t${token}\tfirst=${JSON.stringify(ctx.firstClass)} em=${JSON.stringify(ctx.firstEm)}`,
          )
        }
      }
    }
  }

  console.log("=== L1(PA) vs ref by source ===")
  for (const s of sources) {
    console.log(`${s.padEnd(12)} L1=${l1(aggs[s]!)}`)
  }

  console.log("\n=== PA counts (best = chainStart if lowest L1) ===")
  for (const s of sources) {
    const parts = Object.keys(REF).map((k) => {
      const g = aggs[s]!.get(k) ?? 0
      const r = REF[k]!
      const d = g - r
      return d ? `${k}${d >= 0 ? "+" : ""}${d}` : null
    }).filter(Boolean)
    if (parts.length) console.log(`${s}: ${parts.join(" ")}`)
  }

  console.log(`\n=== chainStart ≠ text (${chainVsText.length}) ===`)
  for (const line of chainVsText.slice(0, 30)) console.log(line)
  if (chainVsText.length > 30) console.log(`... +${chainVsText.length - 30} more`)
}

main()
