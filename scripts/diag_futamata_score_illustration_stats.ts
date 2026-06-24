/**
 * 広島・二俣翔一: score_illustration + 出場成績 vs スポナビ公式
 * npx tsx scripts/diag_futamata_score_illustration_stats.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000066"
const CANONICAL = join(root, "_data/scraped_games/canonical")

/** スポナビ公式（diag_futamata_hybrid 参照） */
const REF: Record<
  string,
  { pa: number; ab: number; h: number; hr: number; so: number; bb: number; hbp: number; sh: number; sf: number }
> = {
  none: { pa: 26, ab: 25, h: 3, hr: 1, so: 9, bb: 1, hbp: 0, sh: 0, sf: 0 },
  r1: { pa: 11, ab: 11, h: 3, hr: 0, so: 2, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r12: { pa: 2, ab: 2, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
  r13: { pa: 2, ab: 1, h: 1, hr: 0, so: 0, bb: 0, hbp: 1, sh: 0, sf: 0 },
  r2: { pa: 3, ab: 2, h: 0, hr: 0, so: 2, bb: 0, hbp: 0, sh: 1, sf: 0 },
  r23: { pa: 1, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 1 },
  r3: { pa: 2, ab: 2, h: 1, hr: 0, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
  loaded: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
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

const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const
const CMP_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const

function loadDocs(): CanonicalGameDocument[] {
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const raw = readFileSync(join(CANONICAL, f), "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    out.push(JSON.parse(raw) as CanonicalGameDocument)
  }
  return out
}

function main(): void {
  const bySit = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()

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
      const ctx = scoreCtx.get(pa.paId)
      const basesBefore = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result || !basesBefore) continue
      const sit = classifySituationAtPaStart(basesBefore).detail
      const agg = bySit.get(sit) ?? emptyBattingSeasonAggYahoo()
      agg.pa += 1
      updateBattingAggFromResultJa(agg, result)
      bySit.set(sit, agg)
    }
  }

  console.log("広島・二俣翔一 (yahoo_2000066) — score_illustration + 出場成績\n")
  console.log("行\tPA\tAB\tH\tHR\tSO\tBB\tHBP\tSH\tSF | ref")

  let l1 = 0
  const diffs: string[] = []
  for (const k of Object.keys(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    for (const sk of CMP_KEYS) {
      const d = Math.abs(g[sk] - r[sk])
      if (d) diffs.push(`${LABEL[k]} ${sk.toUpperCase()}${g[sk] > r[sk] ? "+" : ""}${g[sk] - r[sk]}`)
      l1 += d
    }
    console.log(
      `${LABEL[k]}\t${STAT_KEYS.map((sk) => g[sk]).join("\t")} | ${STAT_KEYS.map((sk) => r[sk]).join(" ")}`,
    )
  }

  const tot = emptyBattingSeasonAggYahoo()
  const refTot = emptyBattingSeasonAggYahoo()
  for (const k of Object.keys(REF)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    const r = REF[k]!
    for (const sk of STAT_KEYS) {
      tot[sk] += g[sk]
      refTot[sk] += r[sk]
    }
  }
  console.log(`\n合計\t${STAT_KEYS.map((sk) => tot[sk]).join("\t")} | ${STAT_KEYS.map((sk) => refTot[sk]).join(" ")}`)
  console.log(`L1(全指標) = ${l1}`)
  if (diffs.length) {
    console.log(`差分: ${diffs.join(", ")}`)
  } else {
    console.log("全指標がスポナビ公式と完全一致")
  }
}

main()
