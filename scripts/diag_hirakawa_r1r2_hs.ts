/**
 * 平川 r1/r2 打席別 H/SO 診断（平川試合のみ・高速）
 * npx tsx scripts/diag_hirakawa_r1r2_hs.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import {
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  emptyBattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { hitBases, isAtBat } from "../lib/yahooGame/resultJaHitBases"
import { isStrikeoutResultJa } from "../lib/yahooGame/paOutcomeResultJa"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"
const CANONICAL = join(root, "_data/scraped_games/canonical")
const playLines = JSON.parse(
  readFileSync(join(root, "_data/diag_hirakawa_play_lines.json"), "utf8"),
) as Record<string, string>
const gameIds = [...new Set(Object.keys(playLines).map((k) => k.split("-")[0]))].sort()

function main(): void {
  const r1: string[] = []
  const r2: string[] = []

  for (const gid of gameIds) {
    const doc = JSON.parse(
      readFileSync(join(CANONICAL, `${gid}.json`), "utf8"),
    ) as CanonicalGameDocument
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    if (!pas.length) continue
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, gid),
    )
    for (const pa of pas) {
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue
      const bases = basesBeforeForPlateAppearanceHybrid(
        pa,
        playMap.get(pa.paId),
        scoreCtx.get(pa.paId),
      )
      if (!bases) continue
      const { detail } = classifySituationAtPaStart(bases)
      const h = isAtBat(result) && hitBases(result) > 0 ? 1 : 0
      const so = isStrikeoutResultJa(result) ? 1 : 0
      const ab = isAtBat(result) ? 1 : 0
      const line = `${pa.paId}\t${detail}\tH=${h}\tSO=${so}\tAB=${ab}\t${result.slice(0, 40)}`
      if (detail === "r1") r1.push(line)
      if (detail === "r2") r2.push(line)
    }
  }

  const sum = (lines: string[], key: "H" | "SO" | "AB") =>
    lines.reduce((s, l) => s + Number(l.match(new RegExp(`${key}=(\\d)`))?.[1] ?? 0), 0)

  console.log(`r1: AB=${sum(r1, "AB")} H=${sum(r1, "H")} SO=${sum(r1, "SO")} (ref 17/6/3)`)
  for (const l of r1) console.log(l)
  console.log(`\nr2: AB=${sum(r2, "AB")} H=${sum(r2, "H")} SO=${sum(r2, "SO")} (ref 8/1/4)`)
  for (const l of r2) console.log(l)
}

main()
