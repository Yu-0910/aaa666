/**
 * Phase 19: canonical の pitchingLines を集計し、投手ランキング用静的 JSON を生成する。
 * §1.1 第1段: 配置されている canonical 試合のみが入力（現状は PoC 1 試合想定）。
 *
 * 実行:
 *   npx tsx scripts/phase19_build_pitching_rankings_from_canonical.ts --year 2026
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { CanonicalGameDocument, LineupPlayer, PitchingLine } from '../lib/yahooGame/types'
import { loadMetricsFromRecordPitching } from '../lib/ranking/recordPitching'
import { getPitchingJsonKey } from '../lib/ranking/metricMap'
import { sanitizeMetricForPath } from '../lib/ranking/url'
import { ipStringToOuts } from '../lib/ranking/ipBaseball'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const CSV_TEAM_TO_RANKING_SHORT: Record<string, string> = {
  中日ドラゴンズ: '中日',
  広島東洋カープ: '広島',
  東京ヤクルトスワローズ: 'ヤクルト',
  読売ジャイアンツ: '巨人',
  阪神タイガース: '阪神',
  横浜DeNAベイスターズ: 'DeNA',
  オリックス・バファローズ: 'オリックス',
  千葉ロッテマリーンズ: 'ロッテ',
  北海道日本ハムファイターズ: '日本ハム',
  東北楽天ゴールデンイーグルス: '楽天',
  埼玉西武ライオンズ: '西武',
  福岡ソフトバンクホークス: 'ソフトバンク',
}

const CL_TEAM_SHORT = new Set(['巨人', '阪神', '中日', '広島', 'DeNA', 'ヤクルト'])

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

function loadCanonicalDocs(): CanonicalGameDocument[] {
  const dir = join(projectRoot, '_data', 'scraped_games', 'canonical')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, 'utf8')) as CanonicalGameDocument
      if (doc?.schemaVersion === 'yahoo-game-canonical-v1' && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
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

function rosterTeamToRankingShort(fullTeam: string): string {
  const t = String(fullTeam ?? '').trim()
  return CSV_TEAM_TO_RANKING_SHORT[t] ?? t
}

function leagueBucketForTeamShort(short: string): 'CL' | 'PL' {
  const t = short.trim()
  if (!t) return 'CL'
  return CL_TEAM_SHORT.has(t) ? 'CL' : 'PL'
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

type Agg = {
  gameIds: Set<string>
  ipOuts: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  hbp: number
  bk: number
  r: number
  er: number
  np: number
  w: number
  l: number
  hld: number
}

function emptyAgg(): Agg {
  return {
    gameIds: new Set(),
    ipOuts: 0,
    bf: 0,
    h: 0,
    hr: 0,
    so: 0,
    bb: 0,
    hbp: 0,
    bk: 0,
    r: 0,
    er: 0,
    np: 0,
    w: 0,
    l: 0,
    hld: 0,
  }
}

function mergePitchingLinesInGame(lines: PitchingLine[]): PitchingLine | null {
  if (lines.length === 0) return null
  const withData = lines.filter((l) => (l.bf ?? 0) > 0 || ipStringToOuts(l.ip) > 0)
  const src = withData.length > 0 ? withData : lines
  const base: PitchingLine = { ...src[0] }
  for (let i = 1; i < src.length; i++) {
    const x = src[i]
    base.bf = (base.bf ?? 0) + (x.bf ?? 0)
    base.h = (base.h ?? 0) + (x.h ?? 0)
    base.hr = (base.hr ?? 0) + (x.hr ?? 0)
    base.so = (base.so ?? 0) + (x.so ?? 0)
    base.bb = (base.bb ?? 0) + (x.bb ?? 0)
    base.hbp = (base.hbp ?? 0) + (x.hbp ?? 0)
    base.bk = (base.bk ?? 0) + (x.bk ?? 0)
    base.r = (base.r ?? 0) + (x.r ?? 0)
    base.er = (base.er ?? 0) + (x.er ?? 0)
    base.pitches = (base.pitches ?? 0) + (x.pitches ?? 0)
    base.ip = mergeIpStrings(base.ip, x.ip)
    if ((x.playerName?.length ?? 0) > (base.playerName?.length ?? 0)) base.playerName = x.playerName
    if (!base.decision && x.decision) base.decision = x.decision
  }
  return base
}

function mergeIpStrings(a?: string, b?: string): string | undefined {
  const oa = ipStringToOuts(a)
  const ob = ipStringToOuts(b)
  const total = oa + ob
  if (total <= 0) return a || b
  const whole = Math.floor(total / 3)
  const rem = total % 3
  if (rem === 0) return String(whole)
  return `${whole}.${rem}`
}

function aggregatePitching(
  docs: CanonicalGameDocument[]
): Map<string, { agg: Agg; league: 'CL' | 'PL' }> {
  const byPlayer = new Map<string, Agg>()
  const leagueByPlayer = new Map<string, 'CL' | 'PL'>()

  for (const doc of docs) {
    const byId = new Map<string, PitchingLine[]>()
    for (const pl of doc.domain.pitchingLines ?? []) {
      const id = String(pl.yahooPlayerId ?? '').trim()
      if (!id) continue
      const arr = byId.get(id) ?? []
      arr.push(pl)
      byId.set(id, arr)
    }

    for (const [id, lines] of byId.entries()) {
      const merged = mergePitchingLinesInGame(lines)
      if (!merged) continue
      const outs = ipStringToOuts(merged.ip)
      if (outs === 0 && (merged.bf ?? 0) === 0) continue

      const agg = byPlayer.get(id) ?? emptyAgg()
      agg.gameIds.add(doc.gameId)
      agg.ipOuts += outs
      agg.bf += merged.bf ?? 0
      agg.h += merged.h ?? 0
      agg.hr += merged.hr ?? 0
      agg.so += merged.so ?? 0
      agg.bb += merged.bb ?? 0
      agg.hbp += merged.hbp ?? 0
      agg.bk += merged.bk ?? 0
      agg.r += merged.r ?? 0
      agg.er += merged.er ?? 0
      agg.np += merged.pitches ?? 0
      if (merged.decision === 'win') agg.w += 1
      else if (merged.decision === 'loss') agg.l += 1
      else if (merged.decision === 'hold') agg.hld += 1
      byPlayer.set(id, agg)

      const lineupTeam = teamForYahooId(doc, id)
      const short = rosterTeamToRankingShort(lineupTeam)
      leagueByPlayer.set(id, leagueBucketForTeamShort(short))
    }
  }

  const out = new Map<string, { agg: Agg; league: 'CL' | 'PL' }>()
  for (const [id, agg] of byPlayer.entries()) {
    out.set(id, { agg, league: leagueByPlayer.get(id) ?? 'CL' })
  }
  return out
}

function buildPitchingRow(
  yahooId: string,
  agg: Agg,
  meta: { name: string; team: string },
  romanName?: string
): Record<string, unknown> {
  const outs = agg.ipOuts
  const ipDec = outs / 3
  const bf = agg.bf
  const era = outs > 0 ? (agg.er * 27) / outs : 0
  const whip = ipDec > 0 ? (agg.bb + agg.h) / ipDec : 0
  const kPct = bf > 0 ? (agg.so / bf) * 100 : 0
  const bbPct = bf > 0 ? (agg.bb / bf) * 100 : 0
  const kBbPct = bf > 0 ? ((agg.so - agg.bb) / bf) * 100 : 0
  const wpct = agg.w + agg.l > 0 ? agg.w / (agg.w + agg.l) : 0
  const pIp = ipDec > 0 ? agg.np / ipDec : 0
  const abEst = Math.max(0, bf - agg.bb - agg.hbp)
  const avgAgainst = abEst > 0 ? agg.h / abEst : 0
  const obpAgainst = bf > 0 ? (agg.h + agg.bb + agg.hbp) / bf : 0
  const tbEst = agg.h + agg.hr * 3
  const slgAgainst = abEst > 0 ? tbEst / abEst : 0
  const babipDenom = bf - agg.bb - agg.hbp - agg.so - agg.hr
  const babipAgainst = babipDenom > 0 ? (agg.h - agg.hr) / babipDenom : 0

  const name = meta.name.trim() || yahooId
  const team = meta.team.trim()

  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: '防御率',
    era,
    k_bb_pct: kBbPct,
    w: agg.w,
    l: agg.l,
    hld: agg.hld,
    sv: 0,
    hp: 0,
    g: agg.gameIds.size,
    gs: 0,
    cg: 0,
    sho: 0,
    wpct,
    ip: ipDec,
    bf,
    np: agg.np,
    p_ip: pIp,
    ha: agg.h,
    hra: agg.hr,
    so: agg.so,
    bb: agg.bb,
    whip,
    k_pct: kPct,
    bb_pct: bbPct,
    qs_rate: 0,
    hqs_rate: 0,
    sqs_rate: 0,
    avg_against: avgAgainst,
    babip_against: babipAgainst,
    obp_against: obpAgainst,
    slg_against: slgAgainst,
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

  const docs = loadCanonicalDocs()
  if (docs.length === 0) {
    console.error('[phase19] canonical が _data/scraped_games/canonical/ にありません')
    process.exit(1)
  }

  const metaMap = yahooMetaFromCanonical(docs)
  const aggregated = aggregatePitching(docs)
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
      const ranked = sorted.map((raw, idx) => ({
        rank: idx + 1,
        ...raw,
      }))

      const fileBase = sanitizeMetricForPath(m.label)
      writeFileSync(join(outDir, `${fileBase}.json`), JSON.stringify(ranked, null, 2), 'utf8')
      writeFileSync(join(outDir, `${fileBase}_all.json`), JSON.stringify(ranked, null, 2), 'utf8')
    }

    console.log(`[phase19] wrote ${lg} (${metrics.length} metrics, ${list.length} pitchers) → ${outDir}`)
  }

  console.log(`[phase19] source games: ${docs.map((d) => d.gameId).join(', ')}`)
  assertPitchingRankingRosterComplete(projectRoot, year)
}

main()
