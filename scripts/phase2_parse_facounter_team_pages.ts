/**
 * Phase 2: Phase1 で取得した facounter チームページ HTML をパースし、選手行を正規化する。
 *
 * 入力:
 *   _data/scraped_external/facounter/{year}/{slug}.html
 *   _data/scraped_external/facounter/{year}/manifest.json
 *
 * 出力:
 *   _data/scraped_external/facounter/{year}/parsed.json
 *
 * 使い方:
 *   npx tsx scripts/phase2_parse_facounter_team_pages.ts --year 2026
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"

type FacounterDomesticFa =
  | { status: "acquired" | "possible_this_season"; remainYears: null; remainDays: null }
  | { status: "estimate"; remainYears: number; remainDays: number }
  | { status: "unknown"; remainYears: null; remainDays: null }

export type FacounterParsedPlayerRow = {
  uniformNumber: string
  playerNameJa: string
  domesticFa: FacounterDomesticFa
  note: string
}

export type FacounterParsedTeamPage = {
  schemaVersion: "facounter-team-parsed-v1"
  seasonYear: string
  slug: string
  rosterTeamFullName: string
  league: "CL" | "PL"
  sourceUrl: string
  parsedAt: string
  players: FacounterParsedPlayerRow[]
}

type ManifestV1 = {
  schemaVersion: "facounter-team-pages-manifest-v1"
  seasonYear: string
  fetchedAt: string
  sourceBaseUrl: string
  teams: Array<{
    slug: string
    url: string
    rosterTeamFullName: string
    league: "CL" | "PL"
    file: string
    bytes: number
    ok: boolean
    error?: string
  }>
}

type ParsedBundleV1 = {
  schemaVersion: "facounter-parsed-bundle-v1"
  seasonYear: string
  parsedAt: string
  teams: FacounterParsedTeamPage[]
}

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  return { year }
}

function stripTags(s: string): string {
  return (
    s
      .replace(/<br\s*\/?>/gi, " ")
      // 最低限のタグ除去
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
  )
}

function parseYearCell(s: string): number | null {
  const t = s.trim()
  const m = t.match(/^(\d+)\s*年$/)
  if (!m) return null
  return Number(m[1] ?? 0)
}

function parseDayCell(s: string): number | null {
  const t = s.trim()
  const m = t.match(/^(\d+)\s*日$/)
  if (!m) return null
  return Number(m[1] ?? 0)
}

function parseDomesticFaCell(yearCell: string, dayCell: string): FacounterDomesticFa {
  const y = stripTags(yearCell)
  const d = stripTags(dayCell)

  if (y.includes("取得済")) return { status: "acquired", remainYears: null, remainDays: null }
  if (y.includes("今季可能")) return { status: "possible_this_season", remainYears: null, remainDays: null }

  const yy = parseYearCell(y)
  const dd = parseDayCell(d)
  if (yy != null && dd != null) return { status: "estimate", remainYears: yy, remainDays: dd }
  return { status: "unknown", remainYears: null, remainDays: null }
}

function extractTrBlocks(html: string): string[] {
  const out: string[] = []
  const re = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push(m[0]!)
  return out
}

function extractTdCells(trHtml: string): string[] {
  const out: string[] = []
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(trHtml))) out.push(m[1] ?? "")
  return out
}

function looksLikePlayerRow(cells: string[]): boolean {
  if (cells.length < 12) return false
  const no = stripTags(cells[0] ?? "")
  const name = stripTags(cells[1] ?? "")
  if (!no || !name) return false
  // 見出し（No. / 投手など）除外
  if (no === "No." || no === "No") return false
  if (!/^\d{1,3}$/.test(no) && !/^\d{2}$/.test(no) && !/^\d{1,2}$/.test(no)) {
    // 背番号は "00" などもあるので 0〜99 を許容
    if (!/^\d{1,2}$/.test(no)) return false
  }
  return true
}

function parseTeamHtml(team: ManifestV1["teams"][number], html: string, year: string): FacounterParsedTeamPage {
  const trs = extractTrBlocks(html)
  const players: FacounterParsedPlayerRow[] = []

  for (const tr of trs) {
    const cells = extractTdCells(tr)
    if (!looksLikePlayerRow(cells)) continue

    const uniformNumberRaw = stripTags(cells[0] ?? "")
    const playerNameJa = stripTags(cells[1] ?? "")
    const domesticFa = parseDomesticFaCell(cells[9] ?? "", cells[10] ?? "")
    const note = stripTags(cells[11] ?? "")

    players.push({
      uniformNumber: uniformNumberRaw,
      playerNameJa,
      domesticFa,
      note,
    })
  }

  return {
    schemaVersion: "facounter-team-parsed-v1",
    seasonYear: year,
    slug: team.slug,
    rosterTeamFullName: team.rosterTeamFullName,
    league: team.league,
    sourceUrl: team.url,
    parsedAt: new Date().toISOString(),
    players,
  }
}

function main(): void {
  const { year } = parseArgs(process.argv.slice(2))
  const root = getProjectRoot()
  const dir = path.join(root, "_data", "scraped_external", "facounter", year)
  const manifestPath = path.join(dir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    console.error(`[phase2_parse_facounter] missing manifest: ${manifestPath}`)
    process.exitCode = 1
    return
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ManifestV1
  if (manifest.schemaVersion !== "facounter-team-pages-manifest-v1") {
    console.error(`[phase2_parse_facounter] unexpected manifest schemaVersion: ${manifest.schemaVersion}`)
    process.exitCode = 1
    return
  }

  const teams: FacounterParsedTeamPage[] = []
  let ok = 0
  let fail = 0

  for (const t of manifest.teams) {
    const htmlPath = path.join(dir, t.file)
    if (!t.ok || !fs.existsSync(htmlPath)) {
      fail++
      console.error(`  SKIP ${t.slug} ${t.rosterTeamFullName} (missing html)`)
      continue
    }
    const html = fs.readFileSync(htmlPath, "utf8")
    const parsed = parseTeamHtml(t, html, year)
    teams.push(parsed)
    ok++
    console.log(`  OK ${t.slug} ${t.rosterTeamFullName}: players=${parsed.players.length}`)
  }

  const out: ParsedBundleV1 = {
    schemaVersion: "facounter-parsed-bundle-v1",
    seasonYear: year,
    parsedAt: new Date().toISOString(),
    teams,
  }
  const outPath = path.join(dir, "parsed.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8")

  console.log(`[phase2_parse_facounter] wrote ${teams.length} teams (ok=${ok} fail=${fail}) → ${outPath}`)
  if (fail > 0) process.exitCode = 1
}

main()

