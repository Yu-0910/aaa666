import { findBattingRankingRow, findPitchingRankingRow } from "@/lib/ranking/playerSeasonTotalsFromRankings"
import { loadPitcherSeasonPocPayloadFromRepo } from "@/lib/pitcherSeasonPocLoad"
import { mergePilotSeasonStatsWithDerived } from "@/lib/seasonStatsPilot"

type Args = {
  year: string
  yahooIds: string[]
  npbIds: string[]
}

function parseArgs(argv: string[]): Args {
  let year = "2026"
  let yahooIds: string[] = []
  let npbIds: string[] = []
  for (let i = 2; i < argv.length; i++) {
    const arg = String(argv[i] ?? "").trim()
    if (arg === "--year" && argv[i + 1]) {
      year = String(argv[++i]).trim() || year
      continue
    }
    if (arg === "--yahoo-ids" && argv[i + 1]) {
      yahooIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
      continue
    }
    if (arg === "--npb-ids" && argv[i + 1]) {
      npbIds = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
    }
  }
  return { year, yahooIds: [...new Set(yahooIds)], npbIds: [...new Set(npbIds)] }
}

function approxEqual(a: number | null | undefined, b: number | null | undefined, epsilon = 1e-6): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) <= epsilon
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const n = Number(String(value ?? "").trim())
  return Number.isFinite(n) ? n : null
}

function compareBatting(year: string, yahooIds: string[]): string[] {
  const failures: string[] = []
  for (const yahooId of yahooIds) {
    const ranking = findBattingRankingRow(yahooId, year)
    if (!ranking) continue
    const merged = mergePilotSeasonStatsWithDerived(yahooId, year)
    const total = merged.rows.find((row) => row.split_type === "total" && row.split_value === "total")
    if (!total) {
      failures.push(`batting yahoo_${yahooId}: 個人ページ通算行がありません`)
      continue
    }
    const expected = {
      g: Number(ranking.games ?? ranking.g ?? 0),
      pa: Number(ranking.pa ?? 0),
      ab: Number(ranking.ab ?? 0),
      h: Number(ranking.hits ?? ranking.h ?? 0),
      hr: Number(ranking.hr ?? 0),
      rbi: Number(ranking.rbi ?? 0),
      so: Number(ranking.so ?? 0),
      bb: Number(ranking.bb ?? 0),
    }
    const actual = {
      g: Number(total.g ?? 0),
      pa: Number(total.pa ?? 0),
      ab: Number(total.ab ?? 0),
      h: Number(total.h ?? 0),
      hr: Number(total.hr ?? 0),
      rbi: Number(total.rbi ?? 0),
      so: Number(total.so ?? 0),
      bb: Number(total.bb ?? 0),
    }
    const mismatches = Object.keys(expected).filter((key) => expected[key as keyof typeof expected] !== actual[key as keyof typeof actual])
    if (mismatches.length > 0) {
      failures.push(
        `batting yahoo_${yahooId}: ${mismatches.map((key) => `${key} profile=${actual[key as keyof typeof actual]} ranking=${expected[key as keyof typeof expected]}`).join(", ")}`,
      )
    }
  }
  return failures
}

function comparePitching(year: string, npbIds: string[]): string[] {
  const failures: string[] = []
  for (const npbId of npbIds) {
    const ranking = findPitchingRankingRow(npbId, year)
    if (!ranking) continue
    const payload = loadPitcherSeasonPocPayloadFromRepo(year, npbId)
    if (!payload) {
      failures.push(`pitching npb_${npbId}: 個人ページ payload がありません`)
      continue
    }
    const basic = payload.basic
    const expectedIpOuts = Math.round((parseNumber(ranking.ip) ?? 0) * 3)
    const comparisons: Array<[string, number | null | undefined, number | null | undefined, number]> = [
      ["g", basic.gamesAppeared ?? null, parseNumber(ranking.g), 0],
      ["gs", basic.gamesStarted ?? null, parseNumber(ranking.gs), 0],
      ["ipOuts", basic.ipOuts, expectedIpOuts, 0],
      ["era", basic.era, parseNumber(ranking.era), 1e-3],
      ["bf", basic.bf, parseNumber(ranking.bf), 0],
      ["h", basic.h, parseNumber(ranking.ha ?? ranking.h), 0],
      ["hr", basic.hr, parseNumber(ranking.hra ?? ranking.hr), 0],
      ["so", basic.so, parseNumber(ranking.so), 0],
      ["bb", basic.bb, parseNumber(ranking.bb), 0],
      ["np", basic.pitches, parseNumber(ranking.np), 0],
      ["whip", basic.whip, parseNumber(ranking.whip), 1e-3],
      ["w", basic.winCount ?? null, parseNumber(ranking.w), 0],
      ["l", basic.lossCount ?? null, parseNumber(ranking.l), 0],
      ["sv", basic.saveCount ?? null, parseNumber(ranking.sv), 0],
      ["hld", basic.holds ?? null, parseNumber(ranking.hld), 0],
      ["cg", basic.completeGames ?? null, parseNumber(ranking.cg), 0],
      ["sho", basic.shutouts ?? null, parseNumber(ranking.sho), 0],
    ]
    const mismatches = comparisons
      .filter(([_, actual, expected, epsilon]) => !approxEqual(actual, expected, epsilon))
      .map(([label, actual, expected]) => `${label} profile=${actual ?? "null"} ranking=${expected ?? "null"}`)
    if (mismatches.length > 0) {
      failures.push(`pitching npb_${npbId}: ${mismatches.join(", ")}`)
    }
  }
  return failures
}

function main(): void {
  const { year, yahooIds, npbIds } = parseArgs(process.argv)
  const failures = [
    ...compareBatting(year, yahooIds),
    ...comparePitching(year, npbIds),
  ]
  if (failures.length > 0) {
    console.error(`[validate_profile_totals_follow_rankings] NG ${failures.length}件`)
    for (const line of failures.slice(0, 50)) console.error(`  ${line}`)
    if (failures.length > 50) console.error(`  ... 他 ${failures.length - 50} 件`)
    process.exit(1)
  }
  console.log(
    `[validate_profile_totals_follow_rankings] OK year=${year} yahoo=${yahooIds.length} npb=${npbIds.length}`,
  )
}

main()
