/**
 * 二俣翔一: lastClass（打席終了）vs score_illustration 開始 vs スポナビ REF の PA 差分を打席単位で究明。
 *
 *   npx tsx scripts/diag_futamata_result_ball_gap.ts
 */
import { join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import type { PlateAppearance } from "../lib/yahooGame/types"
import {
  basesBeforeFromScoreIllustration,
  basesFromScoreHtmlBaseClass,
  buildScoreBasesContextByPaId,
  scoreIndexPrefixForPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  basesBeforeForPlateAppearanceHybrid,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { plateAppearancePrefixFromScoreIndex } from "../lib/yahooGame/runnerEventsFromSportsnaviScore"
import { classifySituationAtPaStart, type Bases } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000066"
const REF: Record<string, number> = {
  none: 26,
  r1: 11,
  r2: 3,
  r3: 2,
  r12: 2,
  r13: 2,
  r23: 1,
  loaded: 0,
}

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

function sitKey(b: Bases | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function main(): void {
  const startCounts = new Map<string, number>()
  const lastCounts = new Map<string, number>()
  const driftRows: string[] = []

  for (const doc of loadCanonicalGamesMergedForDerivedPipeline(root)) {
    const gameId = doc.gameId
    const targetPas = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    if (!targetPas.length) continue

    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const snapshots = loadSportsnaviScoreSnapshots(root, gameId)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      snapshots,
    )

    for (const pa of targetPas) {
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) continue

      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = scoreCtx.get(pa.paId)
      const startB = basesBeforeForPlateAppearanceHybrid(pa, playLine, ctx)
      const lastB = ctx?.resultBallClass ?? null
      const startK = sitKey(startB)
      const lastK = sitKey(lastB)

      startCounts.set(startK, (startCounts.get(startK) ?? 0) + 1)
      lastCounts.set(lastK, (lastCounts.get(lastK) ?? 0) + 1)

      if (startK === lastK) continue

      const prefix = scoreIndexPrefixForPaId(pa.paId)
      const timeline = snapshots
        .filter((s) => plateAppearancePrefixFromScoreIndex(s.scoreIndex) === prefix)
        .map((s) => {
          const b = basesFromScoreHtmlBaseClass(s.html)
          return `${s.scoreIndex}:${LABEL[sitKey(b)] ?? "?"}`
        })
        .join(" → ")

      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      const refBucket = sitKey(basesBeforeFromSportsnaviPlayLine(playLine))
      const scoreStart = sitKey(basesBeforeFromScoreIllustration(ctx, playLine, pa))

      driftRows.push(
        [
          pa.paId,
          `結果=${result.slice(0, 20)}`,
          `token=${token}`,
          `REF≈text=${LABEL[refBucket] ?? refBucket}`,
          `hybrid/start=${LABEL[startK] ?? startK}`,
          `scoreStart=${LABEL[scoreStart] ?? scoreStart}`,
          `resultBall=${LABEL[lastK] ?? lastK}`,
          `timeline=${timeline || "(なし)"}`,
          explainDrift(startB, lastB, result),
        ].join("\n  "),
      )
    }
  }

  console.log("二俣翔一 — resultBallClass vs hybrid開始 の PA 集計\n")
  let l1Start = 0
  let l1Last = 0
  for (const k of Object.keys(REF)) {
    const s = startCounts.get(k) ?? 0
    const l = lastCounts.get(k) ?? 0
    const r = REF[k]!
    l1Start += Math.abs(s - r)
    l1Last += Math.abs(l - r)
    const mark = s === r ? "✓" : " "
    console.log(
      `${LABEL[k] ?? k}\tREF=${r}\thybrid=${s}${mark}\tresultBall=${l}\tΔrb=${l - r >= 0 ? "+" : ""}${l - r}`,
    )
  }
  console.log(`\nL1 vs REF: hybrid開始=${l1Start}  resultBallClass=${l1Last}`)

  console.log(`\n=== 開始≠終了の ${driftRows.length} 打席（REF は実況トークン≒hybrid開始と一致）===\n`)
  for (const row of driftRows) {
    console.log(row)
    console.log("")
  }
}

function explainDrift(start: Bases | null, end: Bases | null, result: string): string {
  if (!start || !end) return "cause=塁不明"
  const sk = sitKey(start)
  const ek = sitKey(end)
  if (/四球|敬遠|フォア/.test(result) && sk === "none" && ek === "r1") {
    return "cause=四球後の塁配置（lastClass=打席後1塁。スポナビは打席前=無し）"
  }
  if (/犠飛|犠牲フライ/.test(result) && sk === "r23" && ek === "r3") {
    return "cause=犠飛後（走者1人得点・打者アウト。lastClass=残塁3塁のみ）"
  }
  if (/三振/.test(result) && sk === "r3" && ek === "none") {
    return "cause=三振後（アウトのみ変化。lastClass=打席後の空塁）"
  }
  if (/安|ヒット|２|３|本/.test(result)) {
    return "cause=安打等で走者・打者の塁が再配置（lastClass=打席後の塁）"
  }
  return "cause=打席中/打席後の塁再配置"
}

main()
