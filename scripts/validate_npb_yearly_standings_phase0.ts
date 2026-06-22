/**
 * Phase 0 検証: NPB 歴代順位表の型・列定義・計算式サンプル。
 *
 * 実行:
 *   npx tsx scripts/validate_npb_yearly_standings_phase0.ts
 *   npm run validate:npb-yearly-standings:phase0
 */

import {
  k9FromSoAndIpDisplay,
  slgFromCounts,
} from "@/lib/standings/computeNpbYearlyStandingsMetrics"
import {
  NPB_YEARLY_STANDINGS_METRIC_COLUMNS,
  standingsMetricColumnsForSource,
} from "@/lib/standings/metricColumns"
import type { TeamStandingRow } from "@/lib/standings/types"

const TOLERANCE = 0.001

function assertClose(label: string, actual: number | null, expected: number): void {
  if (actual == null || Math.abs(actual - expected) > TOLERANCE) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertColumnKeysExistOnRow(): void {
  const sample: TeamStandingRow = {
    rank: 1,
    team: "G",
    teamName: "巨人",
    g: 0,
    w: 0,
    l: 0,
    t: 0,
    pct: null,
    gb: "-",
    runs: 0,
    ops: null,
    avg: null,
    hr: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    obp: null,
    slg: null,
    risp_avg: null,
    isod: null,
    isop: null,
    bb_pct: null,
    k_pct: null,
    era: null,
    runs_allowed: 0,
    era_starter: null,
    era_relief: null,
    avg_allowed: null,
    cg: 0,
    bb_pct_pitch: null,
    k_pct_pitch: null,
    k_bb_pct: null,
    qs_rate: null,
    hqs_rate: null,
    ab: 0,
    rbi: 0,
    sb: 0,
    sho: 0,
    ip: null,
    so: 0,
    k9: null,
  }

  for (const col of NPB_YEARLY_STANDINGS_METRIC_COLUMNS) {
    if (!(col.key in sample)) {
      throw new Error(`NPB yearly column key missing on TeamStandingRow: ${col.key}`)
    }
  }
}

function assertSourceColumnSwitch(): void {
  const canonicalCols = standingsMetricColumnsForSource("canonical")
  const npbCols = standingsMetricColumnsForSource("npb_official_yearly")
  if (canonicalCols.length <= npbCols.length) {
    throw new Error("canonical columns should be longer than NPB yearly subset")
  }
  if (npbCols.length !== 24) {
    throw new Error(`expected 24 NPB yearly metric columns, got ${npbCols.length}`)
  }
}

/** 1990年 CL 巨人・公式ページ値による手計算検証 */
function assert1990GiantsSample(): void {
  // https://npb.jp/bis/yearly/centralleague_1990.html
  const h = 1158
  const doubles = 217
  const triples = 27
  const hr = 134
  const ab = 6130
  const avg = 0.2666
  const so = 1311
  const ip = "1317.0"

  const slg = slgFromCounts(h, doubles, triples, hr, ab)
  assertClose("1990 Giants SLG", slg, 0.299)
  if (slg != null) {
    assertClose("1990 Giants IsoP", slg - avg, 0.032)
  }
  const k9 = k9FromSoAndIpDisplay(so, ip)
  assertClose("1990 Giants K/9", k9, 8.959)
}

function main(): void {
  console.log("[phase0] NPB yearly standings spec validation\n")

  assertColumnKeysExistOnRow()
  console.log("  OK  NPB_YEARLY_STANDINGS_METRIC_COLUMNS keys ⊆ TeamStandingRow")

  assertSourceColumnSwitch()
  console.log("  OK  standingsMetricColumnsForSource()")

  assert1990GiantsSample()
  console.log("  OK  1990 CL Giants sample (SLG / IsoP / K/9)")

  console.log("\n[phase0] all checks passed")
  console.log(`  columns (${NPB_YEARLY_STANDINGS_METRIC_COLUMNS.length}): ${NPB_YEARLY_STANDINGS_METRIC_COLUMNS.map((c) => c.label).join(" · ")}`)
}

main()
