/**
 * 二俣翔一: score_illustration 開始時 vs スポナビ公式（実況トークン）の PA 差分を列挙
 * npx tsx scripts/diag_futamata_score_pa_diff.ts
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000066"

const LABEL: Record<string, string> = {
  none: "無し",
  r1: "1塁",
  r2: "2塁",
  r3: "3塁",
  r12: "1・2塁",
  r13: "1・3塁",
  r23: "2・3塁",
  loaded: "満塁",
}

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function main(): void {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const mismatches: string[] = []

  for (const doc of docs) {
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!targetPas.length) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of targetPas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const official = sit(basesBeforeFromSportsnaviPlayLine(playLine))
      const score = sit(basesBeforeFromScoreIllustration(scoreCtx.get(pa.paId)))
      if (official === score || official === "?") continue
      const ctx = scoreCtx.get(pa.paId)
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      mismatches.push(
        [
          pa.paId,
          `公式=${LABEL[official] ?? official}`,
          `score=${LABEL[score] ?? score}`,
          `token=${token}`,
          `first=${JSON.stringify(ctx?.firstClass)}`,
          `chain=${JSON.stringify(ctx?.chainStart)}`,
          `em=${JSON.stringify(ctx?.firstEm)}`,
          result.slice(0, 30),
        ].join("\t"),
      )
    }
  }

  console.log(`二俣翔一 score_illustration vs 実況トークン 不一致: ${mismatches.length}打席\n`)
  for (const m of mismatches) console.log(m)
}

main()
