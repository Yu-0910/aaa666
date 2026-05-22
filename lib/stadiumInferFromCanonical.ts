import fs from "fs"
import path from "path"
import {
  isUnsetStadiumSplitValue,
  normalizeStadiumSplitValue,
  teamHomeStadiumCanonical,
} from "@/lib/stadiumVenueNormalize"

/** 日程に載らない試合向け: 指定日・対戦は地方球場（2026 シーズン運用ルール） */
const REGIONAL_SERIES: Array<{
  dateJst: string
  teams: [string, string]
}> = [
  { dateJst: "2026-05-12", teams: ["巨人", "広島"] },
  { dateJst: "2026-05-13", teams: ["巨人", "広島"] },
  { dateJst: "2026-05-19", teams: ["ヤクルト", "巨人"] },
]

export type ParsedCanonicalMatchup = {
  dateJst: string
  /** タイトル表記の vs 左（後攻＝裏の攻撃側） */
  teamLeft: string
  teamRight: string
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** フルネーム・略称から 12 球団短名へ */
export function normalizeTeamShort(raw: string): string | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  if (/巨人|ジャイアンツ|読売/.test(s)) return "巨人"
  if (/広島|カープ/.test(s)) return "広島"
  if (/阪神|タイガース/.test(s)) return "阪神"
  if (/中日|ドラゴンズ/.test(s)) return "中日"
  if (/ヤクルト|スワローズ/.test(s)) return "ヤクルト"
  if (/DeNA|ベイスターズ|横浜/.test(s)) return "横浜"
  if (/オリックス|バファローズ/.test(s)) return "オリックス"
  if (/ソフトバンク|ホークス/.test(s)) return "ソフトバンク"
  if (/楽天|イーグルス/.test(s)) return "楽天"
  if (/西武|ライオンズ/.test(s)) return "西武"
  if (/ロッテ|マリーンズ/.test(s)) return "ロッテ"
  if (/日本ハム|ファイターズ/.test(s)) return "日本ハム"
  return null
}

/** canonical の ogTitle / documentTitle から日付と対戦を抽出 */
export function parseCanonicalMatchup(doc: {
  game?: { meta?: { documentTitle?: string; ogTitle?: string } }
}): ParsedCanonicalMatchup | null {
  const title =
    String(doc.game?.meta?.ogTitle ?? "").trim() ||
    String(doc.game?.meta?.documentTitle ?? "").trim()
  if (!title) return null

  const m = title.match(
    /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s+(.+?)\s*vs\.?\s*(.+?)(?:\s+試合|\s+-|$)/i,
  )
  if (!m) return null

  const teamLeft = normalizeTeamShort(m[4] ?? "")
  const teamRight = normalizeTeamShort(m[5] ?? "")
  if (!teamLeft || !teamRight) return null

  return {
    dateJst: `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`,
    teamLeft,
    teamRight,
  }
}

function isRegionalSeries(dateJst: string, teamLeft: string, teamRight: string): boolean {
  const pair = new Set([teamLeft, teamRight])
  return REGIONAL_SERIES.some(
    (r) =>
      r.dateJst === dateJst &&
      pair.has(r.teams[0]) &&
      pair.has(r.teams[1]),
  )
}

type CanonicalDocForStadium = Parameters<typeof parseCanonicalMatchup>[0] & {
  game?: {
    textPlayByPlay?: Array<{ lines?: string[] }>
  }
}

/** 試合前情報の「先攻 / 後攻」からホーム（後攻）の球団短名を推定 */
export function inferHomeTeamShortFromCanonical(
  doc: CanonicalDocForStadium,
): string | null {
  for (const section of doc.game?.textPlayByPlay ?? []) {
    const text = (section.lines ?? []).join(" ")
    if (!text) continue
    const m = text.match(/後攻[:：]\s*([^の]+?)(?:のスターティング|のスタメン|の)/)
    if (m) {
      const team = normalizeTeamShort(m[1] ?? "")
      if (team) return team
    }
  }
  return null
}

/**
 * 日程に球場が無い canonical 向け。
 * - 指定日の巨人–広島・ヤクルト–巨人 → 地方球場
 * - ホーム球団: 試合前情報の後攻 → 無ければタイトル vs 左（従来フォールバック）
 */
export function inferStadiumFromCanonicalMatchup(
  matchup: ParsedCanonicalMatchup,
  options?: { homeTeamShort?: string | null },
): string | null {
  const { dateJst, teamLeft, teamRight } = matchup
  if (isRegionalSeries(dateJst, teamLeft, teamRight)) return "地方球場"
  const homeTeam = (options?.homeTeamShort ?? "").trim() || teamLeft
  const home = teamHomeStadiumCanonical(homeTeam)
  return home ? normalizeStadiumSplitValue(home) : null
}

function inferStadiumFromCanonicalDoc(doc: CanonicalDocForStadium): string | null {
  const matchup = parseCanonicalMatchup(doc)
  if (!matchup) return null
  const homeTeamShort = inferHomeTeamShortFromCanonical(doc)
  return inferStadiumFromCanonicalMatchup(matchup, { homeTeamShort })
}

function needsCanonicalStadiumRepair(existing: string | undefined): boolean {
  if (!existing) return true
  return isUnsetStadiumSplitValue(existing)
}

/**
 * canonical から gameId→球場を補完する。
 * - map に無い gameId
 * - 既存が「未設定」の gameId（日程ブロック日の取りこぼし修復）
 */
export function enrichStadiumMapFromCanonicalFallback(
  stadiumByGameId: Map<string, string>,
  canonicalDir: string,
): number {
  if (!fs.existsSync(canonicalDir)) return 0
  let updated = 0
  for (const f of fs.readdirSync(canonicalDir)) {
    if (!f.endsWith(".json")) continue
    const gameId = f.replace(/\.json$/, "")
    if (!gameId || !needsCanonicalStadiumRepair(stadiumByGameId.get(gameId))) continue
    let doc: CanonicalDocForStadium
    try {
      doc = JSON.parse(fs.readFileSync(path.join(canonicalDir, f), "utf8")) as CanonicalDocForStadium
    } catch {
      continue
    }
    const stadium = inferStadiumFromCanonicalDoc(doc)
    if (!stadium || isUnsetStadiumSplitValue(stadium)) continue
    stadiumByGameId.set(gameId, stadium)
    updated++
  }
  return updated
}
