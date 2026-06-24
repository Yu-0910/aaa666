/**
 * 佐藤輝明: score_illustration の誤振り分け候補を特定
 * npx tsx scripts/diag_sato_teruaki_find_mismatch.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
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

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const REF: Record<string, number> = {
  none: 123,
  r1: 48,
  r2: 20,
  r3: 8,
  r12: 14,
  r13: 4,
  r23: 3,
  loaded: 5,
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

const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const

type PaRow = {
  paId: string
  score: string
  text: string
  first: string
  chain: string
  token: string
  result: string
  override: boolean
}

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function l1Pa(counts: Map<string, number>): number {
  let d = 0
  for (const k of KEYS) d += Math.abs((counts.get(k) ?? 0) - REF[k])
  return d
}

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

function aggregate(assign: Map<string, string>): Map<string, number> {
  const m = new Map<string, number>()
  for (const sit of assign.values()) {
    m.set(sit, (m.get(sit) ?? 0) + 1)
  }
  return m
}

function main(): void {
  const rows: PaRow[] = []
  const scoreAssign = new Map<string, string>()
  const textAssign = new Map<string, string>()

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
      const scoreB = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      if (!textB || !scoreB) continue

      const textK = classifySituationAtPaStart(textB).detail
      const scoreK = classifySituationAtPaStart(scoreB).detail
      const firstK = sit(ctx?.firstClass)
      const chainK = sit(ctx?.chainStart)
      const override = firstK !== scoreK

      scoreAssign.set(pa.paId, scoreK)
      textAssign.set(pa.paId, textK)
      rows.push({
        paId: pa.paId,
        score: scoreK,
        text: textK,
        first: firstK,
        chain: chainK,
        token: extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-",
        result: plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 28),
        override,
      })
    }
  }

  console.log(`佐藤輝明 — 打席 ${rows.length} / REF合計 ${Object.values(REF).reduce((a, b) => a + b, 0)}\n`)
  console.log(`L1(PA) score_illustration = ${l1Pa(aggregate(scoreAssign))}`)
  console.log(`L1(PA) text only          = ${l1Pa(aggregate(textAssign))}`)

  const scoreCounts = aggregate(scoreAssign)
  console.log("\n=== 行別 ΔPA (score vs ref) ===")
  for (const k of KEYS) {
    const got = scoreCounts.get(k) ?? 0
    const d = got - REF[k]
    if (d !== 0) console.log(`  ${LABEL[k]}: ${d >= 0 ? "+" : ""}${d} (集計${got} / ref${REF[k]})`)
  }

  console.log("\n=== score≠text（全件） ===")
  const diffText = rows.filter((r) => r.score !== r.text)
  console.log(`件数: ${diffText.length}\n`)
  for (const r of diffText) {
    console.log(
      `${r.paId}\tscore=${LABEL[r.score]}\ttext=${LABEL[r.text]}\tfirst=${LABEL[r.first] ?? r.first}\tchain=${LABEL[r.chain] ?? r.chain}\t${r.token}\t${r.result}`,
    )
  }

  console.log("\n=== 過剰行の候補: score=なし & text≠なし（なし+7 の主因候補） ===")
  const noneOver = rows.filter((r) => r.score === "none" && r.text !== "none")
  for (const r of noneOver) {
    console.log(
      `${r.paId}\t→text=${LABEL[r.text]}\tfirst=${LABEL[r.first]}\tchain=${LABEL[r.chain]}\t${r.token}\t${r.result}`,
    )
  }
  console.log(`件数: ${noneOver.length}`)

  console.log("\n=== 入口補正が効いた打席（first≠score） ===")
  for (const r of rows.filter((x) => x.override)) {
    console.log(
      `${r.paId}\tfirst=${LABEL[r.first]}\tscore=${LABEL[r.score]}\ttext=${LABEL[r.text]}\t${r.token}\t${r.result}`,
    )
  }

  console.log("\n=== 単独打席の再割当で L1=0 になる候補（総当たり） ===")
  const hits: PaRow[] = []
  for (const r of rows) {
    const trial = new Map(scoreAssign)
    for (const k of KEYS) {
      if (k === r.text) trial.set(r.paId, r.text)
      else if (trial.get(r.paId) === k && k !== r.text) {
        /* try moving this PA to each bucket */
      }
    }
    for (const target of KEYS) {
      if (target === r.score) continue
      const t = new Map(scoreAssign)
      t.set(r.paId, target)
      if (l1Pa(aggregate(t)) === 0) hits.push({ ...r, score: `${LABEL[r.score]}→${LABEL[target]}` } as PaRow & { score: string })
    }
  }
  const seen = new Set<string>()
  for (const r of rows) {
    for (const target of KEYS) {
      if (target === scoreAssign.get(r.paId)) continue
      const t = new Map(scoreAssign)
      t.set(r.paId, target)
      if (l1Pa(aggregate(t)) !== 0) continue
      const key = `${r.paId}→${target}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(
        `${r.paId}\t${LABEL[scoreAssign.get(r.paId)!]}→${LABEL[target]}\t${r.token}\tfirst=${LABEL[r.first]}\tchain=${LABEL[r.chain]}\t${r.result}`,
      )
    }
  }

  console.log("\n=== text に戻すと L1 が改善する打席 ===")
  const textTrial = new Map(scoreAssign)
  for (const r of diffText) textTrial.set(r.paId, r.text)
  console.log(`全 score≠text を text に戻す → L1=${l1Pa(aggregate(textTrial))}`)
}

main()
