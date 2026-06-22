/**
 * Phase 3: facounter パース結果を 2026 名簿に突合し、FA推定派生JSONを生成する。
 *
 * 入力:
 *   _data/scraped_external/facounter/{year}/parsed.json
 *   _data/npb_roster_2026.csv
 *
 * 出力:
 *   _data/derived/player_fa_estimates/{year}/npb_fa_estimates.json
 *   _data/reports/facounter_unresolved_{year}.json
 *
 * 使い方:
 *   npx tsx scripts/phase3_merge_facounter_roster.ts --year 2026
 */

import fs from "fs"
import path from "path"
import { buildDomesticFaFromFacounterParsed } from "@/lib/faEstimate"
import type { FacounterDomesticFaParsed } from "@/lib/faEstimate"
import type { PlayerFaEstimatesByNpbId } from "@/lib/faEstimate"
import {
  buildDomesticFaFromCareer,
  FA_ESTIMATE_FROM_CAREER_NPB_IDS,
} from "@/lib/faEstimateFromCareer"
import { facounterNamesForIndex, rosterNameKeysForFacounter } from "@/lib/facounterRosterAliases"
import { compactPlayerName } from "@/lib/playerNameNormalize"
import { getNpbRoster2026, rosterJaNameLookupKeys } from "@/lib/npbRoster"
import { getProjectRoot } from "@/lib/projectRoot"

type FacounterParsedPlayerRow = {
  uniformNumber: string
  playerNameJa: string
  domesticFa: FacounterDomesticFaParsed
  note: string
}

type FacounterParsedTeamPage = {
  rosterTeamFullName: string
  players: FacounterParsedPlayerRow[]
}

type ParsedBundleV1 = {
  schemaVersion: "facounter-parsed-bundle-v1"
  seasonYear: string
  teams: FacounterParsedTeamPage[]
}

type FacounterIndexedRow = FacounterParsedPlayerRow & {
  rosterTeamFullName: string
}

type UnresolvedReportV1 = {
  schemaVersion: "facounter-unresolved-v1"
  seasonYear: string
  generatedAt: string
  rosterUnmatched: Array<{
    npb_player_id: string
    name_ja: string
    team: string
    uniform_no: string
    reason: string
  }>
  facounterUnmatched: Array<{
    rosterTeamFullName: string
    playerNameJa: string
    uniformNumber: string
    reason: string
  }>
}

const DEFAULT_REMAINING_DAYS_THIS_SEASON = 125

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  const remIdx = argv.indexOf("--remaining-days")
  const remainingDays =
    remIdx >= 0 ? Number(argv[remIdx + 1] ?? DEFAULT_REMAINING_DAYS_THIS_SEASON) : DEFAULT_REMAINING_DAYS_THIS_SEASON
  return {
    year,
    remainingDays: Number.isFinite(remainingDays) ? remainingDays : DEFAULT_REMAINING_DAYS_THIS_SEASON,
  }
}

function normalizeUniformNo(s: string): string {
  return (s || "").normalize("NFKC").trim().replace(/^0+(\d)/, "$1")
}

function teamNameKey(team: string): string {
  return (team || "").trim()
}

function rosterLookupKey(team: string, nameCompact: string): string {
  return `${teamNameKey(team)}|${nameCompact}`
}

function facounterRowIdentity(row: FacounterIndexedRow): string {
  return `${row.rosterTeamFullName}|${row.uniformNumber}|${compactPlayerName(row.playerNameJa)}`
}

function dedupeFacounterRows(rows: FacounterIndexedRow[]): FacounterIndexedRow[] {
  const seen = new Set<string>()
  const out: FacounterIndexedRow[] = []
  for (const r of rows) {
    const id = facounterRowIdentity(r)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}

function nameKeysForJa(nameJa: string): string[] {
  return rosterJaNameLookupKeys(nameJa)
}

function nameKeysForRosterPlayer(nameJa: string): string[] {
  const keys = new Set<string>()
  for (const label of rosterNameKeysForFacounter(nameJa)) {
    for (const k of rosterJaNameLookupKeys(label)) keys.add(k)
  }
  return [...keys]
}

function buildFacounterIndexes(teams: FacounterParsedTeamPage[]): {
  byTeamName: Map<string, FacounterIndexedRow[]>
  byNameOnly: Map<string, FacounterIndexedRow[]>
} {
  const byTeamName = new Map<string, FacounterIndexedRow[]>()
  const byNameOnly = new Map<string, FacounterIndexedRow[]>()

  for (const t of teams) {
    const team = teamNameKey(t.rosterTeamFullName)
    for (const p of t.players) {
      const row: FacounterIndexedRow = { ...p, rosterTeamFullName: team }
      const keys = new Set<string>()
      for (const label of facounterNamesForIndex(p.playerNameJa)) {
        for (const k of nameKeysForJa(label)) keys.add(k)
      }
      for (const k of keys) {
        const teamKey = rosterLookupKey(team, k)
        const teamList = byTeamName.get(teamKey) ?? []
        teamList.push(row)
        byTeamName.set(teamKey, teamList)

        const globalList = byNameOnly.get(k) ?? []
        globalList.push(row)
        byNameOnly.set(k, globalList)
      }
    }
  }
  return { byTeamName, byNameOnly }
}

function collectCandidates(
  index: Map<string, FacounterIndexedRow[]>,
  nameKeys: string[]
): FacounterIndexedRow[] {
  const merged: FacounterIndexedRow[] = []
  for (const nk of nameKeys) {
    const c = index.get(nk)
    if (c?.length) merged.push(...c)
  }
  return dedupeFacounterRows(merged)
}

function pickFacounterMatch(
  candidates: FacounterIndexedRow[],
  rosterUniformNo: string
): { match: FacounterIndexedRow | null; reason?: string } {
  const unique = dedupeFacounterRows(candidates)
  if (unique.length === 0) return { match: null, reason: "facounterに該当行なし" }
  if (unique.length === 1) return { match: unique[0]! }

  const ru = normalizeUniformNo(rosterUniformNo)
  if (ru) {
    const byNo = unique.filter((c) => normalizeUniformNo(c.uniformNumber) === ru)
    if (byNo.length === 1) return { match: byNo[0]! }
    if (byNo.length > 1) return { match: null, reason: `背番号${ru}で複数候補` }
  }

  const distinctNames = new Set(unique.map((c) => compactPlayerName(c.playerNameJa)))
  if (distinctNames.size === 1) return { match: unique[0]! }

  return { match: null, reason: `同名候補${unique.length}件` }
}

function resolveFacounterRow(
  rosterTeam: string,
  nameJa: string,
  uniformNo: string,
  indexes: ReturnType<typeof buildFacounterIndexes>
): {
  match: FacounterIndexedRow | null
  matchKind: "team_name" | "name_only" | null
  reason?: string
} {
  const nameKeys = nameKeysForRosterPlayer(nameJa)
  const teamCandidates = collectCandidates(indexes.byTeamName, nameKeys.map((k) => rosterLookupKey(rosterTeam, k)))
  const teamPick = pickFacounterMatch(teamCandidates, uniformNo)
  if (teamPick.match) return { match: teamPick.match, matchKind: "team_name" }

  const globalCandidates = collectCandidates(indexes.byNameOnly, nameKeys)
  const globalPick = pickFacounterMatch(globalCandidates, uniformNo)
  if (globalPick.match) {
    return { match: globalPick.match, matchKind: "name_only", reason: teamPick.reason }
  }

  return {
    match: null,
    matchKind: null,
    reason: globalPick.reason ?? teamPick.reason ?? "突合失敗",
  }
}

function main(): void {
  const { year, remainingDays } = parseArgs(process.argv.slice(2))
  const seasonYear = Number(year) || 2026
  const root = getProjectRoot()
  const parsedPath = path.join(root, "_data", "scraped_external", "facounter", year, "parsed.json")
  if (!fs.existsSync(parsedPath)) {
    console.error(`[phase3_merge_facounter] missing: ${parsedPath}`)
    process.exitCode = 1
    return
  }

  const bundle = JSON.parse(fs.readFileSync(parsedPath, "utf8")) as ParsedBundleV1
  if (bundle.schemaVersion !== "facounter-parsed-bundle-v1") {
    console.error(`[phase3_merge_facounter] unexpected schema: ${bundle.schemaVersion}`)
    process.exitCode = 1
    return
  }

  const facounterIndexes = buildFacounterIndexes(bundle.teams)
  const roster = getNpbRoster2026()
  const matchedFacounterKeys = new Set<string>()

  const byNpbPlayerId: PlayerFaEstimatesByNpbId["byNpbPlayerId"] = {}
  const rosterUnmatched: UnresolvedReportV1["rosterUnmatched"] = []

  let matched = 0
  let matchedByNameOnly = 0
  let unmatched = 0

  for (const r of roster) {
    const npbId = String(r.npb_player_id ?? "").trim()
    if (!npbId) continue

    const team = teamNameKey(r.team)
    const { match, matchKind, reason } = resolveFacounterRow(team, r.name_ja, r.uniform_no, facounterIndexes)
    if (!match) {
      unmatched++
      rosterUnmatched.push({
        npb_player_id: npbId,
        name_ja: r.name_ja,
        team: r.team,
        uniform_no: r.uniform_no,
        reason: reason ?? "突合失敗",
      })
      byNpbPlayerId[npbId] = { domesticFa: null }
      continue
    }

    matched++
    if (matchKind === "name_only") matchedByNameOnly++
    matchedFacounterKeys.add(facounterRowIdentity(match))

    const notes: string[] = []
    if (match.note?.trim()) notes.push(match.note.trim())
    if (matchKind === "name_only" && teamNameKey(match.rosterTeamFullName) !== team) {
      notes.push(`facounter掲載球団=${match.rosterTeamFullName}（名簿=${r.team}）`)
    }
    const domesticFa = buildDomesticFaFromFacounterParsed(
      match.domesticFa,
      { seasonYear, remainingDaysThisSeason: remainingDays },
      notes.join(" / ") || undefined
    )
    byNpbPlayerId[npbId] = { domesticFa }
  }

  let careerApplied = 0
  for (const npbId of FA_ESTIMATE_FROM_CAREER_NPB_IDS) {
    if (!byNpbPlayerId[npbId]) continue
    const domesticFa = buildDomesticFaFromCareer(
      npbId,
      { seasonYear, remainingDaysThisSeason: remainingDays },
      root
    )
    if (!domesticFa) continue
    byNpbPlayerId[npbId] = { domesticFa }
    careerApplied++
    const idx = rosterUnmatched.findIndex((u) => u.npb_player_id === npbId)
    if (idx >= 0) rosterUnmatched.splice(idx, 1)
  }

  const facounterUnmatched: UnresolvedReportV1["facounterUnmatched"] = []
  for (const t of bundle.teams) {
    const team = teamNameKey(t.rosterTeamFullName)
    for (const p of t.players) {
      const key = `${team}|${p.uniformNumber}|${compactPlayerName(p.playerNameJa)}`
      if (matchedFacounterKeys.has(key)) continue
      facounterUnmatched.push({
        rosterTeamFullName: team,
        playerNameJa: p.playerNameJa,
        uniformNumber: p.uniformNumber,
        reason: "名簿に未突合",
      })
    }
  }

  const generatedAt = new Date().toISOString()
  const out: PlayerFaEstimatesByNpbId = {
    schemaVersion: "player-fa-estimates-v1",
    seasonYear: year,
    generatedAt,
    byNpbPlayerId,
  }

  const outDir = path.join(root, "_data", "derived", "player_fa_estimates", year)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, "npb_fa_estimates.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8")

  const report: UnresolvedReportV1 = {
    schemaVersion: "facounter-unresolved-v1",
    seasonYear: year,
    generatedAt,
    rosterUnmatched,
    facounterUnmatched,
  }
  const reportDir = path.join(root, "_data", "reports")
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, `facounter_unresolved_${year}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8")

  const rosterUnmatchedFinal = rosterUnmatched.length
  console.log(
    `[phase3_merge_facounter] roster=${roster.length} matched=${matched} ` +
      `(name_only=${matchedByNameOnly}) unmatched=${rosterUnmatchedFinal} ` +
      `career_fa=${careerApplied} facounter_orphans=${facounterUnmatched.length} ` +
      `remainingDays=${remainingDays}`
  )
  console.log(`  → ${outPath}`)
  console.log(`  → ${reportPath}`)
}

main()
