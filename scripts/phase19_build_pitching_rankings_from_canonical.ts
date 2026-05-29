/**
 * Phase 19: canonical の pitchingLines を集計し、投手ランキング用静的 JSON を生成する。
 * §1.1 第1段: 配置されている canonical 試合のみが入力（現状は PoC 1 試合想定）。
 *
 * 実行:
 *   npx tsx scripts/phase19_build_pitching_rankings_from_canonical.ts --year 2026
 *
 * 入力 canonical は `loadCanonicalGamesMergedForDerivedPipeline`（Phase11 と同一: 一球マージ済み）。
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { CanonicalGameDocument, LineupPlayer } from '../lib/yahooGame/types'
import {
  aggregatePitchingSeasonByYahooPlayer,
  CSV_TEAM_TO_RANKING_SHORT,
  rosterTeamToRankingShort,
  type PitchingSeasonAggYahoo,
} from '../lib/yahooGame/canonicalPitchingSeasonAgg'
import { pitchingSeasonRowStatsFromAgg } from '../lib/yahooGame/pitchingRowMetricsFromAgg'
import { loadMetricsFromRecordPitching } from '../lib/ranking/recordPitching'
import { getPitchingJsonKey } from '../lib/ranking/metricMap'
import { sanitizeMetricForPath } from '../lib/ranking/url'
import {
  getRomanNameMap,
  normalizeRomanMapKey,
  normalizeRomanMapKeyNoSpace,
} from '../lib/ranking/romanNameFromCsv'
import {
  findRosterPlayerByPublicId,
  findRosterPlayerByPublicIdOrJaName,
  rosterEnglishShortForRanking,
} from '../lib/npbRoster'
import { assertPitchingRankingRosterComplete } from '../lib/ranking/verifyPitchingRankingRoster'
import { loadCanonicalGamesMergedForDerivedPipeline } from '../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline'
import { aggregateSeasonTeamGamesFromCanonical } from '../lib/yahooGame/aggregateTeamGamesFromCanonical'
import {
  assignRanks,
  filterPitchingRowsForQualifyingAtBuild,
} from '../lib/ranking/filterRankingsByQualifyingAtBuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = '2026'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function teamForYahooId(doc: CanonicalGameDocument, yahooId: string): string {
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? '').trim()
    for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
      if (String(p.yahooPlayerId ?? '').trim() === yahooId) return teamName
    }
  }
  return ''
}

function yahooMetaFromCanonical(docs: CanonicalGameDocument[]): Map<string, { name: string; team: string }> {
  const map = new Map<string, { name: string; team: string }>()
  for (const doc of docs) {
    for (const team of doc.game.teams ?? []) {
      const teamName = String(team.teamName ?? '').trim()
      for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
        const id = String(p.yahooPlayerId ?? '').trim()
        const name = String(p.playerName ?? '').trim()
        if (!id || !name || !teamName) continue
        if (!map.has(id)) map.set(id, { name, team: rosterTeamToRankingShort(teamName) })
      }
    }
    for (const pl of doc.domain.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? '').trim()
      const pn = String(pl.playerName ?? '').trim()
      if (!id || !pn) continue
      const cur = map.get(id)
      const lineupTeam = teamForYahooId(doc, id)
      const short = rosterTeamToRankingShort(lineupTeam || '')
      if (!cur) {
        map.set(id, { name: pn, team: short })
      } else if (pn.length > cur.name.length) {
        map.set(id, { ...cur, name: pn, team: cur.team || short })
      }
    }
  }
  for (const [id, meta] of [...map.entries()]) {
    if (meta.team.trim()) continue
    const roster = findRosterPlayerByPublicId(id)
    if (roster?.team) {
      map.set(id, { ...meta, team: rosterTeamToRankingShort(roster.team) })
    }
  }
  for (const [id, meta] of [...map.entries()]) {
    if (meta.team.trim() || !meta.name.trim()) continue
    const byJa = findRosterPlayerByPublicId(meta.name)
    if (byJa?.team) {
      map.set(id, { ...meta, team: rosterTeamToRankingShort(byJa.team) })
    }
  }
  return map
}

function resolveRomanName(
  yahooId: string,
  nameJa: string,
  teamShort: string,
  romanMap: Record<string, string>
): string | undefined {
  const roster = findRosterPlayerByPublicIdOrJaName(yahooId, nameJa)
  const enFromRoster = roster ? rosterEnglishShortForRanking(roster) : ''
  if (enFromRoster) return enFromRoster

  const teamCsv = roster?.team
    ? roster.team
    : teamShort
      ? Object.keys(CSV_TEAM_TO_RANKING_SHORT).find((k) => CSV_TEAM_TO_RANKING_SHORT[k] === teamShort) ?? teamShort
      : ''

  const tryKeys: Array<[string, string]> = []
  if (roster) {
    tryKeys.push([roster.name_ja, roster.team])
    tryKeys.push([roster.name_ja.replace(/\u3000/g, ' '), roster.team])
  }
  if (nameJa && teamCsv) tryKeys.push([nameJa, teamCsv])
  if (nameJa && teamShort) tryKeys.push([nameJa, teamShort])

  for (const [n, t] of tryKeys) {
    if (!n || !t) continue
    const k1 = normalizeRomanMapKey(n, t)
    if (romanMap[k1]) return romanMap[k1].trim()
    const k2 = normalizeRomanMapKeyNoSpace(n, t)
    if (romanMap[k2]) return romanMap[k2].trim()
  }
  return undefined
}

function buildPitchingRow(
  yahooId: string,
  agg: PitchingSeasonAggYahoo,
  meta: { name: string; team: string },
  romanName?: string
): Record<string, unknown> {
  const name = meta.name.trim() || yahooId
  const team = meta.team.trim()

  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: '防御率',
    ...pitchingSeasonRowStatsFromAgg(agg),
  }
  if (romanName) base.romanName = romanName
  return base
}

const LOWER_BETTER = new Set([
  'era',
  'whip',
  'avg_against',
  'babip_against',
  'obp_against',
  'slg_against',
  'p_ip',
  'bb_pct',
])

/** BB％ は少ないほど良い想定で昇順。K％・k_bb_pct は高いほど良い */
function metricSortAsc(metricKey: string): boolean {
  if (metricKey === 'bb_pct') return true
  return LOWER_BETTER.has(metricKey)
}

function sortValue(metricKey: string, row: Record<string, unknown>): number {
  const v = row[metricKey]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()
  if (year !== '2026') {
    console.error('[phase19] 完成品は 2026 のみ。--year 2026 を指定してください。')
    process.exit(1)
  }

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error('[phase19] canonical が _data/scraped_games/canonical/ にありません')
    process.exit(1)
  }

  const metaMap = yahooMetaFromCanonical(docs)
  const teamGamesByLeague = aggregateSeasonTeamGamesFromCanonical(docs, year)
  const aggregated = aggregatePitchingSeasonByYahooPlayer(docs)
  if (aggregated.size === 0) {
    console.error('[phase19] pitchingLines から集計できる行がありません')
    process.exit(1)
  }

  const metrics = loadMetricsFromRecordPitching()
  const romanMapCL = getRomanNameMap(year, 'CL')
  const romanMapPL = getRomanNameMap(year, 'PL')
  const baseOut = join(projectRoot, 'public', 'data', 'rankings', 'pitching', year)

  const byLeague: Record<'CL' | 'PL', Array<{ yahooId: string; row: Record<string, unknown> }>> = {
    CL: [],
    PL: [],
  }

  for (const [yahooId, { agg, league }] of aggregated.entries()) {
    const meta = metaMap.get(yahooId) ?? { name: yahooId, team: '' }
    const romanMap = league === 'PL' ? romanMapPL : romanMapCL
    const roman = resolveRomanName(yahooId, meta.name, meta.team, romanMap)
    const row = buildPitchingRow(yahooId, agg, meta, roman)
    byLeague[league].push({ yahooId, row })
  }

  for (const lg of ['CL', 'PL'] as const) {
    const outDir = join(baseOut, lg)
    mkdirSync(outDir, { recursive: true })
    const list = byLeague[lg]

    for (const m of metrics) {
      const metricKey = getPitchingJsonKey(m.label)
      const asc = metricSortAsc(metricKey)
      const rows = list.map(({ row }) => ({
        ...row,
        metric: m.label,
      }))
      const sorted = [...rows].sort((a, b) => {
        const av = sortValue(metricKey, a)
        const bv = sortValue(metricKey, b)
        return asc ? av - bv : bv - av
      })
      const rankedAll = assignRanks(sorted)
      const teamGames = teamGamesByLeague[lg]
      const filtered = filterPitchingRowsForQualifyingAtBuild(sorted, metricKey, year, teamGames)
      const rankedPublic = assignRanks(filtered)

      const fileBase = sanitizeMetricForPath(m.label)
      writeFileSync(join(outDir, `${fileBase}.json`), JSON.stringify(rankedPublic, null, 2), 'utf8')
      writeFileSync(join(outDir, `${fileBase}_all.json`), JSON.stringify(rankedAll, null, 2), 'utf8')
    }

    console.log(`[phase19] wrote ${lg} (${metrics.length} metrics, ${list.length} pitchers) → ${outDir}`)
  }

  console.log(`[phase19] source games: ${docs.map((d) => d.gameId).join(', ')}`)
  assertPitchingRankingRosterComplete(projectRoot, year)
}

main()
