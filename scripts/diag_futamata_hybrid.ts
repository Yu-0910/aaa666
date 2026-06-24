/**
 * 広島・二俣翔一 (2000066) 塁状況別ハイブリッド試算
 * npx tsx scripts/diag_futamata_hybrid.ts
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
const YAHOO = "2000066"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const REF: Record<
  string,
  { pa: number; ab: number; h: number; hr: number; rbi: number; so: number; bb: number; hbp: number; sh: number; sf: number }
> = {
  none: { pa: 26, ab: 25, h: 3, hr: 1, rbi: 1, so: 9, bb: 1, hbp: 0, sh: 0, sf: 0 },
  r1: { pa: 11, ab: 11, h: 3, hr: 0, rbi: 1, so: 2, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r12: { pa: 2, ab: 2, h: 1, hr: 0, rbi: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r13: { pa: 2, ab: 1, h: 1, hr: 0, rbi: 1, so: 0, bb: 0, hbp: 1, sh: 0, sf: 0 },
  r2: { pa: 3, ab: 2, h: 0, hr: 0, rbi: 0, so: 2, bb: 0, hbp: 0, sh: 1, sf: 0 },
  r23: { pa: 1, ab: 0, h: 0, hr: 0, rbi: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 1 },
  r3: { pa: 2, ab: 2, h: 1, hr: 0, rbi: 1, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
  loaded: { pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
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
  const mismatches: string[] = []
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
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"

      const agg = bySit.get(hybrid) ?? emptyBattingSeasonAggYahoo()
      if (result) {
        agg.pa += 1
        updateBattingAggFromResultJa(agg, result)
      }
      bySit.set(hybrid, agg)

      if (text !== chain) {
        textChain++
        mismatches.push(
          `${pa.paId}\t${hybrid}\ttext=${text}\tchain=${chain}\t${token}\t${result.slice(0, 28)}`,
        )
      }
    }
  }

  console.log(`二俣翔一 (yahoo_${YAHOO}) — ハイブリッド試算\n打席: ${total} (正常値 PA 合計 47)\n`)
  console.log("行\tPA\tAB\tH\tHR\tRBI\tSO\tBB\tHBP\tSH\tSF | ref")
  let l1 = 0
  for (const k of Object.keys(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    const line =
      `${LABEL[k]}\t${g.pa}\t${g.ab}\t${g.h}\t${g.hr}\t${g.rbi}\t${g.so}\t${g.bb}\t${g.hbp}\t${g.sh}\t${g.sf} | ` +
      `${r.pa} ${r.ab} ${r.h} ${r.hr} ${r.rbi} ${r.so} ${r.bb} ${r.hbp} ${r.sh} ${r.sf}`
    console.log(line)
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

  console.log(`\nL1(PA+AB+H+HR+SO+BB+HBP+SH+SF) = ${l1}`)
  console.log(`text≠chain: ${textChain}打席\n--- 不一致打席 ---`)
  for (const m of mismatches) console.log(m)
}

main()
