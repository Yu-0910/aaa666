/**
 * 実況 text vs score chain の塁不一致を全打席走査し (textSit, chainSit) パターンを集計。
 * npx tsx scripts/diag_text_chain_mismatch_catalog.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const CANONICAL = join(root, "_data/scraped_games/canonical")

type Row = {
  paId: string
  yahooId: string
  token: string
  textSit: string
  chainSit: string
  firstSit: string
}

function loadAllDocs(): CanonicalGameDocument[] {
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    out.push(JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument)
  }
  return out
}

function main(): void {
  const patternCount = new Map<string, number>()
  const samples = new Map<string, Row[]>()
  let total = 0
  let agree = 0

  for (const doc of loadAllDocs()) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    if (!allPas.length) continue
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of allPas) {
      const playLine = playMap.get(pa.paId)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const chain = scoreCtx.get(pa.paId)?.chainStart
      if (!textB || !chain) continue
      total++
      const textSit = classifySituationAtPaStart(textB).detail
      const chainSit = classifySituationAtPaStart(chain).detail
      const first = scoreCtx.get(pa.paId)?.firstClass
      const firstSit = first ? classifySituationAtPaStart(first).detail : "?"
      if (textSit === chainSit) {
        agree++
        continue
      }
      const key = `${textSit}=>${chainSit}`
      patternCount.set(key, (patternCount.get(key) ?? 0) + 1)
      const list = samples.get(key) ?? []
      if (list.length < 5) {
        list.push({
          paId: pa.paId,
          yahooId: (pa.yahooBatterId ?? "").trim(),
          token: extractSportsnaviSituationTokenFromPlayLine(playLine ?? "") ?? "-",
          textSit,
          chainSit,
          firstSit,
        })
        samples.set(key, list)
      }
    }
  }

  console.log(`text+chain 両方解析可: ${total} | 一致: ${agree} | 不一致: ${total - agree}\n`)
  console.log("パターン (text=>chain) 件数 サンプル")
  for (const [k, c] of [...patternCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`\n${k}\t${c}`)
    for (const s of samples.get(k) ?? []) {
      console.log(
        `  ${s.paId} yahoo=${s.yahooId} token=${s.token} first=${s.firstSit}`,
      )
    }
  }

  const outPath = join(root, "_data/diag_text_chain_mismatch_catalog.json")
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        total,
        agree,
        mismatch: total - agree,
        patterns: Object.fromEntries(
          [...patternCount.entries()].sort((a, b) => b[1] - a[1]),
        ),
        samples: Object.fromEntries(samples),
      },
      null,
      2,
    ),
  )
  console.log(`\nWrote ${outPath}`)
}

main()
