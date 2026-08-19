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

import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { BattingLine, CanonicalGameDocument, LineupPlayer } from "../lib/yahooGame/types"
import type { SeasonStatsRow } from "../lib/seasonStatsPilot"
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
  buildBattingRankingRowBase,
  sortValueForBattingMetricKey,
} from "../lib/ranking/battingRankingRowFromSeasonStats"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"
import {
  findRosterPlayerByPublicId,
  findRosterPlayerByPublicIdOrJaName,
  rosterEnglishShortForRanking,
} from "../lib/npbRoster"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; onlyYahooIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let onlyYahooIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, onlyYahooIds }
}

function rosterTeamToRankingShort(fullTeam: string): string {
  const t = String(fullTeam ?? "").trim()
  return CSV_TEAM_TO_RANKING_SHORT[t] ?? t
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
    return {
      name: badName ? roster.name_ja.trim() : nameTrim,
      team: teamFromRoster || teamTrim,
    }
  }
  return cur ?? { name: yahooId, team: "" }
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

type Phase11DerivedPayload = {
  yahooBatterId?: string
  rows?: SeasonStatsRow[]
}

function loadBattingRowsFromPhase11(
  year: string,
  onlyYahooIds?: readonly string[] | null
): Array<{ yahooId: string; row: SeasonStatsRow }> {
  const dir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  if (!existsSync(dir)) return []
  const out: Array<{ yahooId: string; row: SeasonStatsRow }> = []
  const targetIds = onlyYahooIds?.length
    ? [...new Set(onlyYahooIds.map((v) => String(v).trim()).filter(Boolean))].sort()
    : null
  const files = targetIds
    ? targetIds.map((yahooId) => `yahoo_${yahooId}.json`)
    : readdirSync(dir).filter((file) => /^yahoo_.+\.json$/.test(file))
  for (const file of files) {
    const yahooId = file.replace(/^yahoo_/, "").replace(/\.json$/, "")
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as Phase11DerivedPayload
      const row = Array.isArray(raw.rows)
        ? raw.rows.find((r) => r?.split_type === "total" && r?.split_value === "total") ?? raw.rows[0]
        : null
      if (!row) continue
      out.push({
        yahooId: String(raw.yahooBatterId ?? yahooId).trim() || yahooId,
        row,
      })
    } catch {
      // ignore malformed file
    }
  }
  return out
}

function readRankingRows(filePath: string): Record<string, unknown>[] | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown
    return Array.isArray(raw) ? raw.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : null
  } catch {
    return null
  }
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
  const { year, onlyYahooIds } = parseArgs()
  const affectedYahooIds =
    onlyYahooIds && onlyYahooIds.length > 0
      ? [...new Set(onlyYahooIds.map((v) => String(v).trim()).filter(Boolean))]
      : null
  const affectedYahooIdSet = affectedYahooIds ? new Set(affectedYahooIds) : null

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })
  if (docs.length === 0) {
    console.error("[phase12] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const teamGamesByLeague = aggregateSeasonTeamGamesFromCanonical(docs, year)
  writeSeasonTeamGamesFromAggregate(projectRoot, year, teamGamesByLeague)
  console.log(
    `[phase12] team-games.json (canonical): CL=${JSON.stringify(teamGamesByLeague.CL)} PL=${JSON.stringify(teamGamesByLeague.PL)}`
  )

  const metaMap = new Map<string, { name: string; team: string }>()
  for (const doc of docs) {
    for (const team of doc.game.teams ?? []) {
      const teamName = String(team.teamName ?? "").trim()
      for (const p of (team.startingLineup ?? []) as LineupPlayer[]) {
        const id = String(p.yahooPlayerId ?? "").trim()
        const name = String(p.playerName ?? "").trim()
        if (!id || !name) continue
        const cur = metaMap.get(id)
        metaMap.set(id, {
          name: cur ? pickPlayerName(cur.name, name) : name,
          team: cur?.team || teamName,
        })
      }
    }
    for (const bl of doc.domain.battingLines ?? []) {
      const line = bl as BattingLine
      const id = String(line.yahooPlayerId ?? "").trim()
      const name = String(line.playerName ?? "").trim()
      if (!id || !name) continue
      const cur = metaMap.get(id)
      const lineTeam = String(line.teamName ?? "").trim()
      const lineupTeam = teamForYahooId(doc, id) || lineTeam
      metaMap.set(id, {
        name: cur ? pickPlayerName(cur.name, name) : name,
        team: cur?.team || lineupTeam,
      })
    }
    for (const [idRaw, nameRaw] of Object.entries(doc.game.yahooPlayersMentioned ?? {})) {
      const id = String(idRaw).trim()
      if (!id || metaMap.has(id)) continue
      const name = String(nameRaw ?? "").trim()
      if (!name) continue
      metaMap.set(id, { name, team: teamForYahooId(doc, id) })
    }
  }
  const batting = loadBattingRowsFromPhase11(year, affectedYahooIds)
  if (batting.length === 0) {
    if (affectedYahooIds) {
      console.log(`[phase12] no affected phase11 batting rows for ${affectedYahooIds.length} target ids; nothing to update`)
      return
    }
    console.error(`[phase12] no phase11 derived batting files under _data/derived/player_season_batting/${year}`)
    console.error("  run: npm run phase11:build:batting")
    process.exit(1)
  }

  const metrics = loadMetricsFromRecord()
  const baseOut = join(projectRoot, "public", "data", "rankings", year)
  const romanMapCL = getRomanNameMap(year, "CL")
  const romanMapPL = getRomanNameMap(year, "PL")

  let excluded = 0
  const excludedDetails: string[] = []
  const battingCL: typeof batting = []
  const battingPL: typeof batting = []
  for (const b of batting) {
    const meta = metaMap.get(b.yahooId)
    const bucket = resolveBattingRankingLeagueBucket(b.yahooId, meta)
    if (bucket === "CL") battingCL.push(b)
    else if (bucket === "PL") battingPL.push(b)
    else {
      excluded += 1
      excludedDetails.push(
        `${b.yahooId}:${meta?.name || "-"}:${meta?.team || "-"}`,
      )
    }
  }

  for (const lg of ["CL", "PL"] as const) {
    const outDir = join(baseOut, lg)
    mkdirSync(outDir, { recursive: true })
    const list = lg === "CL" ? battingCL : battingPL
    const romanMap = lg === "CL" ? romanMapCL : romanMapPL
    const incremental = Boolean(affectedYahooIdSet && affectedYahooIdSet.size > 0)
    const affectedRowsBase = list.map(({ yahooId, row }) => {
      const meta = metaForRankingRow(yahooId, metaMap)
      const roman = resolveRomanName(yahooId, meta.name, meta.team, romanMap)
      return buildBattingRankingRowBase(yahooId, row, meta, roman)
    })

    for (const m of metrics) {
      const metricKey = getJsonKey(m.label)
      const rows: Record<string, unknown>[] = affectedRowsBase.map((base) => {
        const row = { ...base }
        row.metric = m.label
        return row
      })

      const fileBase = sanitizeMetricForPath(m.label)
      const publicPath = join(outDir, `${fileBase}.json`)
      const allPath = join(outDir, `${fileBase}_all.json`)
      const seedRows =
        incremental
          ? (() => {
              const existingAll = readRankingRows(allPath)
              if (!existingAll) return rows
              return [
                ...existingAll.filter((row) => !affectedYahooIdSet?.has(String(row.playerId ?? "").trim())),
                ...rows,
              ]
            })()
          : rows.map((base) => {
              const row = { ...base }
              row.metric = m.label
              return row
            })

      const sorted = [...seedRows].sort(
        (a, b) => sortValueForBattingMetricKey(metricKey, b) - sortValueForBattingMetricKey(metricKey, a)
      )
      const rankedAll = assignRanks(sorted)
      const teamGames = teamGamesByLeague[lg]
      const filtered = filterBattingRowsForQualifyingAtBuild(sorted, metricKey, year, lg, teamGames)
      const rankedPublic = assignRanks(filtered)

      writeJsonFileWithRetrySync(publicPath, rankedPublic)
      writeJsonFileWithRetrySync(allPath, rankedAll)
    }

    console.log(
      `[phase12] wrote ${lg} rankings (${metrics.length} metrics, ${list.length} ${incremental ? "affected" : "season"} batters) → ${outDir}`
    )
  }

  if (excluded > 0) {
    console.warn(`[phase12] excluded ${excluded} batters (league unresolved; docs/ranking_league_resolution_spec_2026.md)`)
    console.warn(`[phase12] unresolved batters: ${excludedDetails.join(", ")}`)
  }

  if (affectedYahooIds) {
    console.log(`[phase12] incremental update complete for ${affectedYahooIds.length} yahoo ids`)
  }
}
main()
