/**
 * Phase 0: スポナビ日程（1軍）を巡回し、日別スナップショットと gameId のインデックスを生成する。
 *
 * 入力:
 *   https://baseball.yahoo.co.jp/npb/schedule/first/all?date=YYYY-MM-DD
 *
 * 出力:
 *   _data/sportsnavi_schedule_snapshots/by_date/YYYY-MM-DD.json
 *     - gameIds に加え games[]（gameId + stadiumName）と stadiumByGameId を保存
 *   _data/sportsnavi_schedule_diff/YYYY-MM-DD.json（前回との差分。初回は作らない）
 *   _data/sportsnavi_schedule_index/season_YYYY.json
 *     - stadiumByGameId（全試合の gameId→球場名。Phase 13 球場別打撃で参照）
 *
 * 使い方:
 *   npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year 2026 --from 2026-03-27 --to 2026-04-14
 *   npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year 2026 --from 2026-04-17 --to 2026-04-18 --merge
 *   npx tsx scripts/phase0_fetch_sportsnavi_schedule.ts --year 2026 --from 2026-04-19 --to 2026-04-19 --merge
 *
 * 注意:
 * - スポナビ側のHTMLは変わり得るため、パースは best-effort（gameId抽出を最優先）。
 * - 日程表の `rowspan` は日によって変わるため、複数候補でスコープを探す。
 * - **1日あたり gameId 件数が 0〜6 を超える**抽出結果はパース異常とみなし、**前回スナップショットを維持**し `_data/scraped_games/_meta/pipeline_bulk.log` に記録する。
 * - **--merge** … 既存の `season_YYYY.json` とマージ（byDate は今回の日付だけ上書き、gameIds は和集合）。
 *   狭い `--from`/`--to` だけの実行で **全試合の gameId を消さない**（日次パイプライン推奨）。
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadScheduleStadiumByGameId } from "@/lib/loadScheduleStadiumByGameId"
import {
  dedupeScheduleGamesById,
  extractGamesFromScheduleHtml,
  SCHEDULE_MAX_GAMES_PER_DAY,
  type ScheduleGameEntry,
} from "@/lib/sportsnaviScheduleParse"
import { appendBulkIssueFixLog } from "./bulkIssueFixLog.mjs"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

type DaySnapshotV1 = {
  schemaVersion: "sportsnavi-schedule-day-v1"
  year: string
  dateJst: string
  fetchedAt: string
  sourceUrl: string
  gameIds: string[]
  stadiumByGameId?: Record<string, string>
}

type DaySnapshotV2 = {
  schemaVersion: "sportsnavi-schedule-day-v2"
  year: string
  dateJst: string // YYYY-MM-DD
  fetchedAt: string
  sourceUrl: string
  gameIds: string[]
  games: ScheduleGameEntry[]
  stadiumByGameId: Record<string, string>
}

type DaySnapshotV3 = {
  schemaVersion: "sportsnavi-schedule-day-v3"
  year: string
  dateJst: string
  fetchedAt: string
  sourceUrl: string
  gameIds: string[]
  games: ScheduleGameEntry[]
  stadiumByGameId: Record<string, string>
}

type DaySnapshotV4 = {
  schemaVersion: "sportsnavi-schedule-day-v4"
  year: string
  dateJst: string
  fetchedAt: string
  sourceUrl: string
  gameIds: string[]
  games: ScheduleGameEntry[]
  stadiumByGameId: Record<string, string>
  scheduleStatusByGameId: Record<string, string>
}

type DaySnapshot = DaySnapshotV1 | DaySnapshotV2 | DaySnapshotV3 | DaySnapshotV4

type DayDiffV1 = {
  schemaVersion: "sportsnavi-schedule-day-diff-v1"
  year: string
  dateJst: string
  fetchedAt: string
  addedGameIds: string[]
  removedGameIds: string[]
}

type SeasonIndexV1 = {
  schemaVersion: "sportsnavi-schedule-season-index-v1"
  year: string
  builtAt: string
  from: string
  to: string
  gameIds: string[]
  byDate: Record<string, string[]>
  /** gameId → 日程表左上の球場名（Phase 13 等） */
  stadiumByGameId: Record<string, string>
  /** gameId → Yahoo日程ページの状態（試合終了 / 試合中止 / ノーゲーム / 試合前）。中止判定の最終基準。 */
  scheduleStatusByGameId?: Record<string, string>
  /** gameId → Phase0で保存した対戦カード情報。予想先発タブ等の対戦カード基準。 */
  scheduleGameByGameId?: Record<string, ScheduleGameEntry>
}

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const throttleIdx = argv.indexOf("--throttle-ms")
  const retriesIdx = argv.indexOf("--fetch-retries")
  const merge = argv.includes("--merge")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  // 2026年はペナントレース（リーグ戦）が 3/27 から開始する前提で、デフォルトは 3/27 以降に絞る
  const from = fromIdx >= 0 ? (argv[fromIdx + 1] ?? "").trim() : `${year}-03-27`
  const to = toIdx >= 0 ? (argv[toIdx + 1] ?? "").trim() : new Date().toISOString().slice(0, 10)
  const throttleMsRaw = throttleIdx >= 0 ? (argv[throttleIdx + 1] ?? "").trim() : ""
  const throttleMs = throttleMsRaw ? Math.max(0, parseInt(throttleMsRaw, 10) || 0) : 400
  const retriesRaw = retriesIdx >= 0 ? (argv[retriesIdx + 1] ?? "").trim() : ""
  const fetchRetries = retriesRaw ? Math.max(0, parseInt(retriesRaw, 10) || 0) : 4
  return { year, from, to, throttleMs, merge, fetchRetries }
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function* dateRange(from: string, to: string): Generator<string> {
  const d0 = new Date(from + "T00:00:00Z")
  const d1 = new Date(to + "T00:00:00Z")
  for (let d = d0; d.getTime() <= d1.getTime(); d = new Date(d.getTime() + 86400_000)) {
    yield d.toISOString().slice(0, 10)
  }
}

/** @deprecated 互換のため。正は `SCHEDULE_MAX_GAMES_PER_DAY`（`@/lib/sportsnaviScheduleParse`）。 */
export const PHASE0_MAX_GAMES_PER_DAY = SCHEDULE_MAX_GAMES_PER_DAY

function gamesToStadiumMap(games: ScheduleGameEntry[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const g of games) {
    if (!g.gameId || !g.stadiumName || g.stadiumName === "未設定") continue
    m[g.gameId] = g.stadiumName
  }
  return m
}

function gamesToStatusMap(games: ScheduleGameEntry[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const g of games) {
    const status = String(g.statusText ?? "").trim()
    if (g.gameId && status) m[g.gameId] = status
  }
  return m
}

function gamesToGameMap(games: ScheduleGameEntry[]): Record<string, ScheduleGameEntry> {
  const m: Record<string, ScheduleGameEntry> = {}
  for (const g of games) {
    if (g.gameId) m[g.gameId] = g
  }
  return m
}

function readJsonIfExists<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractYmdFromTitle(title: string): string {
  const m = String(title ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return ""
  const [, yyyy, mm, dd] = m
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
}

function readCanonicalYmdIfExists(root: string, gameId: string): string {
  const canonPath = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  if (!fs.existsSync(canonPath)) return ""
  try {
    const doc = JSON.parse(fs.readFileSync(canonPath, "utf8")) as {
      game?: { meta?: { documentTitle?: string; ogTitle?: string } }
    }
    const meta = doc?.game?.meta ?? {}
    return (
      extractYmdFromTitle(meta.documentTitle ?? "") || extractYmdFromTitle(meta.ogTitle ?? "")
    )
  } catch {
    return ""
  }
}

function filterGamesByCanonicalDateMismatch(
  root: string,
  ymd: string,
  games: ScheduleGameEntry[],
  sourceUrl: string,
): ScheduleGameEntry[] {
  const kept: ScheduleGameEntry[] = []
  const removed: Array<{ gameId: string; canonicalYmd: string }> = []

  for (const game of games) {
    const canonicalYmd = readCanonicalYmdIfExists(root, game.gameId)
    if (canonicalYmd && canonicalYmd !== ymd) {
      removed.push({ gameId: game.gameId, canonicalYmd })
      continue
    }
    kept.push(game)
  }

  if (removed.length > 0) {
    const issue = `schedule page included stale cross-day gameId(s): ${removed
      .map((r) => `${r.gameId}:${r.canonicalYmd}`)
      .join(", ")}`
    const fix = "excluded gameId(s) whose canonical title date did not match the requested day"
    console.warn(`[phase0] ${ymd}: ${issue}`)
    appendBulkIssueFixLog(root, {
      phase: "phase0:sportsnavi:schedule",
      dateJst: ymd,
      issue,
      fix,
      gameIds: removed.map((r) => r.gameId),
      sourceUrl,
    })
    appendPipelineBulkLog(
      root,
      "phase0_schedule",
      `date=${ymd} filtered stale cross-day gameId(s): ${removed
        .map((r) => `${r.gameId}:${r.canonicalYmd}`)
        .join(", ")}`,
    )
  }

  return kept
}

async function fetchText(url: string, fetchRetries: number): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  }
  let lastErr: unknown
  for (let attempt = 0; attempt <= fetchRetries; attempt++) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      return await res.text()
    } catch (e) {
      lastErr = e
      if (attempt < fetchRetries) {
        const waitMs = 1000 * Math.pow(2, attempt)
        console.warn(
          `[phase0] fetch failed (${attempt + 1}/${fetchRetries + 1}), retry in ${waitMs}ms: ${url}`,
        )
        await sleep(waitMs)
      }
    }
  }
  throw lastErr
}

async function main() {
  const root = getProjectRoot()
  const { year, from, to, throttleMs, merge, fetchRetries } = parseArgs(process.argv.slice(2))
  if (!isYmd(from) || !isYmd(to)) {
    console.error("[phase0] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }

  const outByDate = path.join(root, "_data", "sportsnavi_schedule_snapshots", "by_date")
  const outDiff = path.join(root, "_data", "sportsnavi_schedule_diff")
  const outIndexDir = path.join(root, "_data", "sportsnavi_schedule_index")
  const idxPath = path.join(outIndexDir, `season_${year}.json`)
  const existingIndex = merge ? readJsonIfExists<SeasonIndexV1>(idxPath) : null

  ensureDir(outByDate)
  ensureDir(outDiff)
  ensureDir(outIndexDir)

  const byDate: Record<string, string[]> = {}
  const stadiumByGameId: Record<string, string> = {
    ...(existingIndex?.stadiumByGameId ?? {}),
  }
  const scheduleStatusByGameId: Record<string, string> = {
    ...(existingIndex?.scheduleStatusByGameId ?? {}),
  }
  const scheduleGameByGameId: Record<string, ScheduleGameEntry> = {
    ...(existingIndex?.scheduleGameByGameId ?? {}),
  }
  const all = new Set<string>()
  const fetchedAt = new Date().toISOString()

  const days = [...dateRange(from, to)]
  for (let di = 0; di < days.length; di++) {
    const ymd = days[di]!
    const snapPath = path.join(outByDate, `${ymd}.json`)
    const prevSnap = readJsonIfExists<DaySnapshot>(snapPath)

    // 現在の正は `all`。パース異常時だけ、従来の league/inter 併用へ戻す。
    const urlAll = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${encodeURIComponent(ymd)}`
    const urlLeague = `https://baseball.yahoo.co.jp/npb/schedule/first/league?date=${encodeURIComponent(ymd)}`
    const urlInter = `https://baseball.yahoo.co.jp/npb/schedule/first/inter?date=${encodeURIComponent(ymd)}`

    const htmlAll = await fetchText(urlAll, fetchRetries)
    const gamesAll = extractGamesFromScheduleHtml(htmlAll, ymd)

    let extractedGames = gamesAll
    let url = urlAll
    if (gamesAll.length > SCHEDULE_MAX_GAMES_PER_DAY) {
      // 交流戦などでページ構造が変わった場合の後方互換フォールバック。
      const htmlLeague = await fetchText(urlLeague, fetchRetries)
      const gamesLeague = extractGamesFromScheduleHtml(htmlLeague, ymd)

      const htmlInter = await fetchText(urlInter, fetchRetries)
      const gamesInter = extractGamesFromScheduleHtml(htmlInter, ymd)

      const union = dedupeScheduleGamesById([...gamesLeague, ...gamesInter])
      extractedGames =
        union.length > 0 && union.length <= SCHEDULE_MAX_GAMES_PER_DAY
          ? union
          : gamesLeague.length >= gamesInter.length
            ? gamesLeague
            : gamesInter
      url = gamesInter.length > gamesLeague.length ? urlInter : urlLeague
    }
    const filteredGames = filterGamesByCanonicalDateMismatch(root, ymd, extractedGames, url)

    const extractedIds = filteredGames.map((g) => g.gameId)
    let games = filteredGames
    let gameIds = extractedIds

    if (gameIds.length > PHASE0_MAX_GAMES_PER_DAY) {
      const revertTo =
        prevSnap &&
        (prevSnap.schemaVersion === "sportsnavi-schedule-day-v4" ||
          prevSnap.schemaVersion === "sportsnavi-schedule-day-v3" ||
          prevSnap.schemaVersion === "sportsnavi-schedule-day-v2" ||
          prevSnap.schemaVersion === "sportsnavi-schedule-day-v1") &&
        Array.isArray(prevSnap.gameIds)
          ? [...prevSnap.gameIds]
          : []
      const revertGames =
        prevSnap?.schemaVersion === "sportsnavi-schedule-day-v4" ||
        prevSnap?.schemaVersion === "sportsnavi-schedule-day-v3" ||
        prevSnap?.schemaVersion === "sportsnavi-schedule-day-v2"
          ? [...prevSnap.games]
          : revertTo.map((id) => ({ gameId: id, stadiumName: prevSnap?.stadiumByGameId?.[id] ?? "未設定" }))
      const msg = `date=${ymd} extracted ${extractedIds.length} gameIds (>${PHASE0_MAX_GAMES_PER_DAY}); sample=${extractedIds
        .slice(0, 8)
        .join(",")}; using ${revertTo.length} id(s) from previous snapshot (or empty)`
      appendPipelineBulkLog(root, "phase0", msg)
      console.error(`[phase0] ERROR: ${msg}`)
      gameIds = revertTo
      games = revertGames
    }

    const withStadium = games.filter((g) => g.stadiumName && g.stadiumName !== "未設定").length
    console.log(
      `[phase0] ${di + 1}/${days.length} ${ymd} … ${gameIds.length} game(s), stadium labeled ${withStadium}`,
    )

    const dayStadiumMap = gamesToStadiumMap(games)
    for (const [gid, name] of Object.entries(dayStadiumMap)) {
      stadiumByGameId[gid] = name
    }
    const dayStatusMap = gamesToStatusMap(games)
    for (const [gid, status] of Object.entries(dayStatusMap)) {
      scheduleStatusByGameId[gid] = status
    }
    for (const [gid, game] of Object.entries(gamesToGameMap(games))) {
      scheduleGameByGameId[gid] = game
    }

    const snap: DaySnapshotV4 = {
      schemaVersion: "sportsnavi-schedule-day-v4",
      year,
      dateJst: ymd,
      fetchedAt,
      sourceUrl: url,
      gameIds,
      games,
      stadiumByGameId: dayStadiumMap,
      scheduleStatusByGameId: dayStatusMap,
    }

    const prev = prevSnap
    fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2), "utf8")

    byDate[ymd] = gameIds
    for (const id of gameIds) all.add(id)

    if (
      prev &&
      (prev.schemaVersion === "sportsnavi-schedule-day-v4" ||
        prev.schemaVersion === "sportsnavi-schedule-day-v3" ||
        prev.schemaVersion === "sportsnavi-schedule-day-v2" ||
        prev.schemaVersion === "sportsnavi-schedule-day-v1")
    ) {
      const prevSet = new Set(prev.gameIds ?? [])
      const curSet = new Set(gameIds)
      const added = [...curSet].filter((x) => !prevSet.has(x)).sort()
      const removed = [...prevSet].filter((x) => !curSet.has(x)).sort()
      if (added.length || removed.length) {
        const diff: DayDiffV1 = {
          schemaVersion: "sportsnavi-schedule-day-diff-v1",
          year,
          dateJst: ymd,
          fetchedAt,
          addedGameIds: added,
          removedGameIds: removed,
        }
        fs.writeFileSync(path.join(outDiff, `${ymd}.json`), JSON.stringify(diff, null, 2), "utf8")
      }
    }

    if (throttleMs > 0) await sleep(throttleMs)
  }

  let mergedByDate: Record<string, string[]> = { ...byDate }
  let mergedGameIds = new Set<string>(all)
  let mergedFrom = from
  let mergedTo = to

  if (
    merge &&
    existingIndex?.schemaVersion === "sportsnavi-schedule-season-index-v1" &&
    existingIndex.year === year
  ) {
    mergedByDate = { ...(existingIndex.byDate ?? {}), ...byDate }
    mergedGameIds = new Set<string>()
    for (const ids of Object.values(mergedByDate)) {
      for (const id of ids) mergedGameIds.add(id)
    }
    mergedFrom = minYmd(from, existingIndex.from)
    mergedTo = maxYmd(to, existingIndex.to)
    console.log(
      `[phase0] merge: combined with existing index (games ${existingIndex.gameIds.length} → ${mergedGameIds.size})`,
    )
  } else if (merge && !existingIndex) {
    console.log("[phase0] merge: no existing season index; writing fresh range only")
  } else if (!merge && existingIndex?.schemaVersion === "sportsnavi-schedule-season-index-v1") {
    const prevIds = new Set(existingIndex.gameIds ?? [])
    const lost = [...prevIds].filter((id) => !all.has(id))
    if (lost.length > 0) {
      console.warn(
        `[phase0] WARN: without --merge, ${lost.length} gameId(s) from the previous index are NOT in this run's range (example: ${lost.slice(0, 3).join(", ")}). Use --merge for incremental updates.`,
      )
    }
  }

  const stadiumByGameIdMerged = Object.fromEntries(loadScheduleStadiumByGameId(year, root))

  const index: SeasonIndexV1 = {
    schemaVersion: "sportsnavi-schedule-season-index-v1",
    year,
    builtAt: fetchedAt,
    from: mergedFrom,
    to: mergedTo,
    gameIds: [...mergedGameIds].sort(),
    byDate: mergedByDate,
    stadiumByGameId: stadiumByGameIdMerged,
    scheduleStatusByGameId,
    scheduleGameByGameId,
  }
  fs.writeFileSync(idxPath, JSON.stringify(index, null, 2), "utf8")
  const stadiumCount = Object.keys(stadiumByGameIdMerged).length
  console.log(
    `[phase0] wrote index: ${idxPath} (games=${index.gameIds.length}, stadium=${stadiumCount}, days=${Object.keys(index.byDate).length}, merge=${merge})`,
  )
}

main().catch((e) => {
  console.error("[phase0] failed:", e)
  process.exit(1)
})
