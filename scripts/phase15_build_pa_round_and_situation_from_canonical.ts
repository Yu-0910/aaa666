/**
 * Phase 15: canonical から打席別（巡目）・状況別打撃スプリットを生成する。
 *
 * 巡目:
 *   試合内で当該打者の k 回目の打席を k 巡目（k>=5 は 5巡目以上）。paId でソート。
 *
 * 状況別:
 *   イニング（表裏）ごとに打席を順に処理し、打席結果テキストで走者を簡易シミュレーション
 *   （lib/yahooGame/paSituationSim）。先頭球時点のメタが無い場合の近似。
 *
 * 打順別（スタメン1〜9）:
 *   canonical の startingLineup（battingOrder + yahooPlayerId）でスタメン打順を取得し、
 *   同一試合の plateAppearances を集計。名簿に無い打席（代打のみ等）は対象外。
 *
 * 出力:
 *   _data/derived/player_season_batting_splits/{year}/yahoo_{yahooBatterId}.json
 *
 * 使い方:
 *   npx tsx scripts/phase15_build_pa_round_and_situation_from_canonical.ts --year 2026
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import {
  applyPlayResult,
  classifySituationAtPaStart,
  emptyGameState,
} from "../lib/yahooGame/paSituationSim"
import {
  emptyBattingSeasonAggYahoo,
  plateAppearanceLastResultText,
  updateBattingAggFromPa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import {
  loadVsHandRowsFromCanonicalWithDebug,
  mergePhase10RestoredIntoDocIfPresent,
} from "../lib/seasonStatsPilot"

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
  }
  return { year }
}

function fmtSlash3(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ".000"
  const s = n.toFixed(3)
  return s.startsWith("0") ? s.slice(1) : s
}

function aggToSeasonStatsRow(
  splitType: "pa_round" | "base_sit" | "bat_order" | "vs_hand",
  splitValue: string,
  splitLabel: string,
  agg: BattingSeasonAggYahoo
): SeasonStatsRow {
  const h1 = Math.max(0, agg.h - agg.h2 - agg.h3 - agg.hr)
  const avg = agg.ab > 0 ? agg.h / agg.ab : null
  const obpDen = agg.ab + agg.bb + agg.hbp + agg.sf
  const obp = obpDen > 0 ? (agg.h + agg.bb + agg.hbp) / obpDen : null
  const slg = agg.ab > 0 ? agg.tb / agg.ab : null
  // AB=0（四死球のみ等）では SLG は定義されないが、OPS は OBP+0 とみなす
  const ops = obp != null ? obp + (agg.ab > 0 ? agg.tb / agg.ab : 0) : null
  const rispAvg = agg.risp_ab > 0 ? agg.risp_h / agg.risp_ab : null
  const sbPct = agg.sb + agg.cs > 0 ? agg.sb / (agg.sb + agg.cs) : null

  return {
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
    avg: fmtSlash3(avg),
    obp: fmtSlash3(obp),
    slg: fmtSlash3(slg),
    ops: fmtSlash3(ops),
    risp_avg: fmtSlash3(rispAvg),
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
  }
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

function loadCanonicalFiles(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalFiles()
  if (docs.length === 0) {
    console.error("[phase15] no canonical games found under _data/scraped_games/canonical/")
    process.exit(1)
  }

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

  function ensureBatOrderMap(bid: string): Map<string, BattingSeasonAggYahoo> {
    let m = byBatterBatOrder.get(bid)
    if (!m) {
      m = new Map()
      byBatterBatOrder.set(bid, m)
    }
    return m
  }

  function addBatOrderAgg(bid: string, slot: string, gameId: string, pa: PlateAppearance): void {
    const bm = ensureBatOrderMap(bid)
    const key = `bat_order_${slot}`
    const agg = bm.get(key) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, gameId, pa)
    bm.set(key, agg)
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

  function addSitAgg(bid: string, sitKey: string, gameId: string, pa: PlateAppearance): void {
    const sm = ensureSitMap(bid)
    const agg = sm.get(sitKey) ?? emptyBattingSeasonAggYahoo()
    updateBattingAggFromPa(agg, gameId, pa)
    sm.set(sitKey, agg)
  }

  const mergedDocsByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) {
    const gid = String(d.gameId ?? "").trim()
    if (gid) mergedDocsByGameId.set(gid, mergePhase10RestoredIntoDocIfPresent(d))
  }

  const allBattersWithPas = new Set<string>()

  for (const doc of docs) {
    const gameId = doc.gameId
    const pas = [...(doc.domain.plateAppearances ?? [])].sort(comparePlateAppearances)
    const appearanceCount = new Map<string, number>()

    for (const pa of pas) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      allBattersWithPas.add(bid)
      const n = (appearanceCount.get(bid) ?? 0) + 1
      appearanceCount.set(bid, n)
      const roundKey = n <= 4 ? String(n) : "5"
      const roundMap = ensureRoundMap(bid)
      const agg = roundMap.get(roundKey) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromPa(agg, gameId, pa)
      roundMap.set(roundKey, agg)
    }

    const starterSlot = starterSlotByYahooId(doc)
    for (const pa of pas) {
      const bid = (pa.yahooBatterId ?? "").trim()
      if (!bid) continue
      const slot = starterSlot.get(bid)
      if (!slot) continue
      addBatOrderAgg(bid, slot, gameId, pa)
    }

    const halfGroups = new Map<string, PlateAppearance[]>()
    for (const pa of pas) {
      const hk = halfKeyFromPaId(pa.paId)
      if (!hk) continue
      const list = halfGroups.get(hk) ?? []
      list.push(pa)
      halfGroups.set(hk, list)
    }
    const sortedHalfKeys = [...halfGroups.keys()].sort(compareHalfKeys)
    for (const hk of sortedHalfKeys) {
      let state = emptyGameState()
      const groupPas = halfGroups.get(hk) ?? []
      for (const pa of groupPas) {
        const bid = (pa.yahooBatterId ?? "").trim()
        if (!bid) continue
        const { detail, risp } = classifySituationAtPaStart(state.b)
        addSitAgg(bid, detail, gameId, pa)
        if (risp) addSitAgg(bid, "risp", gameId, pa)
        // 非得点圏: 2・3塁走者なし（ランナーなし・1塁のみ）
        if (!risp) addSitAgg(bid, "no_risp", gameId, pa)
        state = applyPlayResult(state, plateAppearanceLastResultText(pa))
      }
    }
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
    ...allBattersWithBattingLines,
  ])
  const batterIds = [...allBatterIds].sort()
  for (const bid of batterIds) {
    const roundMap = byBatterRound.get(bid)
    const sitMap = byBatterSit.get(bid)
    const batOrderMap = byBatterBatOrder.get(bid)
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
    const payload = {
      schemaVersion: "phase15-player-season-batting-splits-v1",
      seasonYear: year,
      yahooBatterId: bid,
      generatedAt: new Date().toISOString(),
      meta: {
        paRoundDefinition:
          "試合内で当該打者の k 回目の打席を k 巡目（k>=5 は 5巡目以上に集約）。打席順は paId からソート。",
        situationSplits: "base_sit",
        situationNote:
          "打席結果テキストから走者を簡易シミュレーション（paSituationSim）。公式記録の代替ではない。",
        batOrderNote:
          "スタメン登録の打順（1〜9）。代打・途中出場のみでスタメン名簿に無い打席は集計対象外。",
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
