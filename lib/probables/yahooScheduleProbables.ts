import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { resolvePitcherFromRoster } from "@/lib/probables/resolvePitcherFromRoster"
import { topOpponentBattersFromMatchup } from "@/lib/probables/topOpponentBattersFromMatchup"
import type { TopProbablesPitcherSlot } from "@/lib/probables/types"
import { teamCodeFromShort } from "@/lib/standings/teamCodes"

type YahooScheduleProbablesSnapshot = {
  schemaVersion: "yahoo-schedule-probables-v1"
  dateJst: string
  fetchedAt: string
  sourceUrl: string
  rows: Array<{
    dateJst: string
    gameId: string
    homeTeamCode: string
    awayTeamCode: string
    homePitcherNameJa: string | null
    awayPitcherNameJa: string | null
  }>
}

function cachePath(projectRoot: string, dateJst: string): string {
  return path.join(projectRoot, "_data", "external", "yahoo_schedule_probables", `${dateJst}.json`)
}

function readSnapshotIfExists(projectRoot: string, dateJst: string): YahooScheduleProbablesSnapshot | null {
  const p = cachePath(projectRoot, dateJst)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as YahooScheduleProbablesSnapshot
  } catch {
    return null
  }
}

function writeSnapshot(projectRoot: string, snapshot: YahooScheduleProbablesSnapshot): void {
  const p = cachePath(projectRoot, snapshot.dateJst)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
}

function stripHtmlToText(fragment: string): string {
  return fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractProbableNameFromText(text: string, teamShort: string): string {
  const short = String(teamShort ?? "").trim()
  if (!short) return ""
  const re = new RegExp(`${escapeRegExp(short)}\\s*(?:\\(予\\)|予)\\s*([^\\s]+)`)
  const m = text.match(re)
  return String(m?.[1] ?? "").trim()
}

function jaNeedleFromYmd(ymd: string): string {
  const month = parseInt(ymd.slice(5, 7), 10)
  const day = parseInt(ymd.slice(8, 10), 10)
  return `${month}月${day}日`
}

function extractYahooScheduleDayBlock(html: string, dateJst: string): string {
  const jaNeedle = jaNeedleFromYmd(dateJst)
  const thRe = /<th\b[^>]*\bclass="[^"]*\bbb-scheduleTable__head\b[^"]*"[^>]*>([\s\S]*?)<\/th>/gi
  let m: RegExpExecArray | null
  while ((m = thRe.exec(html))) {
    const text = stripHtmlToText(m[1] ?? "")
    if (!text.includes(jaNeedle)) continue
    const start = html.lastIndexOf("<tbody>", m.index)
    const end = html.indexOf("</tbody>", (m.index ?? 0) + (m[0]?.length ?? 0))
    return html.slice(start >= 0 ? start : m.index, end >= 0 ? end : html.length)
  }
  return ""
}

function extractYahooScheduleRows(html: string, dateJst: string): Array<{
  gameId: string
  homeTeamCode: string
  awayTeamCode: string
  homePitcherNameJa: string | null
  awayPitcherNameJa: string | null
}> {
  const block = extractYahooScheduleDayBlock(html, dateJst)
  if (!block) return []
  const rows: Array<{
    gameId: string
    homeTeamCode: string
    awayTeamCode: string
    homePitcherNameJa: string | null
    awayPitcherNameJa: string | null
  }> = []

  const trRe = /<tr\b[^>]*class="[^"]*\bbb-scheduleTable__row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let trm: RegExpExecArray | null
  while ((trm = trRe.exec(block))) {
    const rowHtml = trm[1] ?? ""
    const rowText = stripHtmlToText(rowHtml)
    const gameId = (rowHtml.match(/href="\/npb\/game\/(\d+)\/index"/)?.[1] ?? "").trim()
    if (!gameId) continue
    const homeTeamShort = stripHtmlToText(
      rowHtml.match(/class="[^"]*\bbb-scheduleTable__homeName\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        "",
    )
    const awayTeamShort = stripHtmlToText(
      rowHtml.match(/class="[^"]*\bbb-scheduleTable__awayName\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        "",
    )
    const homePitcherNameJa = extractProbableNameFromText(rowText, homeTeamShort)
    const awayPitcherNameJa = extractProbableNameFromText(rowText, awayTeamShort)
    rows.push({
      gameId,
      homeTeamCode: homeTeamShort ? teamCodeFromShort(homeTeamShort) : "",
      awayTeamCode: awayTeamShort ? teamCodeFromShort(awayTeamShort) : "",
      homePitcherNameJa: homePitcherNameJa || null,
      awayPitcherNameJa: awayPitcherNameJa || null,
    })
  }
  return rows
}

async function fetchScheduleHtml(dateJst: string): Promise<string> {
  const url = `https://baseball.yahoo.co.jp/npb/schedule/?date=${encodeURIComponent(dateJst)}`
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Yahoo schedule fetch failed: HTTP ${res.status} ${res.statusText}`)
  }
  return await res.text()
}

function rowScore(row: YahooScheduleProbablesSnapshot["rows"][number]): number {
  return [row.homePitcherNameJa, row.awayPitcherNameJa].filter((v) => Boolean(v)).length
}

export async function loadYahooScheduleProbablesSnapshot(
  dateJst: string,
  projectRoot = getProjectRoot(),
  forceRefresh = false,
): Promise<YahooScheduleProbablesSnapshot | null> {
  if (!forceRefresh) {
    const cached = readSnapshotIfExists(projectRoot, dateJst)
    if (cached) return cached
  }

  const html = await fetchScheduleHtml(dateJst)
  const parsedRows = extractYahooScheduleRows(html, dateJst)
  if (parsedRows.length === 0) return null

  const rowsByGameId = new Map<string, YahooScheduleProbablesSnapshot["rows"][number]>()
  for (const row of parsedRows) {
    const next = {
      dateJst,
      gameId: row.gameId,
      homeTeamCode: row.homeTeamCode,
      awayTeamCode: row.awayTeamCode,
      homePitcherNameJa: row.homePitcherNameJa,
      awayPitcherNameJa: row.awayPitcherNameJa,
    }
    const prev = rowsByGameId.get(row.gameId)
    if (!prev || rowScore(next) > rowScore(prev)) {
      rowsByGameId.set(row.gameId, next)
    }
  }

  const snapshot: YahooScheduleProbablesSnapshot = {
    schemaVersion: "yahoo-schedule-probables-v1",
    dateJst,
    fetchedAt: new Date().toISOString(),
    sourceUrl: `https://baseball.yahoo.co.jp/npb/schedule/?date=${encodeURIComponent(dateJst)}`,
    rows: [...rowsByGameId.values()],
  }
  writeSnapshot(projectRoot, snapshot)
  return snapshot
}

export async function buildYahooScheduleProbableSlot(
  year: string,
  teamCode: string,
  opponentTeamCode: string,
  dateJst: string,
  projectRoot = getProjectRoot(),
  forceRefresh = false,
): Promise<TopProbablesPitcherSlot | null> {
  const snap = await loadYahooScheduleProbablesSnapshot(dateJst, projectRoot, forceRefresh)
  if (!snap) return null
  const row = snap.rows.find(
    (r) =>
      r.dateJst === dateJst &&
      ((r.homeTeamCode === teamCode && r.awayTeamCode === opponentTeamCode) ||
        (r.awayTeamCode === teamCode && r.homeTeamCode === opponentTeamCode)),
  )
  if (!row) return null

  const pitcherNameJa =
    row.homeTeamCode === teamCode
      ? row.homePitcherNameJa || null
      : row.awayPitcherNameJa || null
  if (!pitcherNameJa) return null

  const resolved = resolvePitcherFromRoster(pitcherNameJa, teamCode)
  const topOpponentBatters =
    resolved != null
      ? topOpponentBattersFromMatchup(year, resolved.pitcherNpbId, opponentTeamCode)
      : []

  return {
    teamCode,
    pitcherNameJa: resolved?.pitcherNameJa ?? pitcherNameJa,
    pitcherNpbId: resolved?.pitcherNpbId ?? null,
    pitcherPublicId: resolved?.pitcherPublicId ?? null,
    source: "yahoo-schedule",
    topOpponentBatters,
  }
}
