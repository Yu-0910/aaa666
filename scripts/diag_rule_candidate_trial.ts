/**
 * ルール候補の5人 L1 試算（シミュレーション assign 関数を差し替え）
 * npx tsx scripts/diag_rule_candidate_trial.ts [ruleId]
 */
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { join } from "path"
import { fileURLToPath } from "url"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  applyTextScoreConflictOverride,
  applyMidPaStealChainOverride,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import type { Bases } from "../lib/yahooGame/paSituationSim"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromResultJa,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { isWalkLikeResultText } from "../lib/baseballWalkResult"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import type { PlateAppearance } from "../lib/yahooGame/types"
import type { ScoreBasesContext } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")

type RefRow = {
  pa: number
  ab: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  sh: number
  sf: number
}

const PILOTS: { id: string; name: string; ref: Record<string, RefRow> }[] = [
  {
    id: "2000066",
    name: "二俣翔一",
    ref: {
      none: { pa: 26, ab: 25, h: 3, hr: 1, so: 9, bb: 1, hbp: 0, sh: 0, sf: 0 },
      r1: { pa: 11, ab: 11, h: 3, hr: 0, so: 2, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r12: { pa: 2, ab: 2, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r13: { pa: 2, ab: 1, h: 1, hr: 0, so: 0, bb: 0, hbp: 1, sh: 0, sf: 0 },
      r2: { pa: 3, ab: 2, h: 0, hr: 0, so: 2, bb: 0, hbp: 0, sh: 1, sf: 0 },
      r23: { pa: 1, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 1 },
      r3: { pa: 2, ab: 2, h: 1, hr: 0, so: 1, bb: 0, hbp: 0, sh: 0, sf: 0 },
      loaded: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    },
  },
  {
    id: "2110164",
    name: "平川蓮",
    ref: {
      none: { pa: 51, ab: 48, h: 6, so: 19, bb: 2, hbp: 1, sh: 0, sf: 0, hr: 0 },
      r1: { pa: 18, ab: 17, h: 6, so: 3, bb: 0, hbp: 0, sh: 1, sf: 0, hr: 0 },
      r2: { pa: 8, ab: 8, h: 1, so: 4, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r3: { pa: 3, ab: 3, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r12: { pa: 8, ab: 8, h: 1, so: 3, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r13: { pa: 1, ab: 1, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r23: { pa: 2, ab: 1, h: 0, so: 1, bb: 1, hbp: 0, sh: 0, sf: 0, hr: 0 },
      loaded: { pa: 3, ab: 2, h: 1, so: 0, bb: 1, hbp: 0, sh: 0, sf: 0, hr: 0 },
    },
  },
  {
    id: "2112143",
    name: "佐藤啓介",
    ref: {
      none: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r1: { pa: 3, ab: 2, h: 1, hr: 0, so: 1, bb: 1, hbp: 0, sh: 0, sf: 0 },
      r12: { pa: 4, ab: 3, h: 1, hr: 0, so: 1, bb: 1, hbp: 0, sh: 0, sf: 0 },
      r13: { pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r2: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r23: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r3: { pa: 2, ab: 2, h: 1, hr: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      loaded: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    },
  },
  {
    id: "1100082",
    name: "菊池涼介",
    ref: {
      none: { pa: 120, ab: 108, h: 23, hr: 0, so: 28, bb: 12, hbp: 0, sh: 0, sf: 0 },
      r1: { pa: 27, ab: 18, h: 6, hr: 1, so: 5, bb: 4, hbp: 0, sh: 5, sf: 0 },
      r12: { pa: 13, ab: 9, h: 2, hr: 1, so: 1, bb: 4, hbp: 0, sh: 0, sf: 0 },
      r13: { pa: 4, ab: 2, h: 0, hr: 0, so: 1, bb: 1, hbp: 0, sh: 1, sf: 0 },
      r2: { pa: 10, ab: 7, h: 2, hr: 0, so: 1, bb: 1, hbp: 0, sh: 2, sf: 0 },
      r23: { pa: 1, ab: 1, h: 1, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
      r3: { pa: 8, ab: 5, h: 1, hr: 0, so: 1, bb: 2, hbp: 0, sh: 0, sf: 1 },
      loaded: { pa: 1, ab: 1, h: 0, hr: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0 },
    },
  },
  {
    id: "2000051",
    name: "佐藤輝明",
    ref: {
      none: { pa: 123, ab: 113, h: 41, so: 0, bb: 10, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r1: { pa: 48, ab: 43, h: 14, so: 0, bb: 5, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r2: { pa: 20, ab: 12, h: 6, so: 0, bb: 8, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r3: { pa: 8, ab: 7, h: 3, so: 0, bb: 1, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r12: { pa: 14, ab: 11, h: 6, so: 0, bb: 3, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r13: { pa: 4, ab: 3, h: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      r23: { pa: 3, ab: 3, h: 1, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
      loaded: { pa: 5, ab: 4, h: 2, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, hr: 0 },
    },
  },
]

function isR1Only(b: Bases): boolean {
  return b.r1 && !b.r2 && !b.r3
}
function isR2Only(b: Bases): boolean {
  return !b.r1 && b.r2 && !b.r3
}
function isR3Only(b: Bases): boolean {
  return !b.r1 && !b.r2 && b.r3
}
function isNone(b: Bases): boolean {
  return !b.r1 && !b.r2 && !b.r3
}

/** 候補ルール: 現行 hybrid の上に追加 */
function applyCandidateRule(
  ruleId: string,
  bases: Bases,
  pa: PlateAppearance,
  playLine: string | undefined,
  scoreCtx: ScoreBasesContext | null | undefined,
  result: string,
): Bases {
  if (ruleId === "baseline") return bases
  const chain = scoreCtx?.chainStart
  const token = extractSportsnaviSituationTokenFromPlayLine(playLine ?? "") ?? ""

  // A: text=一塁 & chain=二塁のみ → 二塁（一死一塁も含め拡張）
  if (ruleId === "r1_chain_r2_all") {
    if (isR1Only(bases) && chain && isR2Only(chain)) return chain
  }

  // B: text=一塁 & chain=一二塁 → なし（菊池探索用・8905却下と衝突リスク大）
  if (ruleId === "r1_chain_r12_to_none") {
    if (isR1Only(bases) && chain && chain.r1 && chain.r2 && !chain.r3) return { r1: false, r2: false, r3: false }
  }

  // C: firstClass=三塁 & text=一塁 → 三塁
  if (ruleId === "r1_first_r3") {
    const first = scoreCtx?.firstClass
    if (isR1Only(bases) && first && isR3Only(first)) return first
  }

  // D: firstClass=なし & text=一塁 → なし
  if (ruleId === "r1_first_none") {
    const first = scoreCtx?.firstClass
    if (isR1Only(bases) && first && isNone(first)) return first
  }

  // E: text=二塁のみ & chain=三塁のみ & firstEm=三塁 → 三塁（8920 SF 行）
  if (ruleId === "r2_chain_em_r3") {
    const firstEm = scoreCtx?.firstEm
    if (
      bases.r1 === false &&
      bases.r2 === true &&
      bases.r3 === false &&
      chain &&
      !chain.r1 &&
      !chain.r2 &&
      chain.r3 &&
      firstEm &&
      isR3Only(firstEm)
    ) {
      return firstEm
    }
  }

  // G: text=二塁のみ & firstEm=三塁のみ → 三塁（score 入口 em 優先）
  if (ruleId === "r2_em_r3") {
    const firstEm = scoreCtx?.firstEm
    if (isR2Only(bases) && firstEm && isR3Only(firstEm)) return firstEm
  }

  if (ruleId === "r2_chain_em_r3_sf") {
    const firstEm = scoreCtx?.firstEm
    if (
      /犠飛/.test(result) &&
      bases.r1 === false &&
      bases.r2 === true &&
      bases.r3 === false &&
      chain &&
      !chain.r1 &&
      !chain.r2 &&
      chain.r3 &&
      firstEm &&
      isR3Only(firstEm)
    ) {
      return firstEm
    }
  }

  // F: 入口 em が明示されていれば em 優先（単塁行のみ: none/r1/r2/r3）
  if (ruleId === "prefer_first_em") {
    const firstEm = scoreCtx?.firstEm
    if (firstEm) {
      const t = classifySituationAtPaStart(bases).detail
      const e = classifySituationAtPaStart(firstEm).detail
      if (t !== e && ["none", "r1", "r2", "r3"].includes(t) && ["none", "r1", "r2", "r3"].includes(e)) {
        return firstEm
      }
    }
  }

  // H: 菊池 Per-PA 探索パック（打席中イベント系）
  if (ruleId === "kik_pack_all" || ruleId.startsWith("kik_")) {
    const line = (playLine ?? "").trim()
    const bb = isWalkLikeResultText(result)

    if (
      (ruleId === "kik_pack_all" || ruleId === "kik_steal_bb_none") &&
      isR1Only(bases) &&
      chain &&
      isR2Only(chain) &&
      bb &&
      /盗塁成功|盗塁:/.test(line)
    ) {
      return { r1: false, r2: false, r3: false }
    }

    if (
      (ruleId === "kik_pack_all" || ruleId === "kik_nishi_r12_bb_r3") &&
      isR1Only(bases) &&
      chain &&
      chain.r1 &&
      chain.r2 &&
      !chain.r3 &&
      token === "二死一塁" &&
      bb
    ) {
      return { r1: false, r2: false, r3: true }
    }

    if (
      (ruleId === "kik_pack_all" || ruleId === "kik_pb_chain2_r3") &&
      isR1Only(bases) &&
      chain &&
      isR2Only(chain) &&
      /パスボール|暴投/.test(line)
    ) {
      return { r1: false, r2: false, r3: true }
    }

    if (
      (ruleId === "kik_pack_all" || ruleId === "kik_dp_cho_r3") &&
      isR1Only(bases) &&
      chain &&
      isR1Only(chain) &&
      /一直/.test(result) &&
      /ダブルプレー/.test(line)
    ) {
      return { r1: false, r2: false, r3: true }
    }
  }

  return bases
}

function basesWithRule(
  ruleId: string,
  pa: PlateAppearance,
  playLine: string | undefined,
  scoreCtx: ScoreBasesContext | null | undefined,
  result: string,
): Bases | null {
  const fromText = basesBeforeFromSportsnaviPlayLine(playLine)
  if (fromText) {
    let b = applyMidPaStealChainOverride(fromText, scoreCtx)
    b = applyTextScoreConflictOverride(b, playLine, pa, scoreCtx)
    b = applyCandidateRule(ruleId, b, pa, playLine, scoreCtx, result)
    return b
  }
  return basesBeforeForPlateAppearanceHybrid(pa, playLine, scoreCtx)
}

function l1(ref: Record<string, RefRow>, bySit: Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>): number {
  let d = 0
  for (const [k, r] of Object.entries(ref)) {
    const g = bySit.get(k) ?? emptyBattingSeasonAggYahoo()
    d +=
      Math.abs(g.pa - r.pa) +
      Math.abs(g.ab - r.ab) +
      Math.abs(g.h - r.h) +
      Math.abs(g.hr - r.hr) +
      Math.abs(g.so - r.so) +
      Math.abs(g.bb - r.bb) +
      Math.abs(g.hbp - r.hbp) +
      Math.abs(g.sh - r.sh) +
      Math.abs(g.sf - r.sf)
  }
  return d
}

function computeAllRules(
  yahooId: string,
  ref: Record<string, RefRow>,
  ruleIds: string[],
  docs: ReturnType<typeof loadCanonicalGamesMergedForDerivedPipeline>,
): Record<string, number> {
  const aggs: Record<string, Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>> = {}
  for (const rid of ruleIds) aggs[rid] = new Map()

  for (const doc of docs) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((x) => (x.yahooBatterId ?? "").trim() === yahooId)
    if (pas.length === 0) continue
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((x) => x.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of pas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const result = plateAppearanceResolvedResultText(doc, pa).trim()
      const ctx = scoreCtx.get(pa.paId)
      for (const ruleId of ruleIds) {
        const b = basesWithRule(ruleId, pa, playLine, ctx, result)
        const sit = b ? classifySituationAtPaStart(b).detail : "none"
        const bySit = aggs[ruleId]!
        const agg = bySit.get(sit) ?? emptyBattingSeasonAggYahoo()
        agg.pa += 1
        updateBattingAggFromResultJa(agg, result)
        bySit.set(sit, agg)
      }
    }
  }

  const out: Record<string, number> = {}
  for (const rid of ruleIds) out[rid] = l1(ref, aggs[rid]!)
  return out
}

function computeL1(yahooId: string, ref: Record<string, RefRow>, ruleId: string, docs: ReturnType<typeof loadCanonicalGamesMergedForDerivedPipeline>): number {
  return computeAllRules(yahooId, ref, [ruleId], docs)[ruleId]!
}

const rules = ["baseline", "kik_pack_all", "kik_steal_bb_none", "kik_nishi_r12_bb_r3", "kik_pb_chain2_r3", "kik_dp_cho_r3"]
const pick = process.argv[2]?.trim()

console.log("Loading canonical games...")
const docs = loadCanonicalGamesMergedForDerivedPipeline(root)
console.log(`Loaded ${docs.length} games\n`)

if (pick) {
  console.log(`Rule: ${pick}\n`)
  for (const p of PILOTS) {
    const score = computeAllRules(p.id, p.ref, [pick], docs)[pick]!
    console.log(`${p.name} (${p.id}): L1=${score}`)
  }
} else {
  console.log("5人 × ルール候補 L1\n")
  console.log("rule\t" + PILOTS.map((p) => p.name).join("\t"))
  const byPilot = PILOTS.map((p) => computeAllRules(p.id, p.ref, rules, docs))
  for (const ruleId of rules) {
    const cols = byPilot.map((s) => String(s[ruleId]))
    console.log(`${ruleId}\t${cols.join("\t")}`)
  }
}
