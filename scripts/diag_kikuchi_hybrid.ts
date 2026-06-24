/**
 * 広島・菊池涼介 (1100082) 塁状況別ハイブリッド試算
 * npx tsx scripts/diag_kikuchi_hybrid.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "1100082"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const REF: Record<
  string,
  { pa: number; ab: number; h: number; hr: number; so: number; bb: number; hbp: number; sh: number; sf: number }
> = {
  none: { pa: 120, ab: 108, h: 23, hr: 0, so: 28, bb: 12, hbp: 0, sh: 0, sf: 0 },
  r1: { pa: 27, ab: 18, h: 6, hr: 1, so: 5, bb: 4, hbp: 0, sh: 5, sf: 0 },
  r12: { pa: 13, ab: 9, h: 2, hr: 1, so: 1, bb: 4, hbp: 0, sh: 0, sf: 0 },
  r13: { pa: 4, ab: 2, h: 0, hr: 0, so: 1, bb: 1, hbp: 0, sh: 1, sf: 0 },
  r2: { pa: 10, ab: 7, h: 2, hr: 0, so: 1, bb: 1, hbp: 0, sh: 2, sf: 0 },
  r23: { pa: 1, ab: 1, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r3: { pa: 8, ab: 5, h: 1, hr: 0, so: 1, bb: 2, hbp: 0, sh: 0, sf: 1 },
  loaded: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
}

const LABEL: Record<string, string> = {
  none: "なし",
  r1: "一塁",
  r2: "二塁",
  r3: "三塁",
  r12: "一二塁",
  r13: "一三塁",
  r23: "二三塁",
  loaded: "満塁",
}

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function loadDocs(): CanonicalGameDocument[] {
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const p = join(CANONICAL, f)
    const raw = readFileSync(p, "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    out.push(JSON.parse(raw) as CanonicalGameDocument)
  }
  return out
}

function main(): void {
  const bySit = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  const diffRows: string[] = []
  let total = 0
  let textChain = 0

  for (const doc of loadDocs()) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of pas) {
      total++
      const playLine = playMap.get(pa.paId) ?? ""
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const bases = basesBeforeForPlateAppearanceHybrid(pa, playLine, scoreCtx.get(pa.paId))
      const ctx = scoreCtx.get(pa.paId)
      const hybrid = sit(bases)
      const text = sit(textB)
      const chain = sit(ctx?.chainStart)

      const agg = bySit.get(hybrid) ?? emptyBattingSeasonAggYahoo()
      if (result) {
        agg.pa += 1
        updateBattingAggFromResultJa(agg, result)
      }
      bySit.set(hybrid, agg)

      if (text !== chain) textChain++
    }
  }

  console.log(`菊池涼介 (yahoo_${YAHOO}) — ハイブリッド試算\n打席: ${total} (正常値 PA 合計 184)\n`)
  console.log("行\tPA\tAB\tH\tHR\tSO\tBB\tHBP\tSH\tSF | ref")
  let l1 = 0
  for (const k of Object.keys(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const parts: string[] = []
    if (g.pa !== r.pa) parts.push(`PA${g.pa - r.pa >= 0 ? "+" : ""}${g.pa - r.pa}`)
    if (g.ab !== r.ab) parts.push(`AB${g.ab - r.ab >= 0 ? "+" : ""}${g.ab - r.ab}`)
    if (g.h !== r.h) parts.push(`H${g.h - r.h >= 0 ? "+" : ""}${g.h - r.h}`)
    if (g.hr !== r.hr) parts.push(`HR${g.hr - r.hr >= 0 ? "+" : ""}${g.hr - r.hr}`)
    if (g.so !== r.so) parts.push(`SO${g.so - r.so >= 0 ? "+" : ""}${g.so - r.so}`)
    if (g.bb !== r.bb) parts.push(`BB${g.bb - r.bb >= 0 ? "+" : ""}${g.bb - r.bb}`)
    if (g.hbp !== r.hbp) parts.push(`HBP${g.hbp - r.hbp >= 0 ? "+" : ""}${g.hbp - r.hbp}`)
    if (g.sh !== r.sh) parts.push(`SH${g.sh - r.sh >= 0 ? "+" : ""}${g.sh - r.sh}`)
    if (g.sf !== r.sf) parts.push(`SF${g.sf - r.sf >= 0 ? "+" : ""}${g.sf - r.sf}`)
    if (parts.length) diffRows.push(`${LABEL[k]}: ${parts.join(" ")}`)

    console.log(
      `${LABEL[k]}\t${g.pa}\t${g.ab}\t${g.h}\t${g.hr}\t${g.so}\t${g.bb}\t${g.hbp}\t${g.sh}\t${g.sf} | ${r.pa} ${r.ab} ${r.h} ${r.hr} ${r.so} ${r.bb} ${r.hbp} ${r.sh} ${r.sf}`,
    )
    l1 +=
      Math.abs(g.pa - r.pa) +
      Math.abs(g.ab - r.ab) +
      Math.abs(g.h - r.h) +
      Math.abs(g.hr - r.hr) +
      Math.abs(g.so - r.so) +
      Math.abs(g.bb - r.bb) +
      Math.abs(g.hbp - r.hbp) +
      Math.abs(g.sh - r.sh) +
      Math.abs(g.sf - r.sf)
  }

  console.log(`\nL1 = ${l1}`)
  console.log(`text≠chain: ${textChain}打席`)
  if (diffRows.length) {
    console.log("\n--- 差分 ---")
    for (const d of diffRows) console.log(`  ${d}`)
  }
}

main()
