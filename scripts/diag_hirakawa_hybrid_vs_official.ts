/**
 * 平川: 4点修正ハイブリッド vs 公式 best_assign の per-PA 突合
 * npx tsx scripts/diag_hirakawa_hybrid_vs_official.ts
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeForPlateAppearanceHybrid,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"
const OFFICIAL = JSON.parse(
  readFileSync(join(root, "_data/diag_hirakawa_best_assign.json"), "utf8"),
) as Record<string, string>

const AB_EXCL = /四球|敬遠|申告|死球|犠打|犠飛|妨害|打撃妨害|走塁妨害|押出/
const H_RE = /一塁打|二塁打|三塁打|本塁打|安打|ヒット|単打|二塁安|三塁安/
const SO_RE = /三振|見逃し|空振り/

function stat(result: string): { ab: number; h: number; so: number } {
  const r = result.replace(/\[[^\]]*\]/g, "").trim()
  return {
    ab: AB_EXCL.test(r) ? 0 : 1,
    h: H_RE.test(r) ? 1 : 0,
    so: SO_RE.test(r) ? 1 : 0,
  }
}

function main(): void {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const mismatches: string[] = []
  const r1r2: string[] = []

  for (const doc of docs) {
    const pas = [...(doc.domain.plateAppearances ?? [])]
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (pas.length === 0) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of pas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      const bases = basesBeforeForPlateAppearanceHybrid(
        pa,
        playLine,
        scoreCtx.get(pa.paId),
      )
      const got = bases ? classifySituationAtPaStart(bases).detail : "?"
      const official = OFFICIAL[pa.paId]
      const st = stat(result)
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      const ctx = scoreCtx.get(pa.paId)

      if (official && got !== official) {
        mismatches.push(
          `${pa.paId} official=${official} got=${got} ab=${st.ab} h=${st.h} so=${st.so} token=${token} bb=${pa.baseBefore !== undefined} chain=${ctx?.chainStart ? "y" : "n"} first=${ctx?.firstClass ? JSON.stringify(ctx.firstClass) : "-"} | ${result.slice(0, 40)}`,
        )
      }
      if ((got === "r1" || got === "r2" || official === "r1" || official === "r2") && st.ab) {
        r1r2.push(
          `${pa.paId}\t${official ?? "?"}\t${got}\t${st.h}\t${st.so}\t${token}\t${result.slice(0, 35)}`,
        )
      }
    }
  }

  console.log(`公式不一致: ${mismatches.length}打席\n`)
  for (const m of mismatches) console.log(m)

  console.log("\n--- r1/r2 打席一覧 (official vs got) ---")
  for (const line of r1r2) console.log(line)
}

main()
