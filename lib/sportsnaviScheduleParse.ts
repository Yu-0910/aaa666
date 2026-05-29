import { normalizeStadiumSplitValue } from "@/lib/stadiumVenueNormalize"

/**
 * スポナビ 1軍リーグ戦日程 HTML（Phase 0）から gameId・球場名を抽出する。
 * 球場名は試合枠左上の `bb-scheduleTable__stadium` 列（同一 `<tr>` 内の game リンク）。
 */

export type ScheduleGameEntry = {
  gameId: string
  stadiumName: string
}

/** 1日あたりの通常セ・パ公式戦は最大6（休養日は0）。Phase0 と共有。 */
export const SCHEDULE_MAX_GAMES_PER_DAY = 6

const SCHEDULE_ROWSPAN_CANDIDATES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export function stripHtmlToText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 日程表の表示名をマスタで正規化（空のみ「未設定」）。 */
export function normalizeStadiumNameFromSchedule(raw: string): string {
  const s = stripHtmlToText(raw)
  return normalizeStadiumSplitValue(s)
}

/**
 * `bb-scheduleTable__head` の `<th>` は属性順が変わり得るので、文字列完全一致ではなく regex で探す。
 * 例: `<th class="bb-scheduleTable__head" scope="row" rowspan="2">5月27日</th>`
 */
const SCHEDULE_DAY_HEAD_TH_RE =
  /<th\b[^>]*\bclass="[^"]*\bbb-scheduleTable__head\b[^"]*"[^>]*>([\s\S]*?)<\/th>/gi

function jaNeedleFromYmd(ymd: string): string {
  const month = parseInt(ymd.slice(5, 7), 10)
  const day = parseInt(ymd.slice(8, 10), 10)
  return `${month}月${day}日`
}

/** 当日セルだけに切る（休養日のあと tbody 全体を取らない）。 */
function sliceScheduleDayBlockAt(html: string, start: number, endExclusive: number): string {
  if (start < 0) return ""
  const end = endExclusive > start ? endExclusive : html.length
  const block = html.slice(start, end)
  return block
}

function dayThNeedleForRowspan(jaNeedle: string, rowspan: number): string {
  // 後方互換（旧ロジック）: まずは marker からの indexOf も試す
  return `bb-scheduleTable__head" scope="row" rowspan="${rowspan}">${jaNeedle}`
}

function dayThNeedleWithoutRowspan(jaNeedle: string): string {
  // 後方互換（旧ロジック）: まずは marker からの indexOf も試す
  return `bb-scheduleTable__head" scope="row">${jaNeedle}`
}

function enumerateScopedBlocksByThRegex(html: string, ymd: string): string[] {
  const jaNeedle = jaNeedleFromYmd(ymd)
  const hits: { start: number; len: number }[] = []
  const re = new RegExp(SCHEDULE_DAY_HEAD_TH_RE.source, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const inner = m[1] ?? ""
    const text = stripHtmlToText(inner)
    if (!text.includes(jaNeedle)) continue
    if (typeof m.index !== "number") continue
    hits.push({ start: m.index, len: m[0]?.length ?? 0 })
  }
  if (hits.length === 0) return []

  const blocks: string[] = []
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i]!
    const next = hits[i + 1]
    const afterStart = cur.start + Math.max(1, cur.len)
    const tbodyEnd = html.indexOf("</tbody>", afterStart)
    const endExclusive =
      typeof next?.start === "number" && next.start > cur.start
        ? next.start
        : tbodyEnd >= 0
          ? tbodyEnd
          : html.length
    const scoped = sliceScheduleDayBlockAt(html, cur.start, endExclusive)
    if (scoped) blocks.push(scoped)
  }
  return blocks
}

/**
 * 修正A: 同一日付の見出しを rowspan 1〜12 および rowspan 無しですべて列挙し、
 * それぞれの scoped ブロックを返す（セ・パ別テーブルで見出しが複数ある日に対応）。
 */
export function enumerateScopedBlocksForDate(html: string, ymd: string): string[] {
  const jaNeedle = jaNeedleFromYmd(ymd)
  // まずは regex で `<th class="...bb-scheduleTable__head..." scope="row">` を探す（属性順変更に強い）
  const byRegex = enumerateScopedBlocksByThRegex(html, ymd)
  const blocks: string[] = [...byRegex]
  const seenStarts = new Set<number>(byRegex.map((b) => html.indexOf(b)).filter((x) => x >= 0))

  const needles: string[] = [
    ...SCHEDULE_ROWSPAN_CANDIDATES.map((r) => dayThNeedleForRowspan(jaNeedle, r)),
    dayThNeedleWithoutRowspan(jaNeedle),
  ]

  for (const needle of needles) {
    let from = 0
    while (from < html.length) {
      const start = html.indexOf(needle, from)
      if (start < 0) break
      if (!seenStarts.has(start)) {
        seenStarts.add(start)
        const afterStart = start + needle.length
        const nextDayHead = html.indexOf("bb-scheduleTable__head", afterStart)
        const tbodyEnd = html.indexOf("</tbody>", afterStart)
        const endExclusive =
          nextDayHead >= 0 ? nextDayHead : tbodyEnd >= 0 ? tbodyEnd : html.length
        const scoped = sliceScheduleDayBlockAt(html, start, endExclusive)
        if (scoped) blocks.push(scoped)
      }
      from = start + needle.length
    }
  }

  const titleNeedle = `bb-head01__title">${jaNeedle}`
  const tStart = html.indexOf(titleNeedle)
  if (tStart >= 0) {
    const tNext = html.indexOf(`bb-head01__title">`, tStart + titleNeedle.length)
    const scoped = tNext >= 0 ? html.slice(tStart, tNext) : html.slice(tStart)
    if (scoped) blocks.push(scoped)
  }

  return blocks
}

/**
 * 後方互換: 修正Aのロジックで最も試合数が多い単一 scoped を返す（デバッグ用）。
 */
export function scopeScheduleHtmlForDate(html: string, ymd: string): string {
  const jaNeedle = jaNeedleFromYmd(ymd)
  const blocks = enumerateScopedBlocksForDate(html, ymd)
  let best = ""
  let bestCount = -1
  for (const scoped of blocks) {
    if (isNoGameScheduleDay(scoped, jaNeedle)) continue
    const n = extractGamesFromScopedHtml(scoped).length
    if (n > bestCount) {
      bestCount = n
      best = scoped
    }
  }
  return best
}

/**
 * 当日ブロックが「試合はありません」か。
 * rowspan で翌日分の game リンクまで scoped に含まれても、
 * 当日ラベル〜最初の game リンク手前までに「試合はありません」があれば休養日。
 */
export function isNoGameScheduleDay(scoped: string, jaNeedle: string): boolean {
  const dayIdx = scoped.indexOf(jaNeedle)
  if (dayIdx < 0) return false
  const gameLinkIdx = scoped.search(/href="\/npb\/game\/\d+\/index"/)
  const dayBlock =
    gameLinkIdx < 0 ? scoped.slice(dayIdx) : scoped.slice(dayIdx, gameLinkIdx)
  return /試合はありません/.test(dayBlock)
}

export function extractGamesFromScopedHtml(scoped: string): ScheduleGameEntry[] {
  const games: ScheduleGameEntry[] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let trm: RegExpExecArray | null
  while ((trm = trRe.exec(scoped))) {
    const row = trm[1] ?? ""
    const gidM = row.match(/href="\/npb\/game\/(\d+)\/index"/)
    if (!gidM) continue
    const gameId = gidM[1]!.trim()
    if (!gameId) continue

    let stadiumRaw = ""
    const stTd = row.match(
      /<td[^>]*\bclass="[^"]*bb-scheduleTable__stadium[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
    )
    if (stTd) {
      stadiumRaw = stTd[1] ?? ""
    } else {
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      for (const td of tds) {
        const inner = td[1] ?? ""
        if (inner.includes("/npb/game/") || inner.includes("/npb/teams/")) continue
        const text = stripHtmlToText(inner)
        if (!text || text.length > 48) continue
        if (/^\d+\s*-\s*\d+$/.test(text)) continue
        if (/^(予|勝|敗|Ｓ)/.test(text)) continue
        stadiumRaw = inner
        break
      }
    }

    games.push({
      gameId,
      stadiumName: normalizeStadiumNameFromSchedule(stadiumRaw),
    })
  }
  return games
}

export function dedupeScheduleGamesById(games: ScheduleGameEntry[]): ScheduleGameEntry[] {
  const byId = new Map<string, ScheduleGameEntry>()
  for (const g of games) {
    const prev = byId.get(g.gameId)
    if (!prev) {
      byId.set(g.gameId, g)
      continue
    }
    const prevStadium = prev.stadiumName && prev.stadiumName !== "未設定"
    const nextStadium = g.stadiumName && g.stadiumName !== "未設定"
    if (!prevStadium && nextStadium) byId.set(g.gameId, g)
  }
  return [...byId.values()].sort((a, b) => a.gameId.localeCompare(b.gameId))
}

/**
 * 交流戦ページ（`/npb/schedule/first/inter`）などでは、上部に「当日の6試合」カード一覧（bb-score）がある。
 * 日程テーブルのスコープが崩れて 7件以上になる場合のセーフティとして、ここから gameId を抽出する。
 */
export function extractGamesFromScoreListHtml(html: string): ScheduleGameEntry[] {
  const out: ScheduleGameEntry[] = []
  const aRe = /<a\b[^>]*\bclass="[^"]*\bbb-score__content\b[^"]*"[^>]*\bhref="\/npb\/game\/(\d+)\/index"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = aRe.exec(html))) {
    const gameId = (m[1] ?? "").trim()
    if (!gameId) continue
    const inner = m[2] ?? ""
    const venueM = inner.match(/<span\b[^>]*\bclass="[^"]*\bbb-score__venue\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    const stadiumName = normalizeStadiumNameFromSchedule(venueM ? venueM[1] ?? "" : "")
    out.push({ gameId, stadiumName })
  }
  return dedupeScheduleGamesById(out)
}

/**
 * 修正A: 全 rowspan 候補・同一日の複数見出しから有効ブロックを集め、
 * 和集合が 1〜6 件なら採用。7件以上なら単一ブロックの最多を採用。
 */
export function pickBestScheduleGamesForDate(html: string, ymd: string): ScheduleGameEntry[] {
  const jaNeedle = jaNeedleFromYmd(ymd)
  const blocks = enumerateScopedBlocksForDate(html, ymd)
  if (blocks.length === 0) return []

  const unionPieces: ScheduleGameEntry[] = []
  let bestSingle: ScheduleGameEntry[] = []

  for (const scoped of blocks) {
    if (isNoGameScheduleDay(scoped, jaNeedle)) continue
    const hasGameLink = /href="\/npb\/game\/\d+\/index"/.test(scoped)
    if (!hasGameLink && /試合はありません/.test(scoped)) continue

    const fromBlock = extractGamesFromScopedHtml(scoped)
    unionPieces.push(...fromBlock)
    if (fromBlock.length > bestSingle.length) bestSingle = fromBlock
  }

  const union = dedupeScheduleGamesById(unionPieces)
  if (union.length > 0 && union.length <= SCHEDULE_MAX_GAMES_PER_DAY) {
    return union
  }
  if (union.length > SCHEDULE_MAX_GAMES_PER_DAY) {
    // セーフティ: bb-score（当日カード一覧）から拾えるならそれを優先（通常6件）。
    const fromScore = extractGamesFromScoreListHtml(html)
    if (fromScore.length > 0 && fromScore.length <= SCHEDULE_MAX_GAMES_PER_DAY) return fromScore
    return dedupeScheduleGamesById(bestSingle)
  }
  return []
}

export function extractGamesFromScheduleHtml(html: string, ymd: string): ScheduleGameEntry[] {
  const picked = pickBestScheduleGamesForDate(html, ymd)
  if (picked.length > 0) return picked
  const fromScore = extractGamesFromScoreListHtml(html)
  if (fromScore.length > 0 && fromScore.length <= SCHEDULE_MAX_GAMES_PER_DAY) return fromScore
  return picked
}

export function extractGameIdsFromScheduleHtml(html: string, ymd: string): string[] {
  return extractGamesFromScheduleHtml(html, ymd).map((g) => g.gameId)
}
