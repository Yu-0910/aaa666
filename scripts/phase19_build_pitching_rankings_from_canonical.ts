/**
 * Phase 19: 投手ランキング用静的 JSON を生成する。
 *
 * 既定入力は `_data/derived/player_season_pitching_poc/{year}/npb_*.json`。
 * これにより、差分更新後のランキング再生成で canonical 全試合の再集計を避ける。
 *
 * team-games.json は既存の season ranking 出力を再利用し、無い場合だけ canonical から再計算する。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { PitcherSeasonPocPayload } from "../lib/pitcherSeasonPocTypes"
import {
  CSV_TEAM_TO_RANKING_SHORT,
  leagueBucketForTeamShort,
  rosterTeamToRankingShort,
} from "../lib/yahooGame/canonicalPitchingSeasonAgg"
import { loadMetricsFromRecordPitching } from "../lib/ranking/recordPitching"
import { getPitchingJsonKey } from "../lib/ranking/metricMap"
import { sanitizeMetricForPath } from "../lib/ranking/url"
import {
  getRomanNameMap,
  normalizeRomanMapKey,
  normalizeRomanMapKeyNoSpace,
} from "../lib/ranking/romanNameFromCsv"
import {
  findRosterPlayerByPublicId,
  findRosterPlayerByPublicIdOrJaName,
  rosterEnglishShortForRanking,
} from "../lib/npbRoster"
import { assertPitchingRankingRosterComplete } from "../lib/ranking/verifyPitchingRankingRoster"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { aggregateSeasonTeamGamesFromCanonical } from "../lib/yahooGame/aggregateTeamGamesFromCanonical"
import {
  readTeamGamesJsonFile,
  seasonTeamGamesJsonPath,
} from "../lib/ranking/teamGamesJson"
import {
  assignRanks,
  filterPitchingRowsForQualifyingAtBuild,
} from "../lib/ranking/filterRankingsByQualifyingAtBuild"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    }
  }
  return { year }
}

function resolveRomanName(
  yahooId: string,
  nameJa: string,
  teamShort: string,
  romanMap: Record<string, string>
): string | undefined {
  const roster = findRosterPlayerByPublicIdOrJaName(yahooId, nameJa)
  const enFromRoster = roster ? rosterEnglishShortForRanking(roster) : ""
  if (enFromRoster) return enFromRoster

  const teamCsv = roster?.team
    ? roster.team
    : teamShort
      ? Object.keys(CSV_TEAM_TO_RANKING_SHORT).find((k) => CSV_TEAM_TO_RANKING_SHORT[k] === teamShort) ?? teamShort
      : ""

  const tryKeys: Array<[string, string]> = []
  if (roster) {
    tryKeys.push([roster.name_ja, roster.team])
    tryKeys.push([roster.name_ja.replace(/\u3000/g, " "), roster.team])
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

type OfficialCgRow = { npbPlayerId?: string; name: string; team: string; cg: number; sho: number }

function loadOfficialCgRows(year: string): OfficialCgRow[] {
  const path = join(projectRoot, "_data", "derived", `npb_official_pitching_cg_${year}.json`)
  if (!existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { players?: OfficialCgRow[] }
  return Array.isArray(parsed.players) ? parsed.players : []
}

function officialCgForPitcher(
  yahooId: string,
  meta: { name: string; team: string },
  rows: OfficialCgRow[]
): OfficialCgRow | undefined {
  const roster = findRosterPlayerByPublicIdOrJaName(yahooId, meta.name)
  const npbId = roster?.npb_player_id?.trim() ?? ""
  if (npbId) {
    const byId = rows.find((row) => String(row.npbPlayerId ?? "").trim() === npbId)
    if (byId) return byId
  }
  const compact = (value: string) => value.replace(/[\s\u3000]/g, "").replace(/^\*/, "")
  return rows.find((row) => compact(row.name) === compact(meta.name) && row.team === meta.team)
}

const LOWER_BETTER = new Set([
  "era",
  "whip",
  "avg_against",
  "babip_against",
  "obp_against",
  "slg_against",
  "p_ip",
  "bb_pct",
])

function metricSortAsc(metricKey: string): boolean {
  if (metricKey === "bb_pct") return true
  return LOWER_BETTER.has(metricKey)
}

function sortValue(metricKey: string, row: Record<string, unknown>): number {
  const v = row[metricKey]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function numFromLoose(value: unknown): number {
  const v = String(value ?? "").trim()
  if (!v) return 0
  const n = parseFloat(v.startsWith(".") ? `0${v}` : v)
  return Number.isFinite(n) ? n : 0
}

function loadPitcherPocPayloads(year: string): PitcherSeasonPocPayload[] {
  const dir = join(projectRoot, "_data", "derived", "player_season_pitching_poc", year)
  if (!existsSync(dir)) return []
  const out: PitcherSeasonPocPayload[] = []
  for (const file of readdirSync(dir)) {
    if (!/^npb_.+\.json$/.test(file)) continue
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as PitcherSeasonPocPayload
      if (!raw?.npbPlayerId || !raw?.basic) continue
      out.push(raw)
    } catch {
      // ignore malformed file
    }
  }
  return out
}

function loadTeamGamesByLeague(year: string): Record<"CL" | "PL", Record<string, number>> {
  const cl = readTeamGamesJsonFile(seasonTeamGamesJsonPath(projectRoot, year, "CL"))
  const pl = readTeamGamesJsonFile(seasonTeamGamesJsonPath(projectRoot, year, "PL"))
  if (cl && pl) {
    return { CL: cl.teams, PL: pl.teams }
  }
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    throw new Error("[phase19] team-games.json が無く canonical も見つかりません。先に phase12 を実行してください。")
  }
  console.warn("[phase19] season team-games.json missing; falling back to canonical scan")
  return aggregateSeasonTeamGamesFromCanonical(docs, year)
}

function buildPitchingRowFromPoc(
  yahooId: string,
  payload: PitcherSeasonPocPayload,
  officialCg: OfficialCgRow | undefined,
  metaOverride?: { name: string; team: string },
  romanName?: string
): Record<string, unknown> {
  const basic = payload.basic
  const team = metaOverride?.team?.trim() || rosterTeamToRankingShort(payload.team)
  const name = metaOverride?.name?.trim() || String(payload.playerName ?? "").trim() || yahooId
  const outs = basic.ipOuts ?? 0
  const ip = outs / 3
  const bf = basic.bf ?? 0
  const bb = basic.bb ?? 0
  const hbp = basic.hbp ?? 0
  const h = basic.h ?? 0
  const hr = basic.hr ?? 0
  const so = basic.so ?? 0
  const np = basic.pitches ?? 0
  const abEst = Math.max(0, bf - bb - hbp)
  const avgAgainst = basic.avgAgainstApprox ? numFromLoose(basic.avgAgainstApprox) : abEst > 0 ? h / abEst : 0
  const obpAgainst = bf > 0 ? (h + bb + hbp) / bf : 0
  const tbEst = h + hr * 3
  const slgAgainst = abEst > 0 ? tbEst / abEst : 0
  const babipDenom = bf - bb - hbp - so - hr
  const babipAgainst = babipDenom > 0 ? (h - hr) / babipDenom : 0
  const gs = basic.gamesStarted ?? 0
  const wins = basic.winCount ?? (basic.decision === "win" ? 1 : 0)
  const losses = basic.lossCount ?? (basic.decision === "loss" ? 1 : 0)
  const holds = basic.holds ?? (basic.decision === "hold" ? 1 : 0)
  const saves = basic.saveCount ?? (basic.decision === "save" ? 1 : 0)
  const completeGames = officialCg?.cg ?? basic.completeGames ?? 0
  const shutouts = officialCg?.sho ?? basic.shutouts ?? 0
  const qsRate = typeof basic.qsRate === "number" ? basic.qsRate * 100 : 0
  const hqsRate = typeof basic.hqsRate === "number" ? basic.hqsRate * 100 : 0
  const sqsRate = typeof basic.sqsRate === "number" ? basic.sqsRate * 100 : 0
  const wpct = wins + losses > 0 ? wins / (wins + losses) : 0
  const kPct = bf > 0 ? (so / bf) * 100 : 0
  const bbPct = bf > 0 ? (bb / bf) * 100 : 0
  const kBbPct = bf > 0 ? ((so - bb) / bf) * 100 : 0
  const pIp = ip > 0 ? np / ip : 0

  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: "防御率",
    era: basic.era ?? 0,
    k_bb_pct: kBbPct,
    w: wins,
    l: losses,
    hld: holds,
    sv: saves,
    hp: 0,
    g: basic.gamesAppeared ?? 0,
    gs,
    cg: completeGames,
    sho: shutouts,
    wpct,
    ip,
    bf,
    np,
    p_ip: pIp,
    ha: h,
    hra: hr,
    so,
    bb,
    whip: basic.whip ?? 0,
    k_pct: kPct,
    bb_pct: bbPct,
    qs_rate: qsRate,
    hqs_rate: hqsRate,
    sqs_rate: sqsRate,
    avg_against: avgAgainst,
    babip_against: babipAgainst,
    obp_against: obpAgainst,
    slg_against: slgAgainst,
  }
  if (romanName) base.romanName = romanName
  return base
}

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()
  if (year !== "2026") {
    console.error("[phase19] 完成品は 2026 のみ。--year 2026 を指定してください。")
    process.exit(1)
  }

  const payloads = loadPitcherPocPayloads(year)
  if (payloads.length === 0) {
    console.error(`[phase19] player_season_pitching_poc が _data/derived/player_season_pitching_poc/${year}/ にありません`)
    console.error("  run: npm run phase:pitcher:poc1")
    process.exit(1)
  }

  const teamGamesByLeague = loadTeamGamesByLeague(year)
  const metrics = loadMetricsFromRecordPitching()
  const officialCgRows = loadOfficialCgRows(year)
  if (officialCgRows.length === 0) {
    throw new Error(`[phase19] NPB公式の完投データがありません。npm run npb:official-cg:fetch:2026 を実行してください。`)
  }
  const romanMapCL = getRomanNameMap(year, "CL")
  const romanMapPL = getRomanNameMap(year, "PL")
  const baseOut = join(projectRoot, "public", "data", "rankings", "pitching", year)

  const byLeague: Record<"CL" | "PL", Array<{ yahooId: string; row: Record<string, unknown> }>> = {
    CL: [],
    PL: [],
  }
  const romanFallbacks: string[] = []
  const sourceGames = new Set<string>()

  for (const payload of payloads) {
    const yahooId = String(payload.yahooPitcherIds?.[0] ?? "").trim()
    if (!yahooId) continue
    for (const gameId of payload.source?.canonicalGames ?? []) {
      if (gameId) sourceGames.add(gameId)
    }
    const roster =
      findRosterPlayerByPublicId(String(payload.npbPlayerId ?? "").trim()) ??
      findRosterPlayerByPublicId(yahooId) ??
      findRosterPlayerByPublicIdOrJaName(yahooId, String(payload.playerName ?? "").trim())
    const teamShort = roster?.team
      ? rosterTeamToRankingShort(roster.team)
      : rosterTeamToRankingShort(payload.team)
    const league = leagueBucketForTeamShort(teamShort)
    if (!league) continue
    const meta = {
      name: String(roster?.name_ja ?? payload.playerName ?? "").trim() || yahooId,
      team: teamShort,
    }
    const officialCg = officialCgForPitcher(yahooId, meta, officialCgRows)
    const romanMap = league === "PL" ? romanMapPL : romanMapCL
    const romanResolved = resolveRomanName(yahooId, meta.name, meta.team, romanMap)
    const roman = romanResolved || meta.name || yahooId
    if (!romanResolved) {
      romanFallbacks.push(`${league}:${yahooId}:${meta.name || yahooId}:${meta.team || "-"}`)
    }
    const row = buildPitchingRowFromPoc(yahooId, payload, officialCg, meta, roman)
    byLeague[league].push({ yahooId, row })
  }

  for (const lg of ["CL", "PL"] as const) {
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
      writeJsonFileWithRetrySync(join(outDir, `${fileBase}.json`), rankedPublic)
      writeJsonFileWithRetrySync(join(outDir, `${fileBase}_all.json`), rankedAll)
    }

    console.log(`[phase19] wrote ${lg} (${metrics.length} metrics, ${list.length} pitchers) → ${outDir}`)
  }

  console.log(`[phase19] source games: ${[...sourceGames].sort().join(", ")}`)
  if (romanFallbacks.length > 0) {
    console.warn(`[phase19] romanName fallback used for ${romanFallbacks.length} player(s): ${romanFallbacks.join(", ")}`)
  }
  assertPitchingRankingRosterComplete(projectRoot, year)
}

main()
