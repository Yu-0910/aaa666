/**
 * 対左右別 対戦成績 全体監査スクリプト（"vs_hand 正常化計画" Phase 24 / 監査基盤）。
 *
 * 目的:
 *   - 全打者について、通算（Phase 11）と対左右合計（Phase 15 / file A）の差分を一覧化
 *   - どの STEP に詰まりが発生しているかを件数で可視化（STEP 2 / 3 / 4 / 7 / 8）
 *   - 後続フェーズ（名簿整備、Δ 検算統合、取りこぼし対策）の効果測定の土台
 *
 * STEP 対応表（計画書参照）:
 *   STEP 2 = plateAppearances 取りこぼし          → paGap > 0
 *   STEP 3 = 投手 ID 取得失敗                     → missingPitcherIdPas
 *   STEP 3 = 救済（carry-forward / BF）           → inferredPitcherIdPas
 *   STEP 3 = 救済（実況テキスト系）                → inferredPitcherIdFromTextPas
 *   STEP 4 = 投手の利き腕引き失敗                 → unknownPitchers
 *   STEP 7 = ファイル A/B 並走（参考情報）         → file B 出力との比較
 *   STEP 8 = 通算合計と非整合                     → paGap !== 0
 *
 * 入力:
 *   _data/derived/player_season_batting/{year}/yahoo_*.json    （通算: Phase 11）
 *   _data/scraped_games/canonical/*.json                         （生 canonical）
 *
 * 出力:
 *   _data/derived/audit/vs_hand_audit_{year}.json
 *
 * 実行:
 *   npx tsx scripts/audit_vs_hand_full.ts --year 2026
 *   npx tsx scripts/audit_vs_hand_full.ts --year 2026 --top 30
 *   npx tsx scripts/audit_vs_hand_full.ts --year 2026 --fail   （差分ありなら exit 1）
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  loadVsHandRowsFromCanonicalWithDebug,
  mergePhase10RestoredIntoDocIfPresent,
} from "../lib/seasonStatsPilot"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Args = { year: string; top: number; fail: boolean }

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let year = "2026"
  let top = 20
  let fail = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--top" && args[i + 1]) {
      const n = Number(args[i + 1])
      if (Number.isFinite(n) && n > 0) top = Math.trunc(n)
      i++
    } else if (args[i] === "--fail") {
      fail = true
    }
  }
  return { year, top, fail }
}

type SeasonStatsRowLite = {
  split_type?: string
  split_value?: string
  pa?: number | string
  ab?: number | string
  h?: number | string
  hr?: number | string
  bb?: number | string
  hbp?: number | string
  sh?: number | string
  sf?: number | string
}

function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0
  const s = String(v).trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

type P0 = { pa: number; ab: number; h: number; hr: number; bb: number; hbp: number; sh: number; sf: number }

function emptyP0(): P0 {
  return { pa: 0, ab: 0, h: 0, hr: 0, bb: 0, hbp: 0, sh: 0, sf: 0 }
}

function rowToP0(row: SeasonStatsRowLite | null | undefined): P0 {
  if (!row) return emptyP0()
  return {
    pa: num(row.pa),
    ab: num(row.ab),
    h: num(row.h),
    hr: num(row.hr),
    bb: num(row.bb),
    hbp: num(row.hbp),
    sh: num(row.sh),
    sf: num(row.sf),
  }
}

function addP0(a: P0, b: P0): P0 {
  return {
    pa: a.pa + b.pa,
    ab: a.ab + b.ab,
    h: a.h + b.h,
    hr: a.hr + b.hr,
    bb: a.bb + b.bb,
    hbp: a.hbp + b.hbp,
    sh: a.sh + b.sh,
    sf: a.sf + b.sf,
  }
}

function subP0(a: P0, b: P0): P0 {
  return {
    pa: a.pa - b.pa,
    ab: a.ab - b.ab,
    h: a.h - b.h,
    hr: a.hr - b.hr,
    bb: a.bb - b.bb,
    hbp: a.hbp - b.hbp,
    sh: a.sh - b.sh,
    sf: a.sf - b.sf,
  }
}

function isAnyNonZero(p: P0): boolean {
  return p.pa !== 0 || p.ab !== 0 || p.h !== 0 || p.hr !== 0 || p.bb !== 0 || p.hbp !== 0 || p.sh !== 0 || p.sf !== 0
}

function isAnyNegative(p: P0): boolean {
  return p.pa < 0 || p.ab < 0 || p.h < 0 || p.hr < 0 || p.bb < 0 || p.hbp < 0 || p.sh < 0 || p.sf < 0
}

function loadPhase11TotalP0(yahooId: string, year: string): { p0: P0; exists: boolean } {
  const p = join(projectRoot, "_data", "derived", "player_season_batting", year, `yahoo_${yahooId}.json`)
  if (!existsSync(p)) return { p0: emptyP0(), exists: false }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as { rows?: SeasonStatsRowLite[] }
    const total = (raw.rows ?? []).find((r) => String(r.split_type ?? "") === "total")
    return { p0: rowToP0(total), exists: total != null }
  } catch {
    return { p0: emptyP0(), exists: false }
  }
}

function resolvePlayerName(yahooId: string): string {
  const r = findRosterPlayerByPublicId(yahooId)
  return r?.name_ja ?? ""
}

type PerPlayerRow = {
  yahooBatterId: string
  playerName: string
  phase11: P0
  vsHand: { r: P0; l: P0; u: P0; sum: P0 }
  /** 通算 - vs_hand合計（>0 はファイルA に取りこぼし） */
  gap: P0
  /** 通算 < vs_hand合計（負の差分。ある場合は要調査） */
  hasNegativeGap: boolean
  /** STEP 3 関連の件数 */
  step3: {
    missingPitcherIdPas: number
    inferredPitcherIdPas: number
    inferredPitcherIdFromTextPas: number
  }
  /** STEP 4 関連の件数（投手 ID 別の利き腕未解決 PA） */
  step4: {
    pitcherThrowHandUnknownPitcherCount: number
    pitcherThrowHandUnknownPaSum: number
    topPitchers: Array<{ yahooPitcherId: string; pa: number }>
  }
}

function main(): void {
  process.chdir(projectRoot)
  const { year, top, fail } = parseArgs()

  const docs = loadCanonicalGames(projectRoot)
  if (docs.length === 0) {
    console.error(`[audit:vs-hand-full] no canonical games loaded under _data/scraped_games/canonical`)
    process.exit(2)
  }
  const mergedDocsByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) {
    const gid = String(d.gameId ?? "").trim()
    if (gid) mergedDocsByGameId.set(gid, mergePhase10RestoredIntoDocIfPresent(d))
  }

  const phase11Dir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  if (!existsSync(phase11Dir)) {
    console.error(`[audit:vs-hand-full] phase11 directory missing: ${phase11Dir}`)
    process.exit(2)
  }
  const yahooIds = readdirSync(phase11Dir)
    .filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
    .map((f) => f.replace(/^yahoo_/, "").replace(/\.json$/, ""))
    .filter((id) => /^\d+$/.test(id))
    .sort()

  const players: PerPlayerRow[] = []

  // 集計用カウンタ
  let battersCheckedCount = 0
  let battersWithGapCount = 0
  let battersWithUnknownCount = 0
  let battersWithNegativeGapCount = 0
  let totalGap = emptyP0()
  let totalUnknownPa = 0
  let totalMissingPitcherIdPas = 0
  let totalInferredPitcherIdPas = 0
  let totalInferredFromTextPas = 0
  // STEP 4 集計（全選手にまたがる投手別合計）
  const unknownPitcherTotalPa = new Map<string, number>()

  const t0 = Date.now()
  for (let i = 0; i < yahooIds.length; i++) {
    const bid = yahooIds[i]
    if (!bid) continue
    const { p0: phase11P0, exists } = loadPhase11TotalP0(bid, year)
    if (!exists) continue
    if (phase11P0.pa === 0 && phase11P0.ab === 0) continue

    const d = loadVsHandRowsFromCanonicalWithDebug(bid, {
      preloadedCanonicalDocs: docs,
      mergedDocsByGameId,
    })

    const rRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "R")
    const lRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "L")
    const uRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "unknown")
    const r = rowToP0(rRow as SeasonStatsRowLite | undefined)
    const l = rowToP0(lRow as SeasonStatsRowLite | undefined)
    const u = rowToP0(uRow as SeasonStatsRowLite | undefined)
    const sum = addP0(addP0(r, l), u)
    const gap = subP0(phase11P0, sum)

    const playerName = resolvePlayerName(bid)
    battersCheckedCount += 1
    if (isAnyNonZero(gap)) {
      battersWithGapCount += 1
      totalGap = addP0(totalGap, {
        ...gap,
        // 負の差分は totalGap にそのまま入れず、絶対値だけ別系統で出す
        pa: gap.pa > 0 ? gap.pa : 0,
        ab: gap.ab > 0 ? gap.ab : 0,
        h: gap.h > 0 ? gap.h : 0,
        hr: gap.hr > 0 ? gap.hr : 0,
        bb: gap.bb > 0 ? gap.bb : 0,
        hbp: gap.hbp > 0 ? gap.hbp : 0,
        sh: gap.sh > 0 ? gap.sh : 0,
        sf: gap.sf > 0 ? gap.sf : 0,
      })
    }
    const hasNegativeGap = isAnyNegative(gap)
    if (hasNegativeGap) battersWithNegativeGapCount += 1

    if (u.pa > 0) battersWithUnknownCount += 1
    totalUnknownPa += u.pa

    const missing = Number(d.missingPitcherIdPas ?? 0)
    const inferredCarry = Number(d.inferredPitcherIdPas ?? 0)
    const inferredText = Number(d.inferredPitcherIdFromTextPas ?? 0)
    totalMissingPitcherIdPas += missing
    totalInferredPitcherIdPas += inferredCarry
    totalInferredFromTextPas += inferredText

    // STEP 4: pitcher hand resolution failed but pitcherId was known
    const unknownPitchers: Record<string, number> = (d.unknownPitchers ?? {}) as Record<string, number>
    const handPitcherIds = Object.keys(unknownPitchers)
    let handPaSum = 0
    for (const pid of handPitcherIds) {
      const pa = Number(unknownPitchers[pid] ?? 0)
      if (!Number.isFinite(pa) || pa <= 0) continue
      handPaSum += pa
      unknownPitcherTotalPa.set(pid, (unknownPitcherTotalPa.get(pid) ?? 0) + pa)
    }
    const topPitchers = Object.entries(unknownPitchers)
      .map(([pid, pa]) => ({ yahooPitcherId: pid, pa: Number(pa ?? 0) }))
      .filter((x) => Number.isFinite(x.pa) && x.pa > 0)
      .sort((a, b) => b.pa - a.pa)
      .slice(0, 5)

    players.push({
      yahooBatterId: bid,
      playerName,
      phase11: phase11P0,
      vsHand: { r, l, u, sum },
      gap,
      hasNegativeGap,
      step3: {
        missingPitcherIdPas: missing,
        inferredPitcherIdPas: inferredCarry,
        inferredPitcherIdFromTextPas: inferredText,
      },
      step4: {
        pitcherThrowHandUnknownPitcherCount: handPitcherIds.length,
        pitcherThrowHandUnknownPaSum: handPaSum,
        topPitchers,
      },
    })

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      console.error(`[audit:vs-hand-full] processed ${i + 1}/${yahooIds.length} (${elapsed}s)`)
    }
  }

  const topGapPlayers = [...players]
    .filter((p) => isAnyNonZero(p.gap))
    .sort((a, b) => Math.abs(b.gap.pa) - Math.abs(a.gap.pa) || Math.abs(b.gap.ab) - Math.abs(a.gap.ab))
    .slice(0, top)

  const topUnknownPlayers = [...players]
    .filter((p) => p.vsHand.u.pa > 0)
    .sort((a, b) => b.vsHand.u.pa - a.vsHand.u.pa)
    .slice(0, top)

  const topUnknownPitchers = [...unknownPitcherTotalPa.entries()]
    .map(([pid, pa]) => ({
      yahooPitcherId: pid,
      pa,
      playerName: findRosterPlayerByPublicId(pid)?.name_ja ?? "",
    }))
    .sort((a, b) => b.pa - a.pa)
    .slice(0, top)

  const summary = {
    battersCheckedCount,
    battersWithGapCount,
    battersWithNegativeGapCount,
    battersWithUnknownCount,
    totalGap,
    totalUnknownPa,
    totalMissingPitcherIdPas,
    totalInferredPitcherIdPas,
    totalInferredFromTextPas,
  }

  // STEP 別の集計（計画書の対応表）
  const byStep = {
    step2_plateAppearances_dropoffs: {
      description: "通算 - vs_hand合計 が >0 の打者数 / 合計PA",
      battersAffected: battersWithGapCount,
      totalPaGap: totalGap.pa,
      totalAbGap: totalGap.ab,
      totalHGap: totalGap.h,
    },
    step3_pitcher_id_unresolved: {
      description: "投手 ID が 8 段フォールバックでも取れなかった PA",
      totalPas: totalMissingPitcherIdPas,
    },
    step3_pitcher_id_recovered_carryforward_or_bf: {
      description: "投手 ID を ③ 引継ぎ / ④ BF で救済した PA（成功事例）",
      totalPas: totalInferredPitcherIdPas,
    },
    step3_pitcher_id_recovered_text: {
      description: "投手 ID を ⑤⑥⑦ 実況系で救済した PA（成功事例）",
      totalPas: totalInferredFromTextPas,
    },
    step4_pitcher_throw_hand_unresolved: {
      description: "投手 ID は取れたが利き腕（R/L）を引けなかった PA",
      totalPas: [...unknownPitcherTotalPa.values()].reduce((s, n) => s + n, 0),
      uniquePitchers: unknownPitcherTotalPa.size,
    },
    step8_total_reconciliation: {
      description: "ファイル A の vs_hand 合計と通算 PA が一致する打者の割合",
      battersMatchingTotal: battersCheckedCount - battersWithGapCount - battersWithNegativeGapCount,
      battersWithPositiveGap: battersWithGapCount,
      battersWithNegativeGap: battersWithNegativeGapCount,
    },
  }

  const report = {
    schemaVersion: "vs-hand-audit-v1",
    generatedAt: new Date().toISOString(),
    year,
    summary,
    byStep,
    topGapPlayers: topGapPlayers.map((p) => ({
      yahooBatterId: p.yahooBatterId,
      playerName: p.playerName,
      phase11Total: { pa: p.phase11.pa, ab: p.phase11.ab, h: p.phase11.h },
      vsHandSum: { pa: p.vsHand.sum.pa, ab: p.vsHand.sum.ab, h: p.vsHand.sum.h },
      vsHand: {
        r: { pa: p.vsHand.r.pa, ab: p.vsHand.r.ab, h: p.vsHand.r.h },
        l: { pa: p.vsHand.l.pa, ab: p.vsHand.l.ab, h: p.vsHand.l.h },
        u: { pa: p.vsHand.u.pa, ab: p.vsHand.u.ab, h: p.vsHand.u.h },
      },
      gap: p.gap,
      hasNegativeGap: p.hasNegativeGap,
    })),
    topUnknownPlayers: topUnknownPlayers.map((p) => ({
      yahooBatterId: p.yahooBatterId,
      playerName: p.playerName,
      unknownPa: p.vsHand.u.pa,
      missingPitcherIdPas: p.step3.missingPitcherIdPas,
      pitcherThrowHandUnknownPaSum: p.step4.pitcherThrowHandUnknownPaSum,
      topUnresolvedPitchers: p.step4.topPitchers,
    })),
    topUnknownPitchers,
    playerDetails: players.map((p) => ({
      yahooBatterId: p.yahooBatterId,
      playerName: p.playerName,
      phase11: p.phase11,
      vsHandR: p.vsHand.r,
      vsHandL: p.vsHand.l,
      vsHandU: p.vsHand.u,
      vsHandSum: p.vsHand.sum,
      gap: p.gap,
      hasNegativeGap: p.hasNegativeGap,
      step3MissingPitcherIdPas: p.step3.missingPitcherIdPas,
      step3InferredCarry: p.step3.inferredPitcherIdPas,
      step3InferredText: p.step3.inferredPitcherIdFromTextPas,
      step4UnresolvedPitcherCount: p.step4.pitcherThrowHandUnknownPitcherCount,
      step4UnresolvedPaSum: p.step4.pitcherThrowHandUnknownPaSum,
    })),
  }

  const outDir = join(projectRoot, "_data", "derived", "audit")
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `vs_hand_audit_${year}.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")

  // コンソールサマリ
  const elapsedTotal = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[audit:vs-hand-full] wrote: ${outPath}`)
  console.log(`[audit:vs-hand-full] elapsed: ${elapsedTotal}s`)
  console.log(`[audit:vs-hand-full] summary:`)
  console.log(`  battersChecked         = ${battersCheckedCount}`)
  console.log(`  battersWithGap         = ${battersWithGapCount}  (通算 > vs_hand合計)`)
  console.log(`  battersWithNegativeGap = ${battersWithNegativeGapCount}  (通算 < vs_hand合計, 要調査)`)
  console.log(`  battersWithUnknown     = ${battersWithUnknownCount}`)
  console.log(`  totalPaGap             = ${totalGap.pa}`)
  console.log(`  totalUnknownPa         = ${totalUnknownPa}`)
  console.log(`  step3 missingPitcherId = ${totalMissingPitcherIdPas}`)
  console.log(`  step3 recoveredCarry/BF= ${totalInferredPitcherIdPas}`)
  console.log(`  step3 recoveredText    = ${totalInferredFromTextPas}`)
  console.log(`  step4 unresolvedPa     = ${[...unknownPitcherTotalPa.values()].reduce((s, n) => s + n, 0)}`)
  console.log(`  step4 unresolvedPids   = ${unknownPitcherTotalPa.size}`)

  if (topGapPlayers.length > 0) {
    console.log(`[audit:vs-hand-full] top ${Math.min(top, topGapPlayers.length)} batters by |paGap|:`)
    for (const p of topGapPlayers) {
      const sign = p.gap.pa >= 0 ? "+" : ""
      console.log(
        `  yahoo_${p.yahooBatterId} ${p.playerName || "(name?)"}` +
          `  phase11.pa=${p.phase11.pa}  vsHandSum.pa=${p.vsHand.sum.pa}  gap.pa=${sign}${p.gap.pa}` +
          (p.vsHand.u.pa > 0 ? `  unknown.pa=${p.vsHand.u.pa}` : ""),
      )
    }
  }
  if (topUnknownPitchers.length > 0) {
    console.log(`[audit:vs-hand-full] top ${Math.min(top, topUnknownPitchers.length)} pitchers with unresolved hand:`)
    for (const x of topUnknownPitchers) {
      console.log(`  yahoo_${x.yahooPitcherId} ${x.playerName || "(name?)"}  pa=${x.pa}`)
    }
  }

  if (fail && (battersWithGapCount > 0 || battersWithNegativeGapCount > 0)) {
    console.error(
      `[audit:vs-hand-full] FAIL: gap=${battersWithGapCount} negative=${battersWithNegativeGapCount}`,
    )
    process.exit(1)
  }
}

main()
