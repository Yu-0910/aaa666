/**
 * 広島・佐藤啓介: score_illustration + 出場成績 vs スポナビ公式
 * npx tsx scripts/diag_sato_keisuke_score_illustration_stats.ts
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
const YAHOO = "2112143"
const CANONICAL = join(root, "_data/scraped_games/canonical")

/** スポナビ公式（diag_sato_keisuke_hybrid と同値） */
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

const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const
const CMP_KEYS = ["pa", "ab", "so", "hbp"] as const

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
  const rows: string[] = []

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
      rows.push(`${pa.paId}\t${sit}\t${result}`)
    }
  }

  console.log("広島・佐藤啓介 (yahoo_2112143) — score_illustration + 出場成績\n")
  console.log("行\tPA\tAB\tH\tHR\tSO\tBB\tHBP\tSH\tSF | ref PA AB SO HBP")

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
      `${LABEL[k]}\t${STAT_KEYS.map((sk) => g[sk]).join("\t")} | ${r.pa} ${r.ab} ${r.so} ${r.hbp}`,
    )
  }

  const tot = emptyBattingSeasonAggYahoo()
  for (const g of bySit.values()) {
    for (const sk of STAT_KEYS) tot[sk] += g[sk]
  }
  console.log(`\n合計\t${STAT_KEYS.map((sk) => tot[sk]).join("\t")}`)
  console.log(`L1(PA+AB+SO+HBP) = ${l1}`)
  if (diffs.length) {
    console.log(`差分: ${diffs.join(", ")}`)
  } else {
    console.log("PA/AB/SO/HBP はスポナビ公式と完全一致")
  }

  console.log("\n--- 打席一覧 ---")
  for (const line of rows.sort()) console.log(line)
}

main()
