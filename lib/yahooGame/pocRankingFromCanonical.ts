import type { BattingLine, CanonicalGameDocument } from "./types"
import { findNpbIdForYahooBatting, type RosterRow } from "./rosterCsv"

export type PocRankingRow = Record<string, unknown> & {
  rank: number
  playerId: string
  name: string
  team: string
  value: number
  metric: string
  romanName?: string
  pa?: number
  ab?: number
  hits?: number
  hr?: number
  rbi?: number
  bb?: number
  so?: number
  avg?: number
  obp?: number
  slg?: number
  ops?: number
}

function teamForYahooPlayerId(canonical: CanonicalGameDocument, yahooId: string): string {
  for (const t of canonical.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

function paEstimate(b: BattingLine): number {
  const ab = b.ab ?? 0
  const bb = b.bb ?? 0
  const hbp = b.hbp ?? 0
  const sh = b.sh ?? 0
  return ab + bb + hbp + sh
}

/** PoC 用 TB。battingLines に h2/h3 が付いていればそれを使い、無ければ非 HR を単打近似 */
function totalBasesApprox(b: BattingLine): number {
  const h = b.h ?? 0
  const hr = b.hr ?? 0
  if (b.h2 != null || b.h3 != null) {
    const h2 = b.h2 ?? 0
    const h3 = b.h3 ?? 0
    const h1 = Math.max(0, h - h2 - h3 - hr)
    return h1 + 2 * h2 + 3 * h3 + 4 * hr
  }
  const singlesDoublesTriples = Math.max(0, h - hr)
  return singlesDoublesTriples + 4 * hr
}

function battingOpsApprox(b: BattingLine): { avg: number; obp: number; slg: number; ops: number } {
  const ab = b.ab ?? 0
  if (ab <= 0) return { avg: 0, obp: 0, slg: 0, ops: 0 }
  const h = b.h ?? 0
  const bb = b.bb ?? 0
  const hbp = b.hbp ?? 0
  const tb = totalBasesApprox(b)
  const avg = h / ab
  const pa = paEstimate(b)
  const obp = pa > 0 ? (h + bb + hbp) / pa : 0
  const slg = tb / ab
  return { avg, obp, slg, ops: obp + slg }
}

function valueForMetric(
  label: string,
  b: BattingLine,
  ops: ReturnType<typeof battingOpsApprox>
): number | null {
  const L = label.trim()
  if (L === "打率") return ops.avg
  if (L === "出塁率") return ops.obp
  if (L === "長打率") return ops.slg
  if (L === "OPS") return ops.ops
  if (L === "安打") return b.h ?? 0
  if (L === "打点") return b.rbi ?? 0
  if (L === "本塁打" || L === "HR") return b.hr ?? 0
  if (L === "得点") return b.r ?? 0
  if (L === "四球" || L === "敬遠" || L === "故意四" || L === "故意四球") return b.bb ?? 0
  if (L === "三振") return b.so ?? 0
  if (L === "打数") return b.ab ?? 0
  if (L === "打席") return paEstimate(b)
  return null
}

/**
 * canonical + 名簿から PoC ランキング行を生成（1試合分・打撃のみ）
 */
export function buildPocRankingRowsFromCanonical(
  canonical: CanonicalGameDocument,
  roster: RosterRow[],
  metricLabel: string
): PocRankingRow[] {
  const lines = canonical.domain.battingLines
  const enriched: Array<{
    b: BattingLine
    teamHint: string
    match: ReturnType<typeof findNpbIdForYahooBatting>
  }> = []
  for (const b of lines) {
    const teamHint = teamForYahooPlayerId(canonical, b.yahooPlayerId)
    enriched.push({ b, teamHint, match: findNpbIdForYahooBatting(roster, b.playerName, teamHint) })
  }

  const rows: PocRankingRow[] = []
  for (const { b, teamHint, match } of enriched) {
    const ops = battingOpsApprox(b)
    const v = valueForMetric(metricLabel, b, ops)
    if (v === null) continue
    const team = match?.team ?? teamHint
    const pid = match?.npbPlayerId ?? `yahoo-${b.yahooPlayerId}`
    rows.push({
      rank: 0,
      playerId: pid,
      name: b.playerName,
      team,
      value: Math.round(v * 10000) / 10000,
      metric: metricLabel.trim(),
      romanName: match?.romanName,
      pa: paEstimate(b),
      ab: b.ab,
      hits: b.h,
      hr: b.hr,
      rbi: b.rbi,
      bb: b.bb,
      so: b.so,
      avg: Math.round(ops.avg * 1000) / 1000,
      obp: Math.round(ops.obp * 1000) / 1000,
      slg: Math.round(ops.slg * 1000) / 1000,
      ops: Math.round(ops.ops * 1000) / 1000,
    })
  }

  const L = metricLabel.trim()
  const asc = L.includes("三振") || L.includes("K%")
  rows.sort((a, b) => {
    const va = Number(a.value)
    const vb = Number(b.value)
    if (asc) return va - vb
    return vb - va
  })
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  return rows
}
