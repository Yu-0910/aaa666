/**
 * Diagnose canonical games that are likely incomplete for batting totals.
 *
 * Finds games where:
 * - not marked cancelled, but stats/text parse looks empty/partial
 * - stats HTML has zero player links (common symptom of "試合前" / empty page)
 * - canonical ended up with empty battingLines / empty plateAppearances
 *
 * Usage:
 *   npx tsx scripts/diag_batting_games_incomplete.ts --year 2026
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, "..")

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = String(args[i + 1]).trim()
  }
  return { year }
}

function statsPlayerLinkCountFromRawHtml(projectRootAbs: string, gameId: string): number | null {
  const p = path.join(projectRootAbs, "_data", "scraped_games", "raw_sportsnavi_stats", `${gameId}.html`)
  if (!fs.existsSync(p)) return null
  const html = fs.readFileSync(p, "utf8")
  const re = /href="\/npb\/player\/(\d+)\//g
  let n = 0
  while (re.exec(html) !== null) n += 1
  return n
}

function isMarkedCancelled(doc: CanonicalGameDocument): boolean {
  const miss = doc.game?.missingOrPartial ?? []
  return miss.some((s) => String(s).includes("game cancelled"))
}

function summarize(doc: CanonicalGameDocument) {
  const miss = (doc.game?.missingOrPartial ?? []).filter((s) => String(s).startsWith("phase2:"))
  return {
    gameId: doc.gameId,
    title: doc.game?.meta?.documentTitle ?? "",
    cancelled: isMarkedCancelled(doc),
    statsRows: (doc.game?.statsPlayerLinkedRows ?? []).length,
    textSections: (doc.game?.textPlayByPlay ?? []).length,
    battingLines: (doc.domain?.battingLines ?? []).length,
    plateAppearances: (doc.domain?.plateAppearances ?? []).length,
    missingPhase2: miss,
  }
}

function main() {
  const { year } = parseArgs(process.argv)
  const docs = loadCanonicalGames(projectRoot).filter((d) => {
    const title = String(d.game?.meta?.documentTitle ?? "")
    return title.includes(`${year}年`)
  })

  const suspects: ReturnType<typeof summarize>[] = []
  for (const d of docs) {
    const cancelled = isMarkedCancelled(d)
    const statsRows = (d.game?.statsPlayerLinkedRows ?? []).length
    const textSections = (d.game?.textPlayByPlay ?? []).length
    const battingLines = (d.domain?.battingLines ?? []).length
    const pa = (d.domain?.plateAppearances ?? []).length

    // strong signals
    const emptyAll = statsRows === 0 && textSections === 0 && battingLines === 0 && pa === 0
    const emptyStatsButHasText = statsRows === 0 && textSections > 0
    const emptyPaButHasStats = pa === 0 && statsRows > 0

    if (cancelled) continue
    if (emptyAll || emptyStatsButHasText || emptyPaButHasStats) suspects.push(summarize(d))
  }

  const withLinkCounts = suspects.map((s) => ({
    ...s,
    rawStatsPlayerLinks: statsPlayerLinkCountFromRawHtml(projectRoot, s.gameId),
  }))

  console.log(
    JSON.stringify(
      {
        year,
        canonicalGames: docs.length,
        suspects: withLinkCounts.length,
        rows: withLinkCounts,
      },
      null,
      2,
    ),
  )
}

main()

