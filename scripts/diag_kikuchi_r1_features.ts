/**
 * 菊池 — 一塁32打席の特徴比較（オラクル5件 vs 残り27件）
 * npx tsx scripts/diag_kikuchi_r1_features.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { isWalkLikeResultText } from "../lib/baseballWalkResult"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "1100082"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const ORACLE_NONE = new Set(["2021038624-9-裏-2", "2021038734-3-裏-3"])
const ORACLE_R3 = new Set([
  "2021038636-4-裏-3",
  "2021038699-1-表-2",
  "2021038788-6-表-4",
])

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

type Row = {
  paId: string
  oracle: string
  token: string
  result: string
  isBB: boolean
  isSH: boolean
  text: string
  chain: string
  first: string
  em: string
  last: string
  hybrid: string
  hasSteal: boolean
  hasPB: boolean
  hasPickoff: boolean
}

function main(): void {
  const rows: Row[] = []

  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const doc = JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument
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
      const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      if (sit(hybrid) !== "r1") continue
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      const oracle = ORACLE_NONE.has(pa.paId) ? "none" : ORACLE_R3.has(pa.paId) ? "r3" : "r1"
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      rows.push({
        paId: pa.paId,
        oracle,
        token: extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-",
        result: result.slice(0, 24),
        isBB: isWalkLikeResultText(result),
        isSH: /犠打|送りバント/.test(result) && !/犠飛/.test(result),
        text: sit(textB),
        chain: sit(ctx?.chainStart),
        first: sit(ctx?.firstClass),
        em: sit(ctx?.firstEm),
        last: sit(ctx?.lastClass),
        hybrid: sit(hybrid),
        hasSteal: /盗塁成功|盗塁:/.test(playLine),
        hasPB: /パスボール|暴投/.test(playLine),
        hasPickoff: /けん制/.test(playLine),
      })
    }
  }

  rows.sort((a, b) => a.paId.localeCompare(b.paId))

  console.log("一塁行32件 — oracle ラベル付き\n")
  console.log("paId\toracle\tchain\tem\tlast\tBB\tsteal\tPB\ttoken\tresult")
  for (const r of rows) {
    console.log(
      `${r.paId}\t${r.oracle}\t${r.chain}\t${r.em}\t${r.last}\t${r.isBB ? "Y" : ""}\t${r.hasSteal ? "Y" : ""}\t${r.hasPB ? "Y" : ""}\t${r.token}\t${r.result}`,
    )
  }

  const bad = rows.filter((r) => r.oracle !== "r1")
  const good = rows.filter((r) => r.oracle === "r1")
  console.log(`\n誤5件のみ: chain=r2 & BB=${bad.filter((r) => r.chain === "r2" && r.isBB).length}/${bad.length}`)
  console.log(`正27件: chain=r2 & BB=${good.filter((r) => r.chain === "r2" && r.isBB).length}`)

  writeFileSync(join(root, "_data/diag_kikuchi_r1_features.json"), JSON.stringify(rows, null, 2))
}

main()
