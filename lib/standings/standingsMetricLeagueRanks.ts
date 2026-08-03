import { STANDINGS_METRIC_COLUMNS, type StandingsMetricKey } from "@/lib/standings/metricColumns"
import type { TeamStandingRow } from "@/lib/standings/types"

const RUNS_COLUMN_INDEX = STANDINGS_METRIC_COLUMNS.findIndex((c) => c.key === "runs")

/** 得点列以降の指標（リーグ内順位 ①〜⑥ を付ける対象） */
export const STANDINGS_METRIC_KEYS_WITH_LEAGUE_RANK: StandingsMetricKey[] =
  RUNS_COLUMN_INDEX < 0
    ? []
    : STANDINGS_METRIC_COLUMNS.slice(RUNS_COLUMN_INDEX).map((c) => c.key)

const STANDINGS_METRIC_KEYS_WITH_LEAGUE_RANK_SET = new Set<StandingsMetricKey>(
  STANDINGS_METRIC_KEYS_WITH_LEAGUE_RANK,
)

/** 値が小さいほど上位の指標 */
const LOWER_IS_BETTER_METRICS = new Set<StandingsMetricKey>([
  "k_pct",
  "era",
  "runs_allowed",
  "era_starter",
  "era_relief",
  "avg_allowed",
  "bb_pct_pitch",
])

const CIRCLED_RANKS = ["①", "②", "③", "④", "⑤", "⑥"] as const

export function isStandingsMetricWithLeagueRank(key: StandingsMetricKey): boolean {
  return STANDINGS_METRIC_KEYS_WITH_LEAGUE_RANK_SET.has(key)
}

export function standingsMetricCircledRank(rank: number): string {
  if (rank >= 1 && rank <= CIRCLED_RANKS.length) {
    return CIRCLED_RANKS[rank - 1]!
  }
  return String(rank)
}

function metricValue(row: TeamStandingRow, key: StandingsMetricKey): number | null {
  const raw = row[key]
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number" && Number.isNaN(raw)) return null
  return typeof raw === "number" ? raw : null
}

function compareMetricValues(
  a: number | null,
  b: number | null,
  higherIsBetter: boolean,
): number {
  const aNull = a === null
  const bNull = b === null
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (a === b) return 0
  return higherIsBetter ? b - a : a - b
}

function computeMetricRanksForKey(
  rows: TeamStandingRow[],
  key: StandingsMetricKey,
): Map<string, number> {
  const higherIsBetter = !LOWER_IS_BETTER_METRICS.has(key)
  const sorted = [...rows].sort((a, b) => {
    const byValue = compareMetricValues(metricValue(a, key), metricValue(b, key), higherIsBetter)
    if (byValue !== 0) return byValue
    return a.team.localeCompare(b.team)
  })

  const ranks = new Map<string, number>()
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!
    if (i === 0) {
      ranks.set(row.team, 1)
      continue
    }
    const prev = sorted[i - 1]!
    const sameRank =
      compareMetricValues(metricValue(prev, key), metricValue(row, key), higherIsBetter) === 0
    ranks.set(row.team, sameRank ? ranks.get(prev.team)! : i + 1)
  }
  return ranks
}

/** 球団コード → 指標キー → リーグ内順位（1〜6） */
export function computeStandingsMetricLeagueRanks(
  rows: TeamStandingRow[],
): Map<string, Partial<Record<StandingsMetricKey, number>>> {
  const byTeam = new Map<string, Partial<Record<StandingsMetricKey, number>>>()
  for (const row of rows) {
    byTeam.set(row.team, {})
  }
  for (const key of STANDINGS_METRIC_KEYS_WITH_LEAGUE_RANK) {
    const ranks = computeMetricRanksForKey(rows, key)
    for (const [team, rank] of ranks) {
      byTeam.get(team)![key] = rank
    }
  }
  return byTeam
}
