/**
 * Phase 12: canonical から打撃ランキング用静的 JSON を生成する。
 * 集計は `lib/yahooGame/canonicalBattingSeasonAgg.ts` を利用（phase11 の個人 JSON ファイルは不要）。
 *
 * 注意:
 * - 一球ログ（plateAppearances）のみで集計すると、復元テキストの表記ゆれ等で AB/BB がズレることがある。
 * - 既定（`TOPPAGE_BATTING_SEASON_AGG` 未設定）: ハイブリッド（出場行の H/AB 優先）。
 * - **`TOPPAGE_BATTING_SEASON_AGG=appearance_slots`**: 出場末尾列のみから積み上げ（計画:
 *   `docs/plan_ranking_profile_appearance_slots_only_phases.md`）。
 *
 * 実行:
 *   npx tsx scripts/phase12_build_rankings_from_phase11.ts --year 2026
 */

import { mkdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { BattingLine, CanonicalGameDocument, LineupPlayer } from "../lib/yahooGame/types"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
import {
  aggregateBattingSeasonForProfilesAndRankings,
  buildEnrichedBattingSeasonRow,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  CSV_TEAM_TO_RANKING_SHORT,
  leagueBucketForTeamShort,
} from "../lib/yahooGame/canonicalPitchingSeasonAgg"
import { aggregateSeasonTeamGamesFromCanonical } from "../lib/yahooGame/aggregateTeamGamesFromCanonical"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { writeSeasonTeamGamesFromAggregate } from "../lib/ranking/teamGamesJson"
import {
  assignRanks,
  filterBattingRowsForQualifyingAtBuild,
} from "../lib/ranking/filterRankingsByQualifyingAtBuild"
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

function teamForYahooId(doc: CanonicalGameDocument, yahooId: string): string {
  for (const team of doc.game.teams ?? []) {
    const teamName = String(team.teamName ?? "").trim()
    for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
      if (String(p.yahooPlayerId ?? "").trim() === yahooId) return teamName
    }
  }
  return ""
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
 * canonical 由来の meta が無い・氏名が Yahoo ID のまま等のとき、NPB 名簿で補完する。
 * （例: 投手の代打のみ plateAppearances に載り battingLines / yahooPlayersMentioned に出てこない）
 */
function metaForRankingRow(
  yahooId: string,
  metaMap: Map<string, { name: string; team: string }>,
): { name: string; team: string } {
  const cur = metaMap.get(yahooId)
  const nameTrim = (cur?.name ?? "").trim()
  const teamTrim = (cur?.team ?? "").trim()
  const badName = !nameTrim || nameTrim === yahooId
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.name_ja) {
    const teamFromRoster = rosterTeamToRankingShort(roster.team)
    if (badName || !teamTrim) {
      return {
        name: roster.name_ja.trim(),
        team: teamTrim || teamFromRoster,
      }
    }
  }
  return cur ?? { name: yahooId, team: "" }
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

function computeObpFromCounts(h: number, bb: number, hbp: number, ab: number, sf: number): number | null {
  const den = ab + bb + hbp + sf
  if (den <= 0) return null
  return (h + bb + hbp) / den
}

function computeSlgFromCounts(tb: number, ab: number): number | null {
  if (ab <= 0) return null
  return tb / ab
}

function computeNoiFromCounts(h: number, bb: number, hbp: number, ab: number, sf: number, tb: number): number | null {
  const obp = computeObpFromCounts(h, bb, hbp, ab, sf)
  const slg = computeSlgFromCounts(tb, ab)
  if (obp == null || slg == null) return null
  return (obp + slg / 3) * 1000
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
  const h = sr.h
  const bb = sr.bb
  const hbp = sr.hbp
  const ab = sr.ab
  const sf = sr.sf
  const tb = sr.tb
  const obpRaw = computeObpFromCounts(h, bb, hbp, ab, sf)
  const slgRaw = computeSlgFromCounts(tb, ab)
  const noiRaw = computeNoiFromCounts(h, bb, hbp, ab, sf, tb)
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
    // 注意: OBP/SLG/NOI は表示用の丸め文字列（sr.obp/sr.slg/sr.noi）を信用せず、
    // 元カウントから未丸めで再計算した実数を JSON に格納する（表示側でのみ丸める）。
    obp: obpRaw,
    slg: slgRaw,
    bb: sr.bb,
    ibb: sr.ibb,
    hbp: sr.hbp,
    so: sr.so,
    tb: sr.tb,
    sb: sr.sb,
    cs: sr.cs,
    e: sr.e,
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
    noi: noiRaw,
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

/**
 * Phase 1 準拠: 名簿（所属）を主に CL/PL を決める。決められなければ null（両リーグに載せない）。
 * @see docs/ranking_league_resolution_spec_2026.md
 */
function resolveBattingRankingLeagueBucket(
  yahooId: string,
  meta: { name: string; team: string } | undefined,
): "CL" | "PL" | null {
  const roster = findRosterPlayerByPublicId(yahooId)
  if (roster?.team) {
    const short = rosterTeamToRankingShort(roster.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  const m = meta ?? { name: "", team: "" }
  if (m.team.trim()) {
    const short = rosterTeamToRankingShort(m.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  const byJa = findRosterPlayerByPublicIdOrJaName(yahooId, m.name)
  if (byJa?.team) {
    const short = rosterTeamToRankingShort(byJa.team).trim()
    if (short) return leagueBucketForTeamShort(short)
  }
  return null
}

function main(): void {
  process.chdir(projectRoot)
  const { year } = parseArgs()

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  if (docs.length === 0) {
    console.error("[phase12] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const teamGamesByLeague = aggregateSeasonTeamGamesFromCanonical(docs, year)
  writeSeasonTeamGamesFromAggregate(projectRoot, year, teamGamesByLeague)
  console.log(
    `[phase12] team-games.json (canonical): CL=${JSON.stringify(teamGamesByLeague.CL)} PL=${JSON.stringify(teamGamesByLeague.PL)}`
  )

  const metaMap = yahooMetaFromCanonical(docs)
  const byBatter = aggregateBattingSeasonForProfilesAndRankings(docs)
  if (byBatter.size === 0) {
    let paRows = 0
    for (const d of docs) {
      paRows += d.domain?.plateAppearances?.length ?? 0
    }
    console.error(
      "[phase12] domain.plateAppearances から打撃ランキングを集計できません（yahooBatterId 付き打席が 0）。",
    )
    console.error(
      `  試合数: ${docs.length}, plateAppearance 行数の合計: ${paRows}`,
    )
    console.error(
      "  対処: 一球ログで domain.plateAppearances を埋めてから再実行（phase10:yahoo:restore / phase10:yahoo:merge または phase4:merge:phase10）。",
    )
    process.exit(1)
  }
  const batting: Array<{ yahooId: string; row: SeasonStatsRow }> = [...byBatter.entries()].map(
    ([yahooId, agg]) => ({
      yahooId,
      row: buildEnrichedBattingSeasonRow(agg),
    }),
  )

  const metrics = loadMetricsFromRecord()
  const baseOut = join(projectRoot, "public", "data", "rankings", year)
  const romanMapCL = getRomanNameMap(year, "CL")
  const romanMapPL = getRomanNameMap(year, "PL")

  let excluded = 0
  const battingCL: typeof batting = []
  const battingPL: typeof batting = []
  for (const b of batting) {
    const bucket = resolveBattingRankingLeagueBucket(b.yahooId, metaMap.get(b.yahooId))
    if (bucket === "CL") battingCL.push(b)
    else if (bucket === "PL") battingPL.push(b)
    else excluded += 1
  }

  for (const lg of ["CL", "PL"] as const) {
    const outDir = join(baseOut, lg)
    mkdirSync(outDir, { recursive: true })
    const list = lg === "CL" ? battingCL : battingPL
    const romanMap = lg === "CL" ? romanMapCL : romanMapPL

    for (const m of metrics) {
      const metricKey = getJsonKey(m.label)
      const rows: Record<string, unknown>[] = list.map(({ yahooId, row }) => {
        const meta = metaForRankingRow(yahooId, metaMap)
        const roman = resolveRomanName(yahooId, meta.name, meta.team, romanMap)
        const base = buildRankingRowBase(yahooId, row, meta, roman)
        base.metric = m.label
        return base
      })

      const sorted = [...rows].sort((a, b) => sortValueForMetricKey(metricKey, b) - sortValueForMetricKey(metricKey, a))
      const rankedAll = assignRanks(sorted)
      const teamGames = teamGamesByLeague[lg]
      const filtered = filterBattingRowsForQualifyingAtBuild(sorted, metricKey, year, lg, teamGames)
      const rankedPublic = assignRanks(filtered)

      const fileBase = sanitizeMetricForPath(m.label)
      writeFileSync(join(outDir, `${fileBase}.json`), JSON.stringify(rankedPublic, null, 2), "utf8")
      writeFileSync(join(outDir, `${fileBase}_all.json`), JSON.stringify(rankedAll, null, 2), "utf8")
    }

    console.log(`[phase12] wrote ${lg} rankings (${metrics.length} metrics, ${list.length} batters) → ${outDir}`)
  }

  if (excluded > 0) {
    console.warn(`[phase12] excluded ${excluded} batters (league unresolved; docs/ranking_league_resolution_spec_2026.md)`)
  }

}

main()
