/**
 * 平川蓮: score 打席開始チェーン vs 入口class vs 結果球class
 * npx tsx scripts/compute_hirakawa_score_chain_situation.ts
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  basesFromScoreHtmlBaseClass,
  basesFromScoreSnapshotHtml,
  buildPaStartBasesFromScoreSnapshots,
  firstSnapshotHtmlForPaPrefix,
  lastSnapshotHtmlForPaPrefix,
  scoreIndexPrefixForPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { parsePaId, comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { basesBeforeForPlateAppearance } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  classifySituationAtPaStart,
  rbiCreditFromPlayResult,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { fileURLToPath } from "url"
import { join } from "path"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"

/** Yahoo 公式ランナー別（ユーザー提示・2026） */
const REF_PA: Record<string, number> = {
  none: 47,
  r1: 15,
  r2: 8,
  r3: 2,
  r12: 7,
  r13: 1,
  r23: 2,
  loaded: 3,
  risp: 23,
}

const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp"] as const

function halfKey(paId: string): string | null {
  const p = parsePaId(paId)
  if (!p) return null
  return `${p.inning}-${p.half}`
}

function applyPa(
  basesBefore: Bases | null,
  bySit: Map<string, number>,
  result: string,
): void {
  if (!basesBefore) return
  const { detail, risp } = classifySituationAtPaStart(basesBefore)
  bySit.set(detail, (bySit.get(detail) ?? 0) + 1)
  if (risp) bySit.set("risp", (bySit.get("risp") ?? 0) + 1)
}

function l1(bySit: Map<string, number>): number {
  return KEYS.reduce((s, k) => s + Math.abs((bySit.get(k) ?? 0) - REF_PA[k]), 0)
}

function main(): void {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
  const modes = {
    chain: new Map<string, number>(),
    firstClass: new Map<string, number>(),
    lastClass: new Map<string, number>(),
    lastSnap: new Map<string, number>(),
    text: new Map<string, number>(),
  }

  let total = 0
  let noResult = 0

  for (const doc of docs) {
    const target = (doc.domain.plateAppearances ?? []).filter(
      (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
    )
    if (target.length === 0) continue

    const snapshots = loadSportsnaviScoreSnapshots(root, doc.gameId)
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const pas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const halfGroups = new Map<string, string[]>()
    for (const pa of pas) {
      const hk = halfKey(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa.paId)
      halfGroups.set(hk, list)
    }

    const chainStart = new Map<string, Bases | null>()
    for (const [, ids] of halfGroups) {
      const m = buildPaStartBasesFromScoreSnapshots(ids, snapshots)
      for (const [id, b] of m) chainStart.set(id, b)
    }

    for (const pa of target) {
      total++
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      if (!result) {
        noResult++
        continue
      }

      const prefix = scoreIndexPrefixForPaId(pa.paId)
      const firstHtml = prefix ? firstSnapshotHtmlForPaPrefix(prefix, snapshots) : null
      const lastHtml = prefix ? lastSnapshotHtmlForPaPrefix(prefix, snapshots) : null

      applyPa(chainStart.get(pa.paId) ?? null, modes.chain, result)
      applyPa(
        firstHtml ? basesFromScoreHtmlBaseClass(firstHtml) : null,
        modes.firstClass,
        result,
      )
      applyPa(lastHtml ? basesFromScoreHtmlBaseClass(lastHtml) : null, modes.lastClass, result)
      applyPa(
        lastHtml ? basesFromScoreSnapshotHtml(lastHtml) : null,
        modes.lastSnap,
        result,
      )
      applyPa(
        basesBeforeForPlateAppearance(pa, playMap.get(pa.paId)),
        modes.text,
        result,
      )
    }
  }

  console.log(`平川蓮 PA=${total} noResult=${noResult}\n`)
  console.log("REF | " + KEYS.map((k) => REF_PA[k]).join(" | "))
  for (const [name, m] of Object.entries(modes)) {
    console.log(
      `${name.padEnd(12)} | ` +
        KEYS.map((k) => m.get(k) ?? 0).join(" | ") +
        `  L1=${l1(m)}`,
    )
  }
}

main()
