import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { leagueBucketForTeamShort, rosterTeamToRankingShort } from "@/lib/yahooGame/canonicalPitchingSeasonAgg"
import type { BattingLine, CanonicalGameDocument, LineupPlayer } from "@/lib/yahooGame/types"
import type { SeasonStatsRow } from "@/lib/seasonStatsPilotShared"
import type { StandingsLeague, TeamStandingRow } from "@/lib/standings/types"

type Phase11Payload = {
  yahooBatterId?: string
  rows?: SeasonStatsRow[]
}

type PlayerMeta = {
  name: string
  team: string
}

type TeamBattingCounts = {
  pa: number
  ab: number
  h: number
  h1: number
  h2: number
  h3: number
  hr: number
  tb: number
  so: number
  bb: number
  hbp: number
  sf: number
  sb: number
  risp_ab: number
  risp_h: number
}

function emptyCounts(): TeamBattingCounts {
  return {
    pa: 0,
    ab: 0,
    h: 0,
    h1: 0,
    h2: 0,
    h3: 0,
    hr: 0,
    tb: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    sf: 0,
    sb: 0,
    risp_ab: 0,
    risp_h: 0,
  }
}

function addRow(counts: TeamBattingCounts, row: SeasonStatsRow): void {
  counts.pa += row.pa ?? 0
  counts.ab += row.ab ?? 0
  counts.h += row.h ?? 0
  counts.h1 += row.h1 ?? 0
  counts.h2 += row.h2 ?? 0
  counts.h3 += row.h3 ?? 0
  counts.hr += row.hr ?? 0
  counts.tb += row.tb ?? 0
  counts.so += row.so ?? 0
  counts.bb += row.bb ?? 0
  counts.hbp += row.hbp ?? 0
  counts.sf += row.sf ?? 0
  counts.sb += row.sb ?? 0
  counts.risp_ab += row.risp_ab ?? 0
  counts.risp_h += row.risp_h ?? 0
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function pickTotalRow(payload: Phase11Payload): SeasonStatsRow | null {
  if (!Array.isArray(payload.rows)) return null
  return (
    payload.rows.find((row) => row?.split_type === "total" && row?.split_value === "total") ??
    payload.rows[0] ??
    null
  )
}

function shouldPreferPlayerName(current: string, candidate: string): boolean {
  const a = current.trim()
  const b = candidate.trim()
  if (!b) return false
  if (!a) return true
  if (a === b) return false
  if (/^\d+$/.test(a) && !/^\d+$/.test(b)) return true
  if (b.includes(" ") && !a.includes(" ")) return true
  if (b.includes("\u3000") && !a.includes(" ") && !a.includes("\u3000")) return true
  return b.length > a.length
}

function pickPlayerName(current: string, candidate: string): string {
  return shouldPreferPlayerName(current, candidate) ? candidate.trim() : current.trim()
}

function teamForYahooId(doc: CanonicalGameDocument, yahooId: string): string {
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? "").trim()
    for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
      if (String(p.yahooPlayerId ?? "").trim() === yahooId) return teamName
    }
  }
  return ""
}

function buildPlayerMetaMap(docs: CanonicalGameDocument[]): Map<string, PlayerMeta> {
  const metaMap = new Map<string, PlayerMeta>()
  for (const doc of docs) {
    for (const team of doc.game.teams ?? []) {
      const teamName = String(team.teamName ?? "").trim()
      for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
        const id = String(p.yahooPlayerId ?? "").trim()
        const name = String(p.playerName ?? "").trim()
        if (!id || !name) continue
        const cur = metaMap.get(id)
        metaMap.set(id, {
          name: cur ? pickPlayerName(cur.name, name) : name,
          team: cur?.team || teamName,
        })
      }
    }
    for (const line of doc.domain.battingLines ?? []) {
      const bl = line as BattingLine
      const id = String(bl.yahooPlayerId ?? "").trim()
      const name = String(bl.playerName ?? "").trim()
      if (!id || !name) continue
      const cur = metaMap.get(id)
      const lineTeam = String(bl.teamName ?? "").trim()
      const lineupTeam = teamForYahooId(doc, id) || lineTeam
      metaMap.set(id, {
        name: cur ? pickPlayerName(cur.name, name) : name,
        team: cur?.team || lineupTeam,
      })
    }
  }
  return metaMap
}

function teamShortForPhase11Batter(yahooId: string, meta: PlayerMeta | undefined): string {
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.team) {
    const short = rosterTeamToRankingShort(roster.team).trim()
    if (short) return short
  }
  if (meta?.team) {
    const short = rosterTeamToRankingShort(meta.team).trim()
    if (short) return short
  }
  return ""
}

function loadPhase11TeamBattingCounts(
  projectRoot: string,
  year: string,
  league: StandingsLeague,
  docs: CanonicalGameDocument[],
): Map<string, TeamBattingCounts> {
  const dir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  const out = new Map<string, TeamBattingCounts>()
  if (!existsSync(dir)) return out

  const metaMap = buildPlayerMetaMap(docs)
  for (const file of readdirSync(dir)) {
    if (!/^yahoo_.+\.json$/.test(file)) continue
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as Phase11Payload
      const yahooId = String(raw.yahooBatterId ?? file.replace(/^yahoo_/, "").replace(/\.json$/, "")).trim()
      const row = pickTotalRow(raw)
      if (!yahooId || !row || (row.pa ?? 0) <= 0) continue
      const teamShort = teamShortForPhase11Batter(yahooId, metaMap.get(yahooId))
      if (!teamShort || leagueBucketForTeamShort(teamShort) !== league) continue
      const counts = out.get(teamShort) ?? emptyCounts()
      addRow(counts, row)
      out.set(teamShort, counts)
    } catch {
      // Ignore malformed derived player files; standings generation still uses canonical fallback.
    }
  }
  return out
}

function applyCountsToRow(row: TeamStandingRow, counts: TeamBattingCounts): TeamStandingRow {
  const avg = rate(counts.h, counts.ab)
  const obp = rate(counts.h + counts.bb + counts.hbp, counts.ab + counts.bb + counts.hbp + counts.sf)
  const slg = rate(counts.tb, counts.ab)
  const ops = obp != null && slg != null ? obp + slg : null
  const risp_avg = rate(counts.risp_h, counts.risp_ab)

  return {
    ...row,
    avg,
    h: counts.h,
    singles: counts.h1,
    doubles: counts.h2,
    triples: counts.h3,
    hr: counts.hr,
    sb: counts.sb,
    obp,
    slg,
    ops,
    risp_avg,
    isod: obp != null && avg != null ? obp - avg : null,
    isop: slg != null && avg != null ? slg - avg : null,
    bb_pct: counts.pa > 0 ? (counts.bb / counts.pa) * 100 : null,
    k_pct: counts.pa > 0 ? (counts.so / counts.pa) * 100 : null,
  }
}

export function overlayPhase11TeamBattingMetrics(
  rows: TeamStandingRow[],
  docs: CanonicalGameDocument[],
  year: string,
  league: StandingsLeague,
  projectRoot?: string,
): TeamStandingRow[] {
  const root = projectRoot?.trim()
  if (!root) return rows
  const byTeam = loadPhase11TeamBattingCounts(root, year, league, docs)
  if (byTeam.size === 0) return rows
  return rows.map((row) => {
    const counts = byTeam.get(row.teamName)
    return counts ? applyCountsToRow(row, counts) : row
  })
}
