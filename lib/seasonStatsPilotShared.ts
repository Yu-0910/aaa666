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

/** Phase 11/13 派生 JSON と CSV を結合するときの既定シーズン年 */
export const DERIVED_SEASON_YEAR_DEFAULT = '2026'

function fmtSlash3(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '.000'
  const s = n.toFixed(3)
  return s.startsWith('0') ? s.slice(1) : s
}

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
    so,
    sb,
    cs,
    sf,
  } = row

  const avg = parseSlashRate(row.avg)
  const obp = parseSlashRate(row.obp)
  const slg = parseSlashRate(row.slg)

  const bbPct = pa > 0 ? (bb / pa) * 100 : null
  const kPct = pa > 0 ? (so / pa) * 100 : null

  const babipDen = ab - so - hr + sf
  const babip = babipDen > 0 ? (h - hr) / babipDen : null

  const isop = avg != null && slg != null ? slg - avg : null
  const isod = avg != null && obp != null ? obp - avg : null

  const bbk = so > 0 ? bb / so : null

  const gpa = obp != null && slg != null ? (1.8 * obp + slg) / 4 : null

  const rcDenom = ab + bb + ibb
  const rc = rcDenom > 0 ? ((h + bb + ibb) * tb) / rcDenom : null

  const xr =
    0.5 * h1 +
    0.72 * h2 +
    1.04 * h3 +
    1.44 * hr +
    0.34 * (bb + hbp) +
    0.25 * ibb +
    0.18 * sb -
    0.32 * cs -
    0.09 * so

  const seca = ab > 0 ? (tb - h + bb) / ab : null
  const ta = ab > 0 ? tb / ab : null
  const noi = obp != null && slg != null ? (obp + slg) * 1000 : null

  return {
    ...row,
    bb_pct: fmtPct3(bbPct),
    k_pct: fmtPct3(kPct),
    babip: babip != null ? (Math.round(babip * 1000) / 1000).toFixed(3) : row.babip,
    isop: isop != null ? fmtSlash3(isop) : row.isop,
    isod: isod != null ? fmtSlash3(isod) : row.isod,
    bbk: bbk != null ? fmtPct3(bbk) : '',
    gpa: gpa != null ? fmtPct3(gpa) : row.gpa,
    rc: rc != null ? fmtPct3(rc) : row.rc,
    xr: Number.isFinite(xr) ? fmtPct3(xr) : row.xr,
    seca: seca != null ? fmtPct3(seca) : row.seca,
    ta: ta != null ? fmtPct3(ta) : row.ta,
    noi: noi != null ? fmtPct3(noi) : row.noi,
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
  const gidp = list.reduce((a, x) => a + x.gidp, 0)
  const risp_ab = list.reduce((a, x) => a + x.risp_ab, 0)
  const risp_h = list.reduce((a, x) => a + x.risp_h, 0)
  const h1 = Math.max(0, h - h2 - h3 - hr)
  const avg = ab > 0 ? h / ab : null
  const obpDen = ab + bb + hbp + sf
  const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null
  const slg = ab > 0 ? tb / ab : null
  const ops = obp != null ? obp + (ab > 0 ? tb / ab : 0) : null
  const rispAvg = risp_ab > 0 ? risp_h / risp_ab : null
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
    gidp,
    avg: fmtSlash3(avg),
    obp: fmtSlash3(obp),
    slg: fmtSlash3(slg),
    ops: fmtSlash3(ops),
    risp_avg: fmtSlash3(rispAvg),
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
