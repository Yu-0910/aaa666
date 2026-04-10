/**
 * Phase 12: Phase 11 の計算済みJSONから、ランキングページが読む静的JSONを生成する。
 * 行のキーは `config/metric_map.json` に合わせ、2025年ランキングJSONと同じ参照形（row.ops 等）にする。
 *
 * 実行:
 *   npx tsx scripts/phase12_build_rankings_from_phase11.ts --year 2026
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { BattingLine, CanonicalGameDocument, LineupPlayer } from "../lib/yahooGame/types"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import { loadMetricsFromRecord } from "../lib/ranking/record"
import { getJsonKey } from "../lib/ranking/metricMap"
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

type Phase11BattingFile = {
  schemaVersion?: string
  seasonYear?: string
  yahooBatterId?: string
  rows?: SeasonStatsRow[]
}

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

function loadCanonicalDocs(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
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

/** 名簿の正式チーム名（CSVと同一）→ ランキング表示の略称（RankingUI の teamColors と整合） */
const CSV_TEAM_TO_RANKING_SHORT: Record<string, string> = {
  中日ドラゴンズ: "中日",
  広島東洋カープ: "広島",
  東京ヤクルトスワローズ: "ヤクルト",
  読売ジャイアンツ: "巨人",
  阪神タイガース: "阪神",
  横浜DeNAベイスターズ: "DeNA",
  オリックス・バファローズ: "オリックス",
  千葉ロッテマリーンズ: "ロッテ",
  北海道日本ハムファイターズ: "日本ハム",
  東北楽天ゴールデンイーグルス: "楽天",
  埼玉西武ライオンズ: "西武",
  福岡ソフトバンクホークス: "ソフトバンク",
}

function rosterTeamToRankingShort(fullTeam: string): string {
  const t = String(fullTeam ?? "").trim()
  return CSV_TEAM_TO_RANKING_SHORT[t] ?? t
}

/** candidate の方が表示用氏名として望ましいなら true（略称→フルネーム、苗字のみ→姓名など） */
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

/**
 * スタメン → domain.battingLines（出場成績・フルネーム優先）→ yahooPlayersMentioned（未登録のみ）
 */
function yahooMetaFromCanonical(docs: CanonicalGameDocument[]): Map<string, { name: string; team: string }> {
  const map = new Map<string, { name: string; team: string }>()
  for (const doc of docs) {
    for (const team of doc.game.teams ?? []) {
      const teamName = String(team.teamName ?? "").trim()
      for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
        const id = String(p.yahooPlayerId ?? "").trim()
        const name = String(p.playerName ?? "").trim()
        if (!id || !name || !teamName) continue
        if (!map.has(id)) map.set(id, { name, team: teamName })
      }
    }

    for (const bl of doc.domain.battingLines ?? []) {
      const line = bl as BattingLine
      const id = String(line.yahooPlayerId ?? "").trim()
      if (!id) continue
      const pn = String(line.playerName ?? "").trim()
      if (!pn) continue
      const cur = map.get(id)
      const lineupTeam = teamForYahooId(doc, id)
      if (!cur) {
        map.set(id, { name: pn, team: lineupTeam })
      } else {
        map.set(id, {
          name: pickPlayerName(cur.name, pn),
          team: cur.team || lineupTeam,
        })
      }
    }

    const mentioned = doc.game.yahooPlayersMentioned ?? {}
    for (const [id, nm] of Object.entries(mentioned)) {
      const yid = String(id).trim()
      if (!yid || map.has(yid)) continue
      const name = String(nm ?? "").trim()
      if (!name) continue
      map.set(yid, { name, team: teamForYahooId(doc, yid) })
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

/**
 * 英字名: 名簿の略式（name_en_short 等）を優先し、無ければマスタ打撃CSV（getRomanNameMap）から照合。
 */
function resolveRomanName(
  yahooId: string,
  nameJa: string,
  teamShort: string,
  romanMap: Record<string, string>,
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

function loadPhase11BattingRows(year: string): Array<{ yahooId: string; row: SeasonStatsRow }> {
  const dir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
  const out: Array<{ yahooId: string; row: SeasonStatsRow }> = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const data = JSON.parse(readFileSync(p, "utf8")) as Phase11BattingFile
      const yahooId = String(data.yahooBatterId ?? "").trim()
      const row = Array.isArray(data.rows) ? data.rows[0] : undefined
      if (!yahooId || !row) continue
      out.push({ yahooId, row })
    } catch {
      // ignore
    }
  }
  return out
}

function numFromSlash(s: string): number {
  const v = String(s ?? "").trim()
  if (!v) return 0
  const n = parseFloat(v.startsWith(".") ? `0${v}` : v)
  return Number.isFinite(n) ? n : 0
}

function numFromLoose(s: string): number {
  const v = String(s ?? "").trim()
  if (!v) return 0
  const n = parseFloat(v.replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** 2025 JSON と同じキーで 1 行分のベースオブジェクトを作る（指標列は metric.key で参照される） */
function buildRankingRowBase(
  yahooId: string,
  sr: SeasonStatsRow,
  meta: { name: string; team: string },
  romanName?: string,
): Record<string, unknown> {
  const name = meta.name.trim() || yahooId
  const team = meta.team.trim()
  const base: Record<string, unknown> = {
    playerId: yahooId,
    player: name,
    name,
    team,
    metric: "OPS",
    age: 0,
    ops: numFromSlash(sr.ops),
    avg: numFromSlash(sr.avg),
    hits: sr.h,
    hr: sr.hr,
    rbi: sr.rbi,
    games: sr.g,
    pa: sr.pa,
    ab: sr.ab,
    singles: sr.h1,
    doubles: sr.h2,
    triples: sr.h3,
    runs: sr.r,
    obp: numFromSlash(sr.obp),
    slg: numFromSlash(sr.slg),
    bb: sr.bb,
    ibb: sr.ibb,
    hbp: sr.hbp,
    so: sr.so,
    tb: sr.tb,
    sb: sr.sb,
    cs: sr.cs,
    sh: sr.sh,
    sf: sr.sf,
    gidp: sr.gidp,
    isop: numFromSlash(sr.isop),
    isod: numFromSlash(sr.isod),
    bbPct: numFromSlash(sr.bb_pct),
    kPct: numFromSlash(sr.k_pct),
    bbk: numFromLoose(sr.bbk),
    rc: numFromLoose(sr.rc),
    xr: numFromLoose(sr.xr),
    babip: numFromSlash(sr.babip),
    seca: numFromLoose(sr.seca),
    ta: numFromLoose(sr.ta),
    noi: numFromLoose(sr.noi),
    gpa: numFromLoose(sr.gpa),
  }
  if (romanName) base.romanName = romanName
  return base
}

function sortValueForMetricKey(metricKey: string, row: Record<string, unknown>): number {
  const v = row[metricKey]
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()

  const docs = loadCanonicalDocs()
  const metaMap = yahooMetaFromCanonical(docs)
  const batting = loadPhase11BattingRows(year)
  if (batting.length === 0) {
    console.error(`[phase12] no phase11 batting files under _data/derived/player_season_batting/${year}/`)
    process.exit(1)
  }

  const metrics = loadMetricsFromRecord()
  const baseOut = join(projectRoot, "public", "data", "rankings", year)
  const outDir = join(baseOut, "CL")
  mkdirSync(outDir, { recursive: true })

  const romanMap = getRomanNameMap(year, "CL")

  for (const m of metrics) {
    const metricKey = getJsonKey(m.label)
    const rows: Record<string, unknown>[] = batting.map(({ yahooId, row }) => {
      const meta = metaMap.get(yahooId) ?? { name: yahooId, team: "" }
      const roman = resolveRomanName(yahooId, meta.name, meta.team, romanMap)
      const base = buildRankingRowBase(yahooId, row, meta, roman)
      base.metric = m.label
      return base
    })

    const sorted = [...rows].sort((a, b) => sortValueForMetricKey(metricKey, b) - sortValueForMetricKey(metricKey, a))

    const ranked = sorted.map((raw, idx) => ({
      rank: idx + 1,
      ...raw,
    }))

    const fileBase = sanitizeMetricForPath(m.label)
    writeFileSync(join(outDir, `${fileBase}.json`), JSON.stringify(ranked, null, 2), "utf8")
    writeFileSync(join(outDir, `${fileBase}_all.json`), JSON.stringify(ranked, null, 2), "utf8")
  }

  console.log(`[phase12] wrote CL rankings (${metrics.length} metrics) → ${outDir}`)
}

main()
