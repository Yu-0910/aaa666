import fs from 'fs'
import path from 'path'
import type { PitcherSeasonPocPayload } from '@/lib/pitcherSeasonPocTypes'
import { getProjectRoot } from '@/lib/projectRoot'
import type { SeasonStatsRow } from '@/lib/seasonStatsPilotShared'
import { formatPitchingIpDisplay } from '@/lib/careerPitchingEnrich'

type RankingRow = Record<string, unknown>

const battingRowCache = new Map<string, RankingRow | null>()
const pitchingRowCache = new Map<string, RankingRow | null>()

function readArrayJson(filePath: string): RankingRow[] {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return Array.isArray(raw) ? (raw.filter((item) => item && typeof item === 'object') as RankingRow[]) : []
  } catch {
    return []
  }
}

function findRowInFiles(filePaths: string[], playerId: string): RankingRow | null {
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue
    const row = readArrayJson(filePath).find(
      (item) => String(item.playerId ?? '').trim() === playerId
    )
    if (row) return row
  }
  return null
}

function intFromRankingRow(value: unknown, fallback: number = 0): number {
  const n = parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(n) ? n : fallback
}

function numberFromRankingRow(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : fallback
}

function stringFromRankingMetric(value: unknown, fallback: string = ''): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

function formatRateLike(value: unknown, fallback: string): string {
  const n = numberFromRankingRow(value, null)
  if (n == null) return fallback
  return n.toFixed(3).replace(/^0(?=\.)/, '')
}

function ipOutsFromRanking(value: unknown, fallback: number): number {
  const n = numberFromRankingRow(value, null)
  if (n == null) return fallback
  return Math.max(0, Math.round(n * 3))
}

export function findBattingRankingRow(yahooId: string, year: string): RankingRow | null {
  const cacheKey = `${year}:${yahooId}`
  if (battingRowCache.has(cacheKey)) return battingRowCache.get(cacheKey) ?? null
  const root = getProjectRoot()
  const leagues = ['CL', 'PL'] as const
  const preferredFiles = ['OPS_all.json', '打率_all.json', '安打_all.json'] as const
  let found: RankingRow | null = null
  for (const league of leagues) {
    const paths = preferredFiles.map((fileName) =>
      path.join(root, 'public', 'data', 'rankings', year, league, fileName)
    )
    found = findRowInFiles(paths, yahooId)
    if (found) break
  }
  battingRowCache.set(cacheKey, found)
  return found
}

export function findPitchingRankingRow(npbPlayerId: string, year: string): RankingRow | null {
  const cacheKey = `${year}:${npbPlayerId}`
  if (pitchingRowCache.has(cacheKey)) return pitchingRowCache.get(cacheKey) ?? null
  const root = getProjectRoot()
  const leagues = ['CL', 'PL'] as const
  const preferredFiles = [
    '防御率_all.json',
    '勝利_all.json',
    '試合_all.json',
    '回数_all.json',
    'WHIP_all.json',
  ] as const
  let found: RankingRow | null = null
  for (const league of leagues) {
    const leagueDir = path.join(root, 'public', 'data', 'rankings', 'pitching', year, league)
    const preferredPaths = preferredFiles.map((fileName) => path.join(leagueDir, fileName))
    found = findRowInFiles(preferredPaths, npbPlayerId)
    if (!found && fs.existsSync(leagueDir)) {
      const allJsonFiles = fs
        .readdirSync(leagueDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(leagueDir, name))
      found = findRowInFiles(allJsonFiles, npbPlayerId)
    }
    if (found) break
  }
  pitchingRowCache.set(cacheKey, found)
  return found
}

export function buildBattingTotalRowFromRankings(
  yahooId: string,
  year: string,
  fallback: SeasonStatsRow | null,
): SeasonStatsRow | null {
  const ranking = findBattingRankingRow(yahooId, year)
  if (!ranking) return null
  const hits = intFromRankingRow(ranking.hits ?? ranking.h, fallback?.h ?? 0)
  const doubles = intFromRankingRow(ranking.doubles ?? ranking.h2, fallback?.h2 ?? 0)
  const triples = intFromRankingRow(ranking.triples ?? ranking.h3, fallback?.h3 ?? 0)
  const homers = intFromRankingRow(ranking.hr, fallback?.hr ?? 0)
  const singles = intFromRankingRow(
    ranking.singles,
    Math.max(0, hits - doubles - triples - homers),
  )
  return {
    split_type: 'total',
    split_value: 'total',
    split_label: fallback?.split_label || '通算',
    g: intFromRankingRow(ranking.games ?? ranking.g, fallback?.g ?? 0),
    pa: intFromRankingRow(ranking.pa, fallback?.pa ?? 0),
    ab: intFromRankingRow(ranking.ab, fallback?.ab ?? 0),
    r: intFromRankingRow(ranking.runs ?? ranking.r, fallback?.r ?? 0),
    h: hits,
    h1: singles,
    h2: doubles,
    h3: triples,
    hr: homers,
    tb: intFromRankingRow(ranking.tb, fallback?.tb ?? 0),
    rbi: intFromRankingRow(ranking.rbi, fallback?.rbi ?? 0),
    so: intFromRankingRow(ranking.so, fallback?.so ?? 0),
    bb: intFromRankingRow(ranking.bb, fallback?.bb ?? 0),
    ibb: intFromRankingRow(ranking.ibb, fallback?.ibb ?? 0),
    hbp: intFromRankingRow(ranking.hbp, fallback?.hbp ?? 0),
    sh: intFromRankingRow(ranking.sh, fallback?.sh ?? 0),
    sf: intFromRankingRow(ranking.sf, fallback?.sf ?? 0),
    sb: intFromRankingRow(ranking.sb, fallback?.sb ?? 0),
    cs: intFromRankingRow(ranking.cs, fallback?.cs ?? 0),
    e: intFromRankingRow(ranking.e, fallback?.e ?? 0),
    gidp: intFromRankingRow(ranking.gidp, fallback?.gidp ?? 0),
    avg: stringFromRankingMetric(ranking.avg, fallback?.avg ?? ''),
    obp: stringFromRankingMetric(ranking.obp, fallback?.obp ?? ''),
    slg: stringFromRankingMetric(ranking.slg, fallback?.slg ?? ''),
    ops: stringFromRankingMetric(ranking.ops, fallback?.ops ?? ''),
    risp_avg: fallback?.risp_avg ?? '—',
    risp_ab: fallback?.risp_ab ?? 0,
    risp_h: fallback?.risp_h ?? 0,
    sb_pct: fallback?.sb_pct ?? '',
    isop: stringFromRankingMetric(ranking.isop, fallback?.isop ?? ''),
    isod: stringFromRankingMetric(ranking.isod, fallback?.isod ?? ''),
    babip: stringFromRankingMetric(ranking.babip, fallback?.babip ?? ''),
    bb_pct: stringFromRankingMetric(ranking.bbPct ?? ranking.bb_pct, fallback?.bb_pct ?? ''),
    k_pct: stringFromRankingMetric(ranking.kPct ?? ranking.k_pct, fallback?.k_pct ?? ''),
    bbk: stringFromRankingMetric(ranking.bbk ?? ranking.bb_k, fallback?.bbk ?? ''),
    gpa: stringFromRankingMetric(ranking.gpa, fallback?.gpa ?? ''),
    rc: stringFromRankingMetric(ranking.rc, fallback?.rc ?? ''),
    xr: stringFromRankingMetric(ranking.xr, fallback?.xr ?? ''),
    seca: stringFromRankingMetric(ranking.seca, fallback?.seca ?? ''),
    ta: stringFromRankingMetric(ranking.ta, fallback?.ta ?? ''),
    noi: stringFromRankingMetric(ranking.noi, fallback?.noi ?? ''),
  }
}

export function overlayPitchingBasicFromRankings(
  payload: PitcherSeasonPocPayload,
  year: string,
): PitcherSeasonPocPayload {
  const ranking = findPitchingRankingRow(payload.npbPlayerId, year)
  if (!ranking) return payload

  const fallback = payload.basic
  const gamesAppeared = intFromRankingRow(ranking.g, fallback.gamesAppeared ?? 0)
  const gamesStarted = intFromRankingRow(ranking.gs, fallback.gamesStarted ?? 0)
  const qsRatePct = numberFromRankingRow(ranking.qs_rate, null)
  const hqsRatePct = numberFromRankingRow(ranking.hqs_rate, null)
  const sqsRatePct = numberFromRankingRow(ranking.sqs_rate, null)
  const qsCount =
    qsRatePct != null && gamesStarted > 0
      ? Math.round((gamesStarted * qsRatePct) / 100)
      : (fallback.qsCount ?? 0)
  const hqsCount =
    hqsRatePct != null && gamesStarted > 0
      ? Math.round((gamesStarted * hqsRatePct) / 100)
      : (fallback.hqsCount ?? 0)
  const sqsCount =
    sqsRatePct != null && gamesStarted > 0
      ? Math.round((gamesStarted * sqsRatePct) / 100)
      : (fallback.sqsCount ?? 0)
  const ipOuts = ipOutsFromRanking(ranking.ip, fallback.ipOuts)

  return {
    ...payload,
    basic: {
      ...fallback,
      ip: formatPitchingIpDisplay(ranking.ip ?? fallback.ip),
      ipOuts,
      era: numberFromRankingRow(ranking.era, fallback.era) ?? fallback.era,
      bf: intFromRankingRow(ranking.bf, fallback.bf),
      h: intFromRankingRow(ranking.ha ?? ranking.h, fallback.h),
      hr: intFromRankingRow(ranking.hra ?? ranking.hr, fallback.hr),
      so: intFromRankingRow(ranking.so, fallback.so),
      bb: intFromRankingRow(ranking.bb, fallback.bb),
      pitches: intFromRankingRow(ranking.np, fallback.pitches),
      whip: numberFromRankingRow(ranking.whip, fallback.whip) ?? fallback.whip,
      avgAgainstApprox: formatRateLike(ranking.avg_against, fallback.avgAgainstApprox),
      gamesAppeared,
      gamesStarted,
      gamesInRelief: Math.max(0, gamesAppeared - gamesStarted),
      holds: intFromRankingRow(ranking.hld, fallback.holds ?? 0),
      completeGames: intFromRankingRow(ranking.cg, fallback.completeGames ?? 0),
      shutouts: intFromRankingRow(ranking.sho, fallback.shutouts ?? 0),
      qsCount,
      qsRate: qsRatePct != null ? qsRatePct / 100 : fallback.qsRate ?? null,
      hqsCount,
      hqsRate: hqsRatePct != null ? hqsRatePct / 100 : fallback.hqsRate ?? null,
      sqsCount,
      sqsRate: sqsRatePct != null ? sqsRatePct / 100 : fallback.sqsRate ?? null,
      winCount: intFromRankingRow(ranking.w, fallback.winCount ?? 0),
      lossCount: intFromRankingRow(ranking.l, fallback.lossCount ?? 0),
      saveCount: intFromRankingRow(ranking.sv, fallback.saveCount ?? 0),
    },
  }
}
