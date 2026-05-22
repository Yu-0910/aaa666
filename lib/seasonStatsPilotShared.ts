/**
 * クライアントコンポーネントからも import 可能な共有定義（fs / Node 専用 API なし）。
 * `seasonStatsPilot.ts` は CSV 読み込み等で fs を使うため、ここに分離する。
 */

/** 個人ページ表示項目整理 ブロックA・D 準拠 */
export type SeasonStatsRow = {
  split_type: string
  split_value: string
  split_label: string
  g: number
  pa: number
  ab: number
  r: number
  h: number
  h1: number
  h2: number
  h3: number
  hr: number
  tb: number
  rbi: number
  so: number
  bb: number
  ibb: number
  hbp: number
  sh: number
  sf: number
  sb: number
  cs: number
  e: number
  gidp: number
  avg: string
  obp: string
  slg: string
  ops: string
  risp_avg: string
  risp_ab: number
  risp_h: number
  sb_pct: string
  isop: string
  isod: string
  babip: string
  bb_pct: string
  k_pct: string
  bbk: string
  gpa: string
  rc: string
  xr: string
  seca: string
  ta: string
  noi: string
}

/** 菊池涼介 2026-03-04 ブロック集計データ（D,E,F,G,H,I,J） */
export type PilotBlocksData = {
  meta: { batter_id: string; batter_name: string; date: string; pa_count: number; game_ids: string[] }
  blocks: {
    D?: { source: string; rows: Record<string, unknown>[] }
    E?: { source: string; available: boolean; note?: string }
    F?: {
      by_month: Record<string, number>
      by_day_night: Record<string, number>
      by_stadium: Record<string, number>
      by_base_state: Record<string, number>
      by_risp: Record<string, number>
      by_risp_stats?: {
        risp: { pa: number; ab: number; r: number; h: number; h2: number; h3: number; hr: number; tb: number; rbi: number; so: number; bb: number; ibb: number; hbp: number; sh: number; sf: number; sb: number; cs: number; g: number; avg: string; obp: string; slg: string; ops: string }
        no_risp: { pa: number; ab: number; r: number; h: number; h2: number; h3: number; hr: number; tb: number; rbi: number; so: number; bb: number; ibb: number; hbp: number; sh: number; sf: number; sb: number; cs: number; g: number; avg: string; obp: string; slg: string; ops: string }
      }
    }
    G?: {
      hit_direction: Record<string, number>
      course: Record<string, number>
      pitch_type: Record<string, number>
    }
    H?: {
      ground_fly: Record<string, number>
      vs_left: number
      vs_right: number
      vs_unknown: number
    }
    I?: {
      by_inning: Record<string, number>
      by_outs: Record<string, number>
      by_base_state: Record<string, number>
    }
    J?: { sb: number; cs: number; hr: number; clutch_hr_risp: number; recent_date: string }
  }
}

export type BattingVsHandCounts = { pa: number; ab: number; h: number }

/**
 * 通算行と「対左右（vs_hand）」行の合算が一致しているかを返す。
 * 個人ページ UI 側で「同じ打席集合」で比較するために使う。
 *
 * 重要: 通算（total）は “全打席” を含み得る一方、vs_hand は「相手投手の左右が判定できた打席」だけになることがある。
 * そのため `delta` は「未判定（=vs_hand に乗らない）分」を表すのが通常で、必ずしもバグではない。
 */
export type BattingVsHandTotalReconciliation = {
  /** vs_hand 合算でカバーできた打席割合（0..1）。total.pa<=0 のとき null */
  coveredPaPct: number | null
  /** “全打席” 通算（split_type=total） */
  total: BattingVsHandCounts
  /** “判定できた打席だけ” の通算（=vsHandSum と同一集合）。便宜上 counts だけ返す */
  coveredTotal: BattingVsHandCounts
  vsHandSum: BattingVsHandCounts
  /** 未判定分（= total − vsHandSum） */
  delta: BattingVsHandCounts
}

/** Phase 11/13 派生 JSON と CSV を結合するときの既定シーズン年 */
export const DERIVED_SEASON_YEAR_DEFAULT = '2026'

import { calculateRCNf3 } from "@/lib/rc"
import {
  battingSlashRatesFromCounts,
  fmtSlash3,
  slashRate3FromCounts,
} from "@/lib/battingRateFormat"

function parseSlashRate(s: string): number | null {
  const t = (s || '').trim()
  if (!t || t === '—') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function fmtPct3(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ''
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

function fmtPct2(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ''
  return (Math.round((n + 1e-12) * 100) / 100).toFixed(2)
}

/**
 * カウントと avg/obp/slg から打撃指標（ブロックD）を再計算する。
 * Phase 11 スクリプトや mergeSeasonStatsRows が .000 で埋めていた行を正す。
 */
export function enrichSeasonStatsRowSabermetrics(row: SeasonStatsRow): SeasonStatsRow {
  if (row.pa < 1) return row

  const {
    pa,
    ab,
    h,
    h1,
    h2,
    h3,
    hr,
    tb,
    bb,
    ibb,
    hbp,
    sh,
    so,
    sb,
    cs,
    sf,
    gidp,
  } = row

  // 打率・出塁率・長打率・OPS は NPB 式（第4位小数四捨五入）で表示用文字列を確定する。
  const slash = battingSlashRatesFromCounts({ h, ab, tb, bb, hbp, sf })
  const risp_avg =
    row.risp_ab > 0 ? slashRate3FromCounts(row.risp_h, row.risp_ab) : row.risp_avg

  // NOI / IsoP 等は未丸めの実数で計算（表示用 slash とは別）。
  const avg = ab > 0 ? h / ab : null
  const obpDen = ab + bb + hbp + sf
  const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null
  const slg = ab > 0 ? tb / ab : null

  const fmtOrDash = (n: number | null): string => (n == null || !Number.isFinite(n) ? "—" : fmtPct3(n))

  const bbPct = pa > 0 ? (bb / pa) * 100 : null
  const kPct = pa > 0 ? (so / pa) * 100 : null

  const babipDen = ab - so - hr + sf
  const babip = babipDen > 0 ? (h - hr) / babipDen : null

  const isop = avg != null && slg != null ? slg - avg : null
  const isod = avg != null && obp != null ? obp - avg : null

  const bbk = so > 0 ? bb / so : null

  const gpa = obp != null && slg != null ? (1.8 * obp + slg) / 4 : null

  // RC（nf3）
  // A = H + BB + HBP - CS - GIDP
  // B = TB + 0.26*(BB+HBP) + 0.53*(SF+SH) + 0.64*SB - 0.03*SO
  // C = AB + BB + HBP + SF + SH
  // RC = (((A + 2.4*C) * (B + 3*C)) / (9*C)) - (0.9*C)
  const rc = calculateRCNf3({ h, bb, hbp, cs, gidp, tb, sf, sh, sb, so, ab })

  // XR（nf3）
  // 0.50×1B + 0.72×2B + 1.04×3B + 1.44×HR
  // + 0.34×(BB + HBP - IBB) + 0.25×IBB
  // + 0.18×SB - 0.32×CS
  // - 0.090×(AB - H - SO) - 0.098×SO
  // - 0.37×GIDP + 0.37×SF + 0.04×SH
  const inPlayOuts = ab - h - so
  const xr =
    0.5 * h1 +
    0.72 * h2 +
    1.04 * h3 +
    1.44 * hr +
    0.34 * (bb + hbp - ibb) +
    0.25 * ibb +
    0.18 * sb -
    0.32 * cs -
    0.09 * inPlayOuts -
    0.098 * so -
    0.37 * gidp +
    0.37 * sf +
    0.04 * sh

  // SecA = (BB + (TB - H) + (SB - CS)) / AB
  const seca = ab > 0 ? (bb + (tb - h) + (sb - cs)) / ab : null

  // TA（nf3）= (TB + BB + HBP + SB - CS) / (AB - H + CS + GIDP)
  const taDen = ab - h + cs + gidp
  const ta = taDen > 0 ? (tb + bb + hbp + sb - cs) / taDen : null

  // NOI = (OBP + (SLG / 3)) * 1000
  const noi = obp != null && slg != null ? (obp + slg / 3) * 1000 : null

  return {
    ...row,
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
    risp_avg,
    bb_pct: fmtPct3(bbPct),
    k_pct: fmtPct3(kPct),
    babip: babip != null ? (Math.round(babip * 1000) / 1000).toFixed(3) : row.babip,
    isop: isop != null ? fmtSlash3(isop) : row.isop,
    isod: isod != null ? fmtSlash3(isod) : row.isod,
    // BB/K は表示上「小数2桁」
    bbk: bbk != null ? fmtPct2(bbk) : '',
    gpa: gpa != null ? fmtPct3(gpa) : row.gpa,
    // RC は nf3 表示に合わせ小数2桁
    rc: rc == null ? "—" : fmtPct2(rc),
    // XR は nf3 表示に合わせ小数2桁
    xr: Number.isFinite(xr) ? fmtPct2(xr) : row.xr,
    seca: fmtOrDash(seca),
    ta: fmtOrDash(ta),
    // NOI は表示上「小数2桁」
    noi: noi == null || !Number.isFinite(noi) ? "—" : fmtPct2(noi),
  }
}

/** 複数の SeasonStatsRow を加算し、率を再計算（月併合など UI 用） */
export function mergeSeasonStatsRows(
  rows: SeasonStatsRow[],
  split_type: string,
  split_value: string,
  split_label: string
): SeasonStatsRow | null {
  const list = rows.filter((r) => r != null && r.pa > 0)
  if (list.length === 0) return null
  const g = list.reduce((a, r) => a + r.g, 0)
  const pa = list.reduce((a, r) => a + r.pa, 0)
  const ab = list.reduce((a, r) => a + r.ab, 0)
  const r = list.reduce((a, x) => a + x.r, 0)
  const h = list.reduce((a, x) => a + x.h, 0)
  const h2 = list.reduce((a, x) => a + x.h2, 0)
  const h3 = list.reduce((a, x) => a + x.h3, 0)
  const hr = list.reduce((a, x) => a + x.hr, 0)
  const tb = list.reduce((a, x) => a + x.tb, 0)
  const rbi = list.reduce((a, x) => a + x.rbi, 0)
  const so = list.reduce((a, x) => a + x.so, 0)
  const bb = list.reduce((a, x) => a + x.bb, 0)
  const ibb = list.reduce((a, x) => a + x.ibb, 0)
  const hbp = list.reduce((a, x) => a + x.hbp, 0)
  const sh = list.reduce((a, x) => a + x.sh, 0)
  const sf = list.reduce((a, x) => a + x.sf, 0)
  const sb = list.reduce((a, x) => a + x.sb, 0)
  const cs = list.reduce((a, x) => a + x.cs, 0)
  const e = list.reduce((a, x) => a + x.e, 0)
  const gidp = list.reduce((a, x) => a + x.gidp, 0)
  const risp_ab = list.reduce((a, x) => a + x.risp_ab, 0)
  const risp_h = list.reduce((a, x) => a + x.risp_h, 0)
  const h1 = Math.max(0, h - h2 - h3 - hr)
  const slash = battingSlashRatesFromCounts({ h, ab, tb, bb, hbp, sf })
  const risp_avg = slashRate3FromCounts(risp_h, risp_ab)
  const sbPct = sb + cs > 0 ? sb / (sb + cs) : null
  return enrichSeasonStatsRowSabermetrics({
    split_type,
    split_value,
    split_label,
    g,
    pa,
    ab,
    r,
    h,
    h1,
    h2,
    h3,
    hr,
    tb,
    rbi,
    so,
    bb,
    ibb,
    hbp,
    sh,
    sf,
    sb,
    cs,
    e,
    gidp,
    avg: slash.avg,
    obp: slash.obp,
    slg: slash.slg,
    ops: slash.ops,
    risp_avg,
    risp_ab,
    risp_h,
    sb_pct: sbPct == null ? '' : (sbPct * 100).toFixed(1),
    isop: '.000',
    isod: '.000',
    babip: '.000',
    bb_pct: '.000',
    k_pct: '.000',
    bbk: '.000',
    gpa: '.000',
    rc: '.0',
    xr: '.0',
    seca: '.000',
    ta: '.000',
    noi: '.000',
  })
}

export function computeBattingVsHandTotalReconciliation(
  rows: SeasonStatsRow[]
): BattingVsHandTotalReconciliation | null {
  const total = rows.find((r) => r.split_type === "total" && r.split_value === "total")
  if (!total) return null
  const vs = rows.filter((r) => r.split_type === "vs_hand")
  if (vs.length === 0) return null
  const vsHandSum: BattingVsHandCounts = vs.reduce(
    (acc, r) => ({ pa: acc.pa + (r.pa || 0), ab: acc.ab + (r.ab || 0), h: acc.h + (r.h || 0) }),
    { pa: 0, ab: 0, h: 0 }
  )
  const totalCounts: BattingVsHandCounts = { pa: total.pa || 0, ab: total.ab || 0, h: total.h || 0 }
  const coveredTotal: BattingVsHandCounts = { ...vsHandSum }
  const delta: BattingVsHandCounts = {
    pa: totalCounts.pa - vsHandSum.pa,
    ab: totalCounts.ab - vsHandSum.ab,
    h: totalCounts.h - vsHandSum.h,
  }
  const coveredPaPct =
    totalCounts.pa > 0 ? Math.max(0, Math.min(1, coveredTotal.pa / totalCounts.pa)) : null
  return { coveredPaPct, total: totalCounts, coveredTotal, vsHandSum, delta }
}