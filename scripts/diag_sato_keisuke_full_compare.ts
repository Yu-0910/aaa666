/**
 * 佐藤啓介: 全12打席 Per-PA 対照 + text/chain/hybrid vs 正常値行
 * npx tsx scripts/diag_sato_keisuke_full_compare.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  applyMidPaStealChainOverride,
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2112143"
const CANONICAL = join(root, "_data/scraped_games/canonical")

/** スポナビ正常値に基づく打席→行（成績から一意に定まる） */
const OFFICIAL_ROW_BY_PA: Record<string, string> = {
  "2021038640-5-表-2": "none",
  "2021038666-5-裏-1": "none",
  "2021038716-9-表-2": "r1",
  "2021038728-5-裏-4": "r1",
  "2021038734-7-裏-4": "r3",
  "2021038734-9-裏-4": "r23",
  "2021038752-5-裏-1": "none",
  "2021038757-5-裏-1": "none",
  "2021038766-7-表-2": "none",
  "2021038893-5-表-4": "r12",
  "2021038899-8-表-3": "none",
  "2021038905-7-表-4": "r1",
}

const LABEL: Record<string, string> = {
  none: "なし",
  r1: "一塁",
  r12: "一二塁",
  r23: "二三塁",
  r3: "三塁",
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

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function main(): void {
  const rows: Array<{
    paId: string
    official: string
    text: string
    chain: string
    first: string
    stealAdj: string
    hybrid: string
    token: string
    result: string
    ok: boolean
  }> = []

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
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const stealAdj = textB ? applyMidPaStealChainOverride(textB, ctx) : null
      const hybridB = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      const official = OFFICIAL_ROW_BY_PA[pa.paId] ?? "?"
      const hybrid = sit(hybridB)
      const ok = hybrid === official

      rows.push({
        paId: pa.paId,
        official,
        text: sit(textB),
        chain: sit(ctx?.chainStart),
        first: sit(ctx?.firstClass),
        stealAdj: sit(stealAdj),
        hybrid,
        token: extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-",
        result: plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 30),
        ok,
      })
    }
  }

  rows.sort((a, b) => a.paId.localeCompare(b.paId))

  console.log("佐藤啓介 — 全打席 Per-PA 対照\n")
  console.log(
    "paId\tofficial\ttext\tchain\tstealAdj\thybrid\tok\ttoken\tresult",
  )
  for (const r of rows) {
    console.log(
      `${r.paId}\t${LABEL[r.official] ?? r.official}\t${r.text}\t${r.chain}\t${r.stealAdj}\t${r.hybrid}\t${r.ok ? "OK" : "NG"}\t${r.token}\t${r.result}`,
    )
  }

  const ng = rows.filter((r) => !r.ok)
  console.log(`\n不一致: ${ng.length}/${rows.length}`)
  for (const r of ng) {
    console.log(
      `  ${r.paId}: 正常=${LABEL[r.official]} hybrid=${r.hybrid} (text=${r.text} chain=${r.chain} token=${r.token})`,
    )
  }

  const textChain = rows.filter((r) => r.text !== r.chain)
  console.log(`\ntext≠chain: ${textChain.length}打席`)
  for (const r of textChain) {
    console.log(
      `  ${r.paId} ${r.text}=>${r.chain} official=${r.official} hybrid=${r.hybrid}`,
    )
  }
}

main()
