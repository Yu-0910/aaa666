/**
 * 菊池涼介 (1100082) — 全打席 Per-PA + 行別集計 vs 正常値
 * npx tsx scripts/diag_kikuchi_per_pa.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "fs"
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
import { isAtBat } from "../lib/yahooGame/resultJaHitBases"
import { isWalkLikeResultText } from "../lib/baseballWalkResult"
import { isStrikeoutResultJa } from "../lib/yahooGame/paOutcomeResultJa"

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

type PaRow = {
  paId: string
  hybrid: string
  text: string
  chain: string
  first: string
  token: string
  result: string
  ab: number
  h: number
  bb: number
  so: number
  sf: number
  sh: number
}

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function statFlags(result: string): Pick<PaRow, "ab" | "h" | "bb" | "so" | "sf" | "sh"> {
  const r = result.trim()
  return {
    ab: isAtBat(r) ? 1 : 0,
    h: 0,
    bb: isWalkLikeResultText(r) ? 1 : 0,
    so: isStrikeoutResultJa(r) ? 1 : 0,
    sf: /犠飛/.test(r) ? 1 : 0,
    sh: /犠打|送りバント/.test(r) && !/犠飛/.test(r) ? 1 : 0,
  }
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

function l1FromAgg(bySit: Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>): number {
  let d = 0
  for (const [k, r] of Object.entries(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    d +=
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
  return d
}

function aggregate(rows: PaRow[], assign: (r: PaRow) => string): Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>> {
  const bySit = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  for (const row of rows) {
    const sitKey = assign(row)
    const agg = bySit.get(sitKey) ?? emptyBattingSeasonAggYahoo()
    agg.pa += 1
    updateBattingAggFromResultJa(agg, row.result)
    bySit.set(sitKey, agg)
  }
  return bySit
}

function main(): void {
  const paRows: PaRow[] = []

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
      const playLine = playMap.get(pa.paId) ?? ""
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      const ctx = scoreCtx.get(pa.paId)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const hybridB = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      paRows.push({
        paId: pa.paId,
        hybrid: sit(hybridB),
        text: sit(textB),
        chain: sit(ctx?.chainStart),
        first: sit(ctx?.firstClass),
        token: extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-",
        result,
        ...statFlags(result),
      })
    }
  }

  paRows.sort((a, b) => a.paId.localeCompare(b.paId))

  const hybridAgg = aggregate(paRows, (r) => r.hybrid)
  const l1Hybrid = l1FromAgg(hybridAgg)

  console.log(`菊池涼介 — Per-PA 突合\n打席: ${paRows.length}\n`)
  console.log("行\tPA\tAB\tH\tHR\tSO\tBB\tSF\tSH | ref")
  for (const k of Object.keys(REF)) {
    const g = hybridAgg.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    console.log(
      `${LABEL[k]}\t${g.pa}\t${g.ab}\t${g.h}\t${g.hr}\t${g.so}\t${g.bb}\t${g.sf}\t${g.sh} | ${r.pa} ${r.ab} ${r.h} ${r.hr} ${r.so} ${r.bb} ${r.sf} ${r.sh}`,
    )
  }
  console.log(`\nL1 = ${l1Hybrid}\n`)

  const focus = ["none", "r1", "r3"] as const
  console.log("=== none/r1/r3 再配分候補（text≠chain） ===\n")
  for (const row of paRows) {
    if (row.text === row.chain) continue
    if (!focus.includes(row.hybrid as (typeof focus)[number])) continue
    if (!focus.includes(row.text as (typeof focus)[number]) && !focus.includes(row.chain as (typeof focus)[number]))
      continue
    console.log(
      `${row.paId}\thybrid=${row.hybrid}\ttext=${row.text}\tchain=${row.chain}\tfirst=${row.first}\t${row.token}\t${row.result.slice(0, 28)}`,
    )
  }

  console.log("\n=== 一塁行だが token に走者なし ===\n")
  for (const row of paRows) {
    if (row.hybrid !== "r1") continue
    if (!/走者なし/.test(row.token)) continue
    console.log(`${row.paId}\ttext=${row.text}\tchain=${row.chain}\t${row.token}\t${row.result.slice(0, 30)}`)
  }

  console.log("\n=== なし行だが token に一塁（複合除く） ===\n")
  for (const row of paRows) {
    if (row.hybrid !== "none") continue
    if (!/一塁/.test(row.token) || /一二|一三|二三|満/.test(row.token)) continue
    console.log(`${row.paId}\ttext=${row.text}\tchain=${row.chain}\t${row.token}\t${row.result.slice(0, 30)}`)
  }

  console.log("\n=== 三塁不足候補: text=三塁 & hybrid≠三塁 ===\n")
  for (const row of paRows) {
    if (row.text !== "r3") continue
    if (row.hybrid === "r3") continue
    console.log(`${row.paId}\thybrid=${row.hybrid}\tchain=${row.chain}\t${row.token}\t${row.result.slice(0, 30)}`)
  }

  console.log("\n=== 反実仮想: hybrid→text に戻した場合 L1 ===")
  const textAgg = aggregate(paRows, (r) => r.text)
  console.log(`L1(text only) = ${l1FromAgg(textAgg)}`)

  console.log("\n=== 反実仮想: hybrid→chain にした場合 L1 ===")
  const chainAgg = aggregate(paRows, (r) => r.chain)
  console.log(`L1(chain only) = ${l1FromAgg(chainAgg)}`)

  const outPath = join(root, "_data/diag_kikuchi_per_pa.json")
  writeFileSync(outPath, JSON.stringify({ paRows, l1Hybrid, ref: REF }, null, 2))
  console.log(`\nWrote ${outPath}`)
}

main()
