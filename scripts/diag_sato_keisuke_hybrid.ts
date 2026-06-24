/**
 * 広島・佐藤啓介 (2112143) 塁状況別ハイブリッド試算
 * npx tsx scripts/diag_sato_keisuke_hybrid.ts
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
const YAHOO = "2112143"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const REF: Record<string, { pa: number; ab: number; so: number; hbp: number }> = {
  none: { pa: 6, ab: 6, so: 2, hbp: 0 },
  r1: { pa: 3, ab: 2, so: 1, hbp: 1 },
  r12: { pa: 1, ab: 1, so: 1, hbp: 0 },
  r13: { pa: 0, ab: 0, so: 0, hbp: 0 },
  r2: { pa: 0, ab: 0, so: 0, hbp: 0 },
  r23: { pa: 1, ab: 1, so: 0, hbp: 0 },
  r3: { pa: 1, ab: 1, so: 1, hbp: 0 },
  loaded: { pa: 0, ab: 0, so: 0, hbp: 0 },
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
  const rows: string[] = []
  let total = 0

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
      const sit = bases ? classifySituationAtPaStart(bases).detail : "?"
      const textSit = textB ? classifySituationAtPaStart(textB).detail : "?"
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"

      const agg = bySit.get(sit) ?? emptyBattingSeasonAggYahoo()
      if (result) {
        agg.pa += 1
        updateBattingAggFromResultJa(agg, result)
      }
      bySit.set(sit, agg)

      const chain = ctx?.chainStart ? JSON.stringify(ctx.chainStart) : "-"
      const first = ctx?.firstClass ? JSON.stringify(ctx.firstClass) : "-"
      rows.push(
        `${pa.paId}\t${sit}\ttext=${textSit}\t${token}\tchain=${chain}\tfirst=${first}\t${result.slice(0, 35)}`,
      )
      if (sit !== textSit) rows.push("  ^ hybrid override")
    }
  }

  console.log(`佐藤啓介 (yahoo_${YAHOO}) — ハイブリッド試算\n打席: ${total}\n`)
  console.log("行\tPA\tAB\tSO\tHBP | ref")
  let l1 = 0
  for (const k of Object.keys(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    console.log(
      `${LABEL[k]}\t${g.pa}\t${g.ab}\t${g.so}\t${g.hbp} | ${r.pa} ${r.ab} ${r.so} ${r.hbp}`,
    )
    l1 +=
      Math.abs(g.pa - r.pa) +
      Math.abs(g.ab - r.ab) +
      Math.abs(g.so - r.so) +
      Math.abs(g.hbp - r.hbp)
  }
  console.log(`\nL1(PA+AB+SO+HBP) = ${l1}\n--- 全打席 ---`)
  for (const line of rows) console.log(line)
}

main()
