/**
 * Phase 15: canonical から打席別（巡目）・状況別打撃スプリットを生成する。
 *
 * 巡目:
 *   試合内で当該打者の k 回目の打席を k 巡目（k>=5 は 5巡目以上）。paId でソート。
 *
 * 状況別 `base_sit`（スポナビ準拠・既定）:
 *   - **塁分類**: 打撃確定スナップ `resultBallClass`（一球速報 score の「＋N点」行の #base class）
 *   - **打点**: 同一スナップの `#result` span「＋N点」（`resultBallRbi`）。無いときのみ塁+結果の近似
 *   - **打席結果**: 出場成績末尾列（`appearance_only`）
 *   巡目・打順別・守備位置別の打席開始塁は textPlayByPlay → score ハイブリッド → pa.baseBefore。
 *
 * 状況別・塁（`TOPPAGE_SITUATION_BASES_SOURCE=score_illustration` または `--score-bases`）:
 *   巡目用の打席開始塁は score 入口スナップ。状況別分類・打点は上記と同じ resultBallClass / resultBallRbi。
 *
 * 状況別（`TOPPAGE_PLATE_RESULT_SOURCE=pitch_pbp`）:
 *   半回内の打席を一球の決着 resultJa で `paSituationSim` 簡易シミュ。結果も一球のみ（非本番）。
 *
 * 打順別（スタメン1〜9）・スタメン守備位置別:
 *   canonical の startingLineup（battingOrder / fieldingPosition + yahooPlayerId）で
 *   その試合の plateAppearances を集計。代打のみでスタメン名簿に無い打席は対象外。
 *   startingLineup の正: Phase2b が出場成績 HTML の括弧付き「位置」行から載せる（`sportsnaviStatsStartingLineup.mjs`）。
 *   古い canonical は `loadCanonicalGamesMergedForDerivedPipeline` が raw stats から注入。
 *
 * 出力:
 *   _data/derived/player_season_batting_splits/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase15_build_pa_round_and_situation_from_canonical.ts --year 2026
 *   # 塁=一球イラスト・結果=出場成績: npm run phase15:build:batting-splits:score-bases
 *   # 塁・結果とも一球: TOPPAGE_PLATE_RESULT_SOURCE=pitch_pbp npm run phase15:build:batting-splits:pitch-pbp
 *
 * 入力は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み canonical）。
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
  type Bases,
} from "../lib/yahooGame/paSituationSim"
import { isPlateResultPitchPbp } from "../lib/yahooGame/plateResultSourceFeatureFlag"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceResolvedResultText,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import { enrichSeasonStatsRowSabermetrics } from "../lib/seasonStatsPilotShared"
import { loadVsHandRowsFromCanonicalWithDebug } from "../lib/seasonStatsPilot"
import { basesBeforeForPlateAppearanceHybrid } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesAtResultBallForSituationSplit,
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
  type ScoreBasesContext,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { isSituationBasesFromScoreIllustration } from "../lib/yahooGame/situationBasesSourceFeatureFlag"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { battingSlashRatesFromCounts, slashRate3FromCounts } from "../lib/battingRateFormat"
import {
  STARTER_FIELD_TABLE_KEYS,
  labelForStarterFieldSplit,
  starterFieldSplitKeyFromLineupPosition,
} from "../lib/yahooGame/starterFieldPositionFromStats"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
    if (args[i] === "--pitch-pbp") {
      process.env.TOPPAGE_PLATE_RESULT_SOURCE = "pitch_pbp"
    }
    if (args[i] === "--score-bases") {
      process.env.TOPPAGE_SITUATION_BASES_SOURCE = "score_illustration"
    }
  }
  return { year }
}

function aggToSeasonStatsRow(
  splitType: "pa_round" | "base_sit" | "bat_order" | "starter_field" | "vs_hand",
  splitValue: string,
  splitLabel: string,
  agg: BattingSeasonAggYahoo
): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const slash = battingSlashRatesFromCounts(agg)
  const risp_avg = slashRate3FromCounts(agg.risp_h, agg.risp_ab)
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return enrichSeasonStatsRowSabermetrics({
    split_type: splitType,
    split_value: splitValue,
    split_label: splitLabel,
    g: agg.gameIds.size,
    pa: agg.pa,
    ab: agg.ab,
    r: agg.r,
    h: agg.h,
    h1,
    h2: agg.h2,
    h3: agg.h3,
    hr: agg.hr,
    tb: agg.tb,
    rbi: agg.rbi,
    so: agg.so,
    bb: agg.bb,
    ibb: agg.ibb,
    hbp: agg.hbp,
    sh: agg.sh,
    sf: agg.sf,
    sb: agg.sb,
    cs: agg.cs,
    e: agg.e,
    gidp: agg.gidp,
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
    risp_avg,
    risp_ab: agg.risp_ab,
    risp_h: agg.risp_h,
    sb_pct: sbPct == null ? "" : (sbPct * 100).toFixed(1),
    isop: ".000",
    isod: ".000",
    babip: ".000",
    bb_pct: ".000",
    k_pct: ".000",
    bbk: ".000",
    gpa: ".000",
    rc: ".0",
    xr: ".0",
    seca: ".000",
    ta: ".000",
    noi: ".000",
  })
}

function labelForPaRound(splitValue: string): string {
  if (splitValue === "1") return "1巡目"
  if (splitValue === "2") return "2巡目"
  if (splitValue === "3") return "3巡目"
  if (splitValue === "4") return "4巡目"
  return "5巡目以上"
}

function labelForBaseSit(splitValue: string): string {
  const m: Record<string, string> = {
    none: "無し",
    r1: "1塁",
    r2: "2塁",
    r3: "3塁",
    r12: "1・2塁",
    r13: "1・3塁",
    r23: "2・3塁",
    loaded: "満塁",
    risp: "得点圏",
    no_risp: "非得点圏",
  }
  return m[splitValue] ?? splitValue
}

/** スタメン打順 1〜9 → yahooPlayerId */
function starterSlotByYahooId(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const team of doc.game?.teams ?? []) {
    for (const p of team.startingLineup ?? []) {
      const id = (p.yahooPlayerId ?? "").trim()
      const bo = (p.battingOrder ?? "").trim()
      if (id && /^[1-9]$/.test(bo)) m.set(id, bo)
    }
  }
  return m
}

/** その試合のスタメン守備位置（表キー）→ yahooPlayerId */
function starterFieldKeyByYahooId(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const team of doc.game?.teams ?? []) {
    for (const p of team.startingLineup ?? []) {
      const id = (p.yahooPlayerId ?? "").trim()
      if (!id) continue
      const key = starterFieldSplitKeyFromLineupPosition(p.fieldingPosition)
      if (key) m.set(id, key)
    }
  }
  return m
}

function labelForBatOrderSlot(slot: string): string {
  return `${slot}番`
}

/** paId 例: 2021038624-1-表-1 → 回・表裏・連番でソート */
function comparePlateAppearances(a: PlateAppearance, b: PlateAppearance): number {
  const pa = parsePaId(a.paId)
  const pb = parsePaId(b.paId)
  if (pa && pb) {
    if (pa.inning !== pb.inning) return pa.inning - pb.inning
    if (pa.half !== pb.half) return pa.half - pb.half
    return pa.seq - pb.seq
  }
  return (a.paId ?? "").localeCompare(b.paId ?? "")
}

function parsePaId(paId: string): { inning: number; half: number; seq: number } | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parseInt(parts[parts.length - 3], 10)
  const halfStr = parts[parts.length - 2]
  const seq = parseInt(parts[parts.length - 1], 10)
  if (!Number.isFinite(inning) || !Number.isFinite(seq)) return null
  const half = halfStr === "表" ? 0 : halfStr === "裏" ? 1 : 9
  return { inning, half, seq }
}

/** 例: 1-表 → イニング内グループ用 */
function halfKeyFromPaId(paId: string): string | null {
  const parts = (paId ?? "").split("-")
  if (parts.length < 4) return null
  const inning = parts[parts.length - 3]
  const halfStr = parts[parts.length - 2]
  if (halfStr !== "表" && halfStr !== "裏") return null
  return `${inning}-${halfStr}`
}

function compareHalfKeys(a: string, b: string): number {
  const [ia, ta] = a.split("-")
  const [ib, tb] = b.split("-")
  const nia = parseInt(ia, 10) || 0
  const nib = parseInt(ib, 10) || 0
  if (nia !== nib) return nia - nib
  if (ta === tb) return 0
  return ta === "表" ? -1 : 1
}

function main(): void {
  const { year } = parseArgs()
  const usePitchPbp = isPlateResultPitchPbp()
  const useScoreBases = isSituationBasesFromScoreIllustration()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase15] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }
  // mergedDocsByGameId はマージ済み doc の参照（loadVsHand が gameId で取り出す）。

  /** batterId -> roundKey "1"|"2"|"3"|"4"|"5" -> Agg */
  const byBatterRound = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureRoundMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterRound.get(bid)
    if (!m) {
      m = new Map()
      byBatterRound.set(bid, m)
    }
    return m
  }

  const byBatterBatOrder = new Map<string, Map<string, BattingSeasonAggYahoo>>()
  const byBatterStarterField = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureBatOrderMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterBatOrder.get(bid)
    if (!m) {
      m = new Map()
      byBatterBatOrder.set(bid, m)
    }
    return m
  }

  function addBatOrderAgg(
    bid: string,
    slot: string,
    gameId: string,
    pa: PlateAppearance,
    doc: CanonicalGameDocument,
    basesBefore: Bases,
    scoreCtx: ScoreBasesContext | null | undefined,
  ): void {
    const bm = ensureBatOrderMap(bid)
    const key = `bat_order_${slot}`
    const agg = bm.get(key) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, gameId, pa, doc, basesBefore, scoreCtx)
    bm.set(key, agg)
  }

  function ensureStarterFieldMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterStarterField.get(bid)
    if (!m) {
      m = new Map()
      byBatterStarterField.set(bid, m)
    }
    return m
  }

  function addStarterFieldAgg(
    bid: string,
    fieldKey: string,
    gameId: string,
    pa: PlateAppearance,
    doc: CanonicalGameDocument,
    basesBefore: Bases,
    scoreCtx: ScoreBasesContext | null | undefined,
  ): void {
    const fm = ensureStarterFieldMap(bid)
    const agg = fm.get(fieldKey) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, gameId, pa, doc, basesBefore, scoreCtx)
    fm.set(fieldKey, agg)
  }

  const byBatterSit = new Map<string, Map<string, BattingSeasonAggYahoo>>()

  function ensureSitMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterSit.get(bid)
    if (!m) {
      m = new Map()
      byBatterSit.set(bid, m)
    }
    return m
  }

  function addSitAgg(
    bid: string,
    sitKey: string,
    gameId: string,
    pa: PlateAppearance,
    doc: CanonicalGameDocument,
    basesBefore: Bases,
    scoreCtx: ScoreBasesContext | null | undefined,
  ): void {
    const sm = ensureSitMap(bid)
    const agg = sm.get(sitKey) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, gameId, pa, doc, basesBefore, scoreCtx)
    sm.set(sitKey, agg)
  }

  function applyGameRbiReconcileFromBattingLines(
    doc: CanonicalGameDocument,
    inferredRbiByBid: Map<string, number>,
    byBatterRound: Map<string, Map<string, BattingSeasonAggYahoo>>,
    byBatterSit?: Map<string, Map<string, BattingSeasonAggYahoo>>,
  ): void {
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (!bid) continue
      const lineRbi = line.rbi ?? 0
      const inferred = inferredRbiByBid.get(bid) ?? 0
      const delta = lineRbi - inferred
      if (delta === 0) continue

      const roundBucket = byBatterRound.get(bid)
      if (roundBucket) {
        let bestKey = "5"
        let bestPa = -1
        for (const [rk, agg] of roundBucket) {
          if (agg.pa > bestPa) {
            bestPa = agg.pa
            bestKey = rk
          }
        }
        const roundAgg = roundBucket.get(bestKey) ?? emptyBattingSeasonAggYahoo()
        roundAgg.rbi += delta
        roundBucket.set(bestKey, roundAgg)
      }

      const sitBucket = byBatterSit?.get(bid)
      const rispAgg = sitBucket?.get("risp")
      if (rispAgg && rispAgg.pa > 0) {
        rispAgg.rbi += delta
        sitBucket!.set("risp", rispAgg)
      }

      inferredRbiByBid.set(bid, lineRbi)
    }
  }

  const mergedDocsByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) {
    const gid = String(d.gameId ?? "").trim()
    if (gid) mergedDocsByGameId.set(gid, d)
  }

  const allBattersWithPas = new Set<string>()

  for (const doc of docs) {
    const gameId = doc.gameId
    const pas = [...(doc.domain.plateAppearances ?? [])].sort(comparePlateAppearances)
    const appearanceCount = new Map<string, number>()
    const inferredRbiInGame = new Map<string, number>()
    const starterSlot = starterSlotByYahooId(doc)
    const starterField = starterFieldKeyByYahooId(doc)
    const playLineByPaId = usePitchPbp ? null : buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtxByPaId = buildScoreBasesContextByPaId(
      pas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(projectRoot, doc.gameId),
    )

    const halfGroups = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa)
      halfGroups.set(hk, list)
    }

    function processPlateAppearance(
      pa: PlateAppearance,
      basesBefore: Bases,
      basesForSituation: Bases | null,
      includeSituation: boolean,
    ): void {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) return
      allBattersWithPas.add(bid)

      const n = (appearanceCount.get(bid) ?? 0) + 1
      appearanceCount.set(bid, n)
      const roundKey = n <= 4 ? String(n) : "5"
      const roundMap = ensureRoundMap(bid)
      const scoreCtx = scoreCtxByPaId.get(pa.paId)
      const roundAgg = roundMap.get(roundKey) ?? emptyBattingSeasonAggYahoo()
      const rbiBefore = roundAgg.rbi
      updateBattingAggFromPa(roundAgg, gameId, pa, doc, basesBefore, scoreCtx)
      roundMap.set(roundKey, roundAgg)
      inferredRbiInGame.set(bid, (inferredRbiInGame.get(bid) ?? 0) + (roundAgg.rbi - rbiBefore))

      const slot = starterSlot.get(bid)
      if (slot) addBatOrderAgg(bid, slot, gameId, pa, doc, basesBefore, scoreCtx)
      const fieldKey = starterField.get(bid)
      if (fieldKey) addStarterFieldAgg(bid, fieldKey, gameId, pa, doc, basesBefore, scoreCtx)

      if (includeSituation && basesForSituation) {
        const { detail, risp } = classifySituationAtPaStart(basesForSituation)
        addSitAgg(bid, detail, gameId, pa, doc, basesForSituation, scoreCtx)
        if (risp) addSitAgg(bid, "risp", gameId, pa, doc, basesForSituation, scoreCtx)
        if (!risp) addSitAgg(bid, "no_risp", gameId, pa, doc, basesForSituation, scoreCtx)
      }
    }

    const sortedHalfKeys = [...halfGroups.keys()].sort(compareHalfKeys)
    for (const hk of sortedHalfKeys) {
      const groupPas = halfGroups.get(hk) ?? []
      if (usePitchPbp) {
        let state = emptyGameState()
        for (const pa of groupPas) {
          const basesBefore: Bases = {
            r1: state.b.r1,
            r2: state.b.r2,
            r3: state.b.r3,
          }
          const basesForSit = basesAtResultBallForSituationSplit(
            scoreCtxByPaId.get(pa.paId),
            basesBefore,
          )
          const result = plateAppearanceResolvedResultText(doc, pa).trim()
          if (result) processPlateAppearance(pa, basesBefore, basesForSit, true)
          else processPlateAppearance(pa, basesBefore, basesForSit, false)
          if (result) state = applyPlayResult(state, result)
        }
      } else {
        for (const pa of groupPas) {
          const scoreCtx = scoreCtxByPaId.get(pa.paId)
          const basesBefore = useScoreBases
            ? basesBeforeFromScoreIllustration(
                scoreCtx,
                playLineByPaId!.get(pa.paId),
                pa,
              )
            : basesBeforeForPlateAppearanceHybrid(
                pa,
                playLineByPaId!.get(pa.paId),
                scoreCtx,
              )
          const basesForSit = basesAtResultBallForSituationSplit(scoreCtx, basesBefore)
          const bForRound = basesBefore ?? { r1: false, r2: false, r3: false }
          processPlateAppearance(pa, bForRound, basesForSit, !!(basesBefore || basesForSit))
        }
      }
    }

    applyGameRbiReconcileFromBattingLines(doc, inferredRbiInGame, byBatterRound, byBatterSit)
  }

  const outDir = join(projectRoot, "_data", "derived", "player_season_batting_splits", year)
  mkdirSync(outDir, { recursive: true })

  for (const f of readdirSync(outDir)) {
    if (f.startsWith("yahoo_") && f.endsWith(".json")) {
      try {
        unlinkSync(join(outDir, f))
      } catch {
        // ignore
      }
    }
  }

  const roundOrder = ["1", "2", "3", "4", "5"]
  const sitOrder = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded", "risp", "no_risp"]
  const batOrderSlots = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  // Phase 27: phase11 (battingLines) には登場するが plateAppearances に出ない打者
  // （投手のエラー出塁のみ・代走のみ等）も vs_hand 行を出力するため、battingLines の打者も含める。
  const allBattersWithBattingLines = new Set<string>()
  for (const doc of docs) {
    for (const line of doc.domain?.battingLines ?? []) {
      const bid = String(line.yahooPlayerId ?? "").trim()
      if (bid) allBattersWithBattingLines.add(bid)
    }
  }
  const allBatterIds = new Set<string>([
    ...allBattersWithPas,
    ...byBatterRound.keys(),
    ...byBatterSit.keys(),
    ...byBatterBatOrder.keys(),
    ...byBatterStarterField.keys(),
    ...allBattersWithBattingLines,
  ])
  const batterIds = [...allBatterIds].sort()
  for (const bid of batterIds) {
    const roundMap = byBatterRound.get(bid)
    const sitMap = byBatterSit.get(bid)
    const batOrderMap = byBatterBatOrder.get(bid)
    const starterFieldMap = byBatterStarterField.get(bid)
    const rows: SeasonStatsRow[] = []
    const vsHand = loadVsHandRowsFromCanonicalWithDebug(bid, {
      preloadedCanonicalDocs: docs,
      mergedDocsByGameId,
    })
    for (const r of vsHand.rows) {
      if (r.split_type === "vs_hand") rows.push(r)
    }
    if (roundMap) {
      for (const rk of roundOrder) {
        const agg = roundMap.get(rk)
        if (agg && agg.pa > 0)
          rows.push(aggToSeasonStatsRow("pa_round", rk, labelForPaRound(rk), agg))
      }
    }
    if (sitMap) {
      for (const sk of sitOrder) {
        const agg = sitMap.get(sk)
        if (agg && agg.pa > 0)
          rows.push(aggToSeasonStatsRow("base_sit", sk, labelForBaseSit(sk), agg))
      }
    }
    if (batOrderMap) {
      for (const slot of batOrderSlots) {
        const boKey = `bat_order_${slot}`
        const agg = batOrderMap.get(boKey)
        if (agg && agg.pa > 0)
          rows.push(aggToSeasonStatsRow("bat_order", boKey, labelForBatOrderSlot(slot), agg))
      }
    }
    if (starterFieldMap) {
      for (const fk of STARTER_FIELD_TABLE_KEYS) {
        const agg = starterFieldMap.get(fk)
        if (agg && agg.pa > 0)
          rows.push(
            aggToSeasonStatsRow("starter_field", fk, labelForStarterFieldSplit(fk), agg),
          )
      }
    }
    const payload = {
      schemaVersion: "phase15-player-season-batting-splits-v2",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      meta: {
        paRoundDefinition:
          "試合内で当該打者の k 回目の打席を k 巡目（k>=5 は 5巡目以上に集約）。打席順は paId からソート。",
        situationSplits: "base_sit",
        situationClassification: "resultBallClass",
        situationRbiSource: "resultBallRbi",
        situationBasesSource: usePitchPbp
          ? "pitch_pbp_sim"
          : useScoreBases
            ? "score_illustration"
            : "text_hybrid",
        situationNote: usePitchPbp
          ? "非本番: 状況別は pitch_pbp シミュ。本番は appearance_only + resultBallClass/resultBallRbi。"
          : "状況別 base_sit: 塁=打撃確定スナップ resultBallClass（スポナビ一球速報）。打点=同一スナップ #result の「＋N点」resultBallRbi。打席結果=出場成績 zip。巡目・打順・守備位置の打席開始塁のみ text_hybrid（または score_illustration）。risp/no_risp 行の打点残差は試合出場成績との差を risp 行に補正。",
        plateResultSource: usePitchPbp ? "pitch_pbp" : "appearance_only",
        batOrderNote:
          "スタメン登録の打順（1〜9）。代打・途中出場のみでスタメン名簿に無い打席は集計対象外。",
        starterFieldNote:
          "スタメン登録の守備位置（出場成績 HTML の括弧付き「位置」）。同一選手が試合ごとに別守備でスタメンなら行が分かれる。",
        vsHandNote:
          "v1 から、対左右の R/L/unknown 合計は通算（Phase 11）と一致するよう、試合単位の Δ を不明バケツへ寄せて補完する。",
      },
      reconciliation: {
        // 通算（Phase 11）と R+L+unknown 合計の不一致を、試合単位で
        //   - 正の Δ（取りこぼし） → 不明バケツへ加算（Phase 25 = P0 / Phase 27 = H/HR）
        //   - 負の Δ（二重計上）   → 当該試合のバケツから減算（Phase 26 = P0 / Phase 27 = H/HR）
        // で寄せた集計。`negativeUnabsorbedDelta` は P0 の負 Δ が不明バケツ等で吸収しきれなかった残量。
        backfilledGames: vsHand.reconciliation.backfilledGames,
        negativeDeltaGames: vsHand.reconciliation.negativeDeltaGames,
        appliedDelta: vsHand.reconciliation.appliedDelta,
        negativeDelta: vsHand.reconciliation.negativeDelta,
        negativeAppliedDelta: vsHand.reconciliation.negativeAppliedDelta,
        negativeUnabsorbedDelta: vsHand.reconciliation.negativeUnabsorbedDelta,
        negativeDeltaSamples: vsHand.reconciliation.negativeDeltaSamples,
        // Phase 27: H/HR の Δ 吸収量（負 = 過剰計上の減算 / 正 = 取りこぼしの不明バケツ加算）
        negativeHrApplied: vsHand.reconciliation.negativeHrApplied,
        negativeHApplied: vsHand.reconciliation.negativeHApplied,
        positiveHrApplied: vsHand.reconciliation.positiveHrApplied,
        positiveHApplied: vsHand.reconciliation.positiveHApplied,
        // Phase 28: 出場成績テーブルの cells[14..] と pitchingLines (ip 累積) で
        // 不明 PA を R/L へ振り分けた量と、振り分け失敗の内訳。
        cellResolvedR: vsHand.reconciliation.cellResolvedR,
        cellResolvedL: vsHand.reconciliation.cellResolvedL,
        cellAmbiguousPas: vsHand.reconciliation.cellAmbiguousPas,
        cellPitcherHandUnknownPas: vsHand.reconciliation.cellPitcherHandUnknownPas,
        cellMissingTextPas: vsHand.reconciliation.cellMissingTextPas,
        cellTeamUnresolvedPas: vsHand.reconciliation.cellTeamUnresolvedPas,
        cellTeamUnresolvedSamples: vsHand.reconciliation.cellTeamUnresolvedSamples,
        cellAmbiguousSamples: vsHand.reconciliation.cellAmbiguousSamples,
      },
      source: {
        canonicalGames: docs.map((d) => d.gameId).sort(),
      },
      rows,
    }
    writeFileSync(join(outDir, `yahoo_${bid}.json`), JSON.stringify(payload, null, 2), "utf8")
  }

  console.log(`[phase15] wrote ${batterIds.length} files → ${outDir}`)
}

main()
