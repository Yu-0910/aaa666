/**
 * 菊池 — 5打席 + SF候補の score タイムライン深掘り
 * npx tsx scripts/diag_kikuchi_score_timeline.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesFromScoreHtmlBaseClass,
  basesFromScoreHtmlRunnerEm,
  buildScoreBasesContextByPaId,
  scoreIndexPrefixForPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { plateAppearancePrefixFromScoreIndex } from "../lib/yahooGame/runnerEventsFromSportsnaviScore"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "1100082"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const FOCUS = [
  "2021038624-9-裏-2",
  "2021038734-3-裏-3",
  "2021038636-4-裏-3",
  "2021038699-1-表-2",
  "2021038788-6-表-4",
  "2021038920-6-裏-3", // SF 二塁→三塁候補
]

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function snapLabel(html: string): string {
  const em = basesFromScoreHtmlRunnerEm(html)
  const cls = basesFromScoreHtmlBaseClass(html)
  const emTxt = html.match(/<em>([^<]*)<\/em>/i)?.[1]?.trim() ?? ""
  return `em=${sit(em) ?? "?"}(${emTxt.slice(0, 24)}) class=${sit(cls) ?? "?"}`
}

function main(): void {
  const best = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_reassign_best.json"), "utf8"))
  const oracle = new Map<string, string>()
  for (const r of best.toNone) oracle.set(r.paId, "none")
  for (const r of best.toR3) oracle.set(r.paId, "r3")

  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const doc = JSON.parse(readFileSync(join(CANONICAL, f), "utf8")) as CanonicalGameDocument
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const kikuchi = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    const focusInGame = kikuchi.filter((p) => FOCUS.includes(p.paId))
    if (focusInGame.length === 0) continue

    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const snaps = loadSportsnaviScoreSnapshots(root, doc.gameId)
    const ctxMap = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      snaps,
    )

    console.log(`\n======== ${doc.gameId} ========\n`)

    for (const pa of focusInGame) {
      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = ctxMap.get(pa.paId)
      const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      const text = basesBeforeFromSportsnaviPlayLine(playLine)
      const prefix = scoreIndexPrefixForPaId(pa.paId)

      console.log(`--- ${pa.paId} ---`)
      console.log(`oracle行: ${oracle.get(pa.paId) ?? "(SF/other)"}`)
      console.log(`play: ${playLine.slice(0, 100)}`)
      console.log(
        `text=${sit(text)} hybrid=${sit(hybrid)} chain=${sit(ctx?.chainStart)} first=${sit(ctx?.firstClass)} em=${sit(ctx?.firstEm)} last=${sit(ctx?.lastClass)}`,
      )
      console.log(`baseBefore field: ${JSON.stringify(pa.baseBefore ?? null)}`)

      const paSnaps = snaps
        .filter((s) => plateAppearancePrefixFromScoreIndex(s.scoreIndex) === prefix)
        .sort((a, b) => a.scoreIndex.localeCompare(b.scoreIndex))

      console.log(`score snaps (${paSnaps.length}):`)
      for (const s of paSnaps) {
        console.log(`  ${s.scoreIndex}  ${snapLabel(s.html)}`)
      }

      // 半回内前打席
      const p = pa.paId.match(/^(\d+-\d+-[表裏])-(\d+)$/)
      if (p) {
        const halfKey = p[1]!
        const seq = Number(p[2])
        const halfPas = allPas.filter((x) => x.paId.startsWith(halfKey + "-")).sort((a, b) =>
          comparePaIdChronological(a.paId, b.paId),
        )
        const prev = halfPas.find((x) => Number(x.paId.split("-").pop()) === seq - 1)
        if (prev) {
          const prevCtx = ctxMap.get(prev.paId)
          console.log(`前打席 ${prev.paId}: last=${sit(prevCtx?.lastClass)} chain→当打席=${sit(ctx?.chainStart)}`)
        }
      }
      console.log()
    }
  }

  // SF / 行差分サマリ
  const perPa = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")).paRows as Array<{
    paId: string
    hybrid: string
    text: string
    chain: string
    first: string
    result: string
    sf: number
  }>

  console.log("\n======== SF / text≠chain（菊池） ========\n")
  for (const r of perPa) {
    if (r.sf !== 1 && r.text === r.chain) continue
    if (r.sf === 1 || r.text !== r.chain) {
      const tag = r.sf === 1 ? "SF" : "mismatch"
      console.log(
        `${tag}\t${r.paId}\thybrid=${r.hybrid}\ttext=${r.text}\tchain=${r.chain}\tfirst=${r.first}\t${r.result.slice(0, 20)}`,
      )
    }
  }
}

main()
