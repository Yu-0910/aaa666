/**
 * ランナー別成績の参照値との差分（打席単位）を出力する。
 *
 * 使い方:
 *   npx tsx scripts/diagnose_base_sit_player.ts --yahoo 2000051
 *   npx tsx scripts/diagnose_base_sit_player.ts --yahoo 2000051 --ref pa:48,ab:43
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesBeforeForPlateAppearance,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

const REF_DEFAULT: Record<string, { pa: number; ab: number }> = {
  none: { pa: 123, ab: 113 },
  r1: { pa: 48, ab: 43 },
  r2: { pa: 20, ab: 12 },
  r3: { pa: 8, ab: 7 },
  r12: { pa: 14, ab: 11 },
  r13: { pa: 4, ab: 3 },
  r23: { pa: 3, ab: 3 },
  loaded: { pa: 5, ab: 4 },
  risp: { pa: 54, ab: 40 },
}

function parseArgs(): { yahoo: string; refPath?: string } {
  const args = process.argv.slice(2)
  let yahoo = "2000051"
  let refPath: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yahoo" && args[i + 1]) {
      yahoo = args[i + 1]!
      i++
    }
    if (args[i] === "--derived" && args[i + 1]) {
      refPath = args[i + 1]!
      i++
    }
  }
  return { yahoo, refPath }
}

function loadDerivedAgg(yahoo: string): Map<string, { pa: number; ab: number; rbi: number }> {
  const p = join(root, "_data", "derived", "player_season_batting_splits", "2026", `yahoo_${yahoo}.json`)
  const doc = JSON.parse(readFileSync(p, "utf8")) as {
    rows?: { split_type: string; split_value: string; pa: number; ab: number; rbi: number }[]
  }
  const m = new Map<string, { pa: number; ab: number; rbi: number }>()
  for (const r of doc.rows ?? []) {
    if (r.split_type === "base_sit") {
      m.set(r.split_value, { pa: r.pa, ab: r.ab, rbi: r.rbi })
    }
  }
  return m
}

function main(): void {
  const { yahoo, refPath } = parseArgs()
  const derived = loadDerivedAgg(yahoo)

  console.log(`player yahoo_${yahoo} — derived vs reference (PA/AB)`)
  for (const [k, ref] of Object.entries(REF_DEFAULT)) {
    const got = derived.get(k)
    const pa = got?.pa ?? 0
    const ab = got?.ab ?? 0
    const dPa = pa - ref.pa
    const dAb = ab - ref.ab
    if (dPa !== 0 || dAb !== 0) {
      console.log(
        `  ${k}: PA ${pa} (${dPa >= 0 ? "+" : ""}${dPa}) AB ${ab} (${dAb >= 0 ? "+" : ""}${dAb}) RBI ${got?.rbi ?? 0} | ref PA${ref.pa} AB${ref.ab}`,
      )
    }
  }

  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  let noBases = 0
  const byDetail = new Map<string, number>()

  for (const doc of docs) {
    const lines = buildPaIdToSportsnaviPlayLineMap(doc)
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== yahoo) continue
      const playLine = lines.get(pa.paId)
      const b = basesBeforeForPlateAppearance(pa, playLine)
      if (!b) {
        noBases++
        console.log(`no bases: ${doc.gameId} ${pa.paId} | ${(playLine ?? "").slice(0, 80)}`)
        continue
      }
      const { detail } = classifySituationAtPaStart(b)
      byDetail.set(detail, (byDetail.get(detail) ?? 0) + 1)
      const tok = extractSportsnaviSituationTokenFromPlayLine(playLine ?? "")
      const res = plateAppearanceResolvedResultText(doc, pa)
      if (!res.trim()) {
        console.log(`no appearance result: ${doc.gameId} ${pa.paId} token=${tok}`)
      }
    }
  }

  console.log(`\nPA without bases: ${noBases}`)
  console.log("PA by detail (canonical pass):", Object.fromEntries(byDetail))
  if (refPath) console.log("(custom ref path ignored in v1; edit REF_DEFAULT)")
}

main()
