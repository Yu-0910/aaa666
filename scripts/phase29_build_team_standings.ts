/**
 * Phase 29: canonical からチーム順位表 JSON を生成する。
 *
 * 実行:
 *   npx tsx scripts/phase29_build_team_standings.ts --year 2026
 *   npm run phase29:build:standings -- --year 2026
 *
 * 出力:
 *   _data/derived/team_standings/{year}/{CL|PL}.json
 *   public/data/standings/{year}/{CL|PL}.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import {
  aggregateTeamStandingsFromCanonical,
  aggregateTeamStandingsBucketCountsFromCanonical,
  aggregateTeamStandingsByLeagueFromCanonical,
  deserializeTeamStandingsBucketMap,
  emptyTeamStandingsBucketCountsByLeague,
  mergeTeamStandingsBucketCounts,
  rowsFromTeamStandingsBucketCounts,
  serializeTeamStandingsBucketMap,
  type SerializableTeamBucket,
} from "@/lib/standings/aggregateTeamStandingsFromCanonical"
import {
  derivedTeamStandingsRelPath,
  derivedWeeklyTeamStandingsRelPath,
  publicTeamStandingsRelPath,
  publicWeeklyTeamStandingsRelPath,
} from "@/lib/standings/paths"
import {
  TEAM_STANDINGS_JSON_SCHEMA,
  type StandingsLeague,
  type TeamStandingsJson,
} from "@/lib/standings/types"
import { tuesdayWeekKeyFromYmd } from "@/lib/yahooGame/jstPeriodKeys"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import { loadCanonicalGamesMergedForDerivedPipeline } from "@/lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")
const GAME_CACHE_SCHEMA = "team-standings-game-cache-v1"

function parseArgs(): {
  year: string
  from?: string
  to?: string
  includeToday: boolean
  requireTargetGameCacheNonEmpty: boolean
} {
  const args = process.argv.slice(2)
  let year = "2026"
  let from: string | undefined
  let to: string | undefined
  let includeToday = false
  let requireTargetGameCacheNonEmpty = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = args[i + 1]!
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = args[i + 1]!
      i++
    } else if (args[i] === "--include-today") {
      includeToday = true
    } else if (args[i] === "--require-target-game-cache-nonempty") {
      requireTargetGameCacheNonEmpty = true
    }
  }
  return { year, from, to, includeToday, requireTargetGameCacheNonEmpty }
}

function writeStandingsJson(absPath: string, payload: TeamStandingsJson): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

type TeamStandingsGameCache = {
  schemaVersion: typeof GAME_CACHE_SCHEMA
  year: string
  gameId: string
  byLeague: Record<StandingsLeague, Record<string, SerializableTeamBucket>>
}

type TeamStandingsGameCacheManifest = {
  schemaVersion: "team-standings-game-cache-manifest-v1"
  cacheSchemaVersion: typeof GAME_CACHE_SCHEMA
  year: string
  generatedAt: string
  gameIds: string[]
}

function gameCacheDir(year: string): string {
  return join(projectRoot, "_data", "derived", "team_standings_game_cache", year)
}

function gameCachePath(year: string, gameId: string): string {
  return join(gameCacheDir(year), `${gameId}.json`)
}

function gameCacheManifestPath(year: string): string {
  return join(gameCacheDir(year), "_manifest.json")
}

function readJsonFile<T>(absPath: string): T | null {
  if (!existsSync(absPath)) return null
  try {
    return JSON.parse(readFileSync(absPath, "utf8")) as T
  } catch {
    return null
  }
}

function writeJsonFile(absPath: string, payload: unknown): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

function readValidManifest(year: string): TeamStandingsGameCacheManifest | null {
  const manifest = readJsonFile<TeamStandingsGameCacheManifest>(gameCacheManifestPath(year))
  if (
    manifest?.schemaVersion !== "team-standings-game-cache-manifest-v1" ||
    manifest.cacheSchemaVersion !== GAME_CACHE_SCHEMA ||
    manifest.year !== year ||
    !Array.isArray(manifest.gameIds)
  ) {
    return null
  }
  return manifest
}

function writeManifest(year: string, gameIds: string[]): void {
  writeJsonFile(gameCacheManifestPath(year), {
    schemaVersion: "team-standings-game-cache-manifest-v1",
    cacheSchemaVersion: GAME_CACHE_SCHEMA,
    year,
    generatedAt: new Date().toISOString(),
    gameIds: [...new Set(gameIds)].sort(),
  } satisfies TeamStandingsGameCacheManifest)
}

function recordGameTotal(cache: TeamStandingsGameCache): number {
  let total = 0
  for (const league of ["CL", "PL"] as const) {
    for (const bucket of Object.values(cache.byLeague[league] ?? {})) {
      total +=
        (bucket.record?.w ?? 0) +
        (bucket.record?.l ?? 0) +
        (bucket.record?.t ?? 0)
    }
  }
  return total
}

function battingGameIdTotal(cache: TeamStandingsGameCache, gameId: string): number {
  let total = 0
  for (const league of ["CL", "PL"] as const) {
    for (const bucket of Object.values(cache.byLeague[league] ?? {})) {
      if (bucket.batting?.gameIds?.includes(gameId)) total++
    }
  }
  return total
}

function pitchingGameIdTotal(cache: TeamStandingsGameCache, gameId: string): number {
  let total = 0
  for (const league of ["CL", "PL"] as const) {
    for (const bucket of Object.values(cache.byLeague[league] ?? {})) {
      if (bucket.pitching?.gameIds?.includes(gameId)) total++
    }
  }
  return total
}

function writeGameCache(
  year: string,
  doc: CanonicalGameDocument,
  options?: { includeToday?: boolean; requireNonEmpty?: boolean },
): void {
  const gameId = String(doc.gameId ?? "").trim()
  if (!gameId) return
  const aggregateOptions = { projectRoot, includeToday: options?.includeToday === true }
  const cache = {
    schemaVersion: GAME_CACHE_SCHEMA,
    year,
    gameId,
    CL: serializeTeamStandingsBucketMap(
      aggregateTeamStandingsBucketCountsFromCanonical([doc], year, "CL", aggregateOptions),
    ),
    PL: serializeTeamStandingsBucketMap(
      aggregateTeamStandingsBucketCountsFromCanonical([doc], year, "PL", aggregateOptions),
    ),
  }
  const payload = {
    schemaVersion: GAME_CACHE_SCHEMA,
    year,
    gameId,
    byLeague: {
      CL: cache.CL,
      PL: cache.PL,
    },
  } satisfies TeamStandingsGameCache

  if (options?.requireNonEmpty && recordGameTotal(payload) === 0) {
    throw new Error(`[phase29] standings game-cache is empty for final target game ${gameId}`)
  }

  if (options?.requireNonEmpty) {
    const battingTeams = battingGameIdTotal(payload, gameId)
    const pitchingTeams = pitchingGameIdTotal(payload, gameId)
    if (battingTeams < 2 || pitchingTeams < 2) {
      throw new Error(
        `[phase29] standings game-cache missing batting/pitching gameId for ${gameId}: battingTeams=${battingTeams} pitchingTeams=${pitchingTeams}`,
      )
    }
  }

  writeJsonFile(gameCachePath(year, gameId), payload)
}

function readGameCache(year: string, gameId: string): TeamStandingsGameCache | null {
  const cache = readJsonFile<TeamStandingsGameCache>(gameCachePath(year, gameId))
  if (
    cache?.schemaVersion !== GAME_CACHE_SCHEMA ||
    cache.year !== year ||
    cache.gameId !== gameId ||
    !cache.byLeague
  ) {
    return null
  }
  return cache
}

function aggregateRowsFromGameCaches(
  year: string,
  gameIds: string[],
): Record<StandingsLeague, TeamStandingsJson["rows"]> | null {
  const totals = emptyTeamStandingsBucketCountsByLeague()
  let used = 0
  for (const gameId of gameIds) {
    const cache = readGameCache(year, gameId)
    if (!cache) return null
    for (const league of ["CL", "PL"] as const) {
      mergeTeamStandingsBucketCounts(
        totals[league],
        deserializeTeamStandingsBucketMap(cache.byLeague[league], league),
      )
    }
    used++
  }
  if (used === 0) return null
  return {
    CL: rowsFromTeamStandingsBucketCounts("CL", totals.CL),
    PL: rowsFromTeamStandingsBucketCounts("PL", totals.PL),
  }
}

function buildAllGameCaches(
  year: string,
  options?: { includeToday?: boolean },
): Record<StandingsLeague, TeamStandingsJson["rows"]> {
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  const gameIds: string[] = []
  console.log(`[phase29] rebuilding standings game-cache for ${docs.length} canonical games...`)
  for (const doc of docs) {
    const gameId = String(doc.gameId ?? "").trim()
    if (!gameId) continue
    writeGameCache(year, doc, { includeToday: options?.includeToday })
    gameIds.push(gameId)
  }
  writeManifest(year, gameIds)
  return aggregateTeamStandingsByLeagueFromCanonical(docs, year, {
    projectRoot,
    includeToday: options?.includeToday,
  })
}

function buildIncrementalRows(
  year: string,
  from: string | undefined,
  to: string | undefined,
  options?: { includeToday?: boolean; requireTargetGameCacheNonEmpty?: boolean },
): Record<StandingsLeague, TeamStandingsJson["rows"]> {
  const manifest = readValidManifest(year)
  if (!manifest) {
    console.log("[phase29] game-cache manifest missing or stale; falling back to full rebuild once.")
    return buildAllGameCaches(year, { includeToday: options?.includeToday })
  }

  const targetDocs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year, from, to })
  for (const doc of targetDocs) {
    writeGameCache(year, doc, {
      includeToday: options?.includeToday,
      requireNonEmpty: options?.requireTargetGameCacheNonEmpty === true,
    })
  }
  const targetGameIds = targetDocs.map((doc) => String(doc.gameId ?? "").trim()).filter(Boolean)
  const allGameIds = [...new Set([...manifest.gameIds, ...targetGameIds])].sort()
  if (targetGameIds.length > 0) writeManifest(year, allGameIds)

  const rows = aggregateRowsFromGameCaches(year, allGameIds)
  if (rows) {
    console.log(`[phase29] incremental game-cache mode: refreshed ${targetGameIds.length} game(s), merged ${allGameIds.length} cached game(s).`)
    return rows
  }

  console.log("[phase29] game-cache incomplete; falling back to full rebuild once.")
  return buildAllGameCaches(year, { includeToday: options?.includeToday })
}

function buildPayload(
  year: string,
  league: StandingsLeague,
  rows: TeamStandingsJson["rows"],
): TeamStandingsJson {
  return {
    schemaVersion: TEAM_STANDINGS_JSON_SCHEMA,
    year,
    league,
    source: "canonical",
    generatedAt: new Date().toISOString(),
    rows,
  }
}

function addDaysToYmd(ymd: string, days: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ymd
  const date = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + days, 3, 0, 0))
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function collectWeekKeysFromDocs(
  docs: CanonicalGameDocument[],
  year: string,
): string[] {
  const keys = new Set<string>()
  for (const doc of docs) {
    const ymd = parseGameDateYmdFromCanonical(doc)
    if (!ymd || !ymd.startsWith(`${year}-`)) continue
    const weekKey = tuesdayWeekKeyFromYmd(ymd)
    if (weekKey) keys.add(weekKey)
  }
  return [...keys].sort()
}

function collectTargetWeekKeys(
  year: string,
  from?: string,
  to?: string,
): string[] | null {
  const keys = new Set<string>()
  for (const ymd of [from, to]) {
    if (!ymd || !ymd.startsWith(`${year}-`)) continue
    const weekKey = tuesdayWeekKeyFromYmd(ymd)
    if (weekKey) keys.add(weekKey)
  }
  return keys.size > 0 ? [...keys].sort() : null
}

function buildWeeklyStandingsForWeek(
  year: string,
  weekKey: string,
  options?: { includeToday?: boolean },
): void {
  const weekEnd = addDaysToYmd(weekKey, 5)
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, {
    year,
    from: weekKey,
    to: weekEnd,
  })

  for (const league of ["CL", "PL"] as const) {
    const rows = aggregateTeamStandingsFromCanonical(docs, year, league, {
      projectRoot,
      includeToday: options?.includeToday,
    })
    if (!rows.some((row) => row.g > 0)) continue

    const payload = buildPayload(year, league, rows)
    const derivedPath = join(projectRoot, derivedWeeklyTeamStandingsRelPath(year, weekKey, league))
    const publicPath = join(projectRoot, publicWeeklyTeamStandingsRelPath(year, weekKey, league))
    writeStandingsJson(derivedPath, payload)
    writeStandingsJson(publicPath, payload)
    console.log(
      `[phase29] weekly ${weekKey} ${league}: ${rows.length} rows → ${derivedWeeklyTeamStandingsRelPath(year, weekKey, league)}`,
    )
  }
}

function buildWeeklyStandings(
  year: string,
  seasonDocs: CanonicalGameDocument[] | null,
  from?: string,
  to?: string,
  options?: { includeToday?: boolean },
): void {
  const targetWeekKeys = collectTargetWeekKeys(year, from, to)
  const weekKeys =
    targetWeekKeys ??
    collectWeekKeysFromDocs(
      seasonDocs ?? loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year }),
      year,
    )

  for (const weekKey of weekKeys) {
    buildWeeklyStandingsForWeek(year, weekKey, options)
  }
}

function main(): void {
  process.chdir(projectRoot)
  const { year, from, to, includeToday, requireTargetGameCacheNonEmpty } = parseArgs()

  console.log(`[phase29] building team standings for ${year}...`)
  if (includeToday) {
    console.log("[phase29] include-today mode: scored current-day games are eligible for standings.")
  }
  const byLeague =
    from || to
      ? buildIncrementalRows(year, from, to, { includeToday, requireTargetGameCacheNonEmpty })
      : buildAllGameCaches(year, { includeToday })

  for (const league of ["CL", "PL"] as const) {
    const rows = byLeague[league]
    const payload = buildPayload(year, league, rows)

    for (const row of rows) {
      if (row.g !== row.w + row.l + row.t) {
        console.warn(
          `[phase29] WARN ${league} ${row.team}: g(${row.g}) != w+l+t(${row.w + row.l + row.t})`,
        )
      }
    }

    const derivedPath = join(projectRoot, derivedTeamStandingsRelPath(year, league))
    const publicPath = join(projectRoot, publicTeamStandingsRelPath(year, league))
    writeStandingsJson(derivedPath, payload)
    writeStandingsJson(publicPath, payload)
    console.log(`[phase29] ${league}: ${rows.length} rows → ${derivedTeamStandingsRelPath(year, league)}`)
  }

  const docsForWeekly = from || to ? null : loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  buildWeeklyStandings(year, docsForWeekly, from, to, { includeToday })

  console.log("[phase29] done")
}

main()
