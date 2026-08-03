import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import {
  parseBaseballDataTeamPitchingRows,
  type BaseballDataTeamPitchingSnapshot,
} from "@/lib/standings/baseballDataTeamPitching"
import type { StandingsLeague } from "@/lib/standings/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; leagues: StandingsLeague[] } {
  const args = process.argv.slice(2)
  let year = "2026"
  let league: StandingsLeague | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--league" && args[i + 1]) {
      const value = args[i + 1]!.toUpperCase()
      if (value !== "CL" && value !== "PL") throw new Error(`invalid league: ${args[i + 1]}`)
      league = value
      i++
    }
  }
  return { year, leagues: league ? [league] : ["CL", "PL"] }
}

function baseballDataUrl(league: StandingsLeague): string {
  return league === "CL"
    ? "https://baseballdata.jp/c/index.html"
    : "https://baseballdata.jp/p/index.html"
}

async function fetchSnapshot(year: string, league: StandingsLeague): Promise<BaseballDataTeamPitchingSnapshot> {
  const res = await fetch(baseballDataUrl(league), {
    headers: {
      "cache-control": "no-cache",
      "user-agent": "Mozilla/5.0 (compatible; TopPage data refresh)",
    },
  })
  if (!res.ok) {
    throw new Error(`baseballdata fetch failed ${league}: ${res.status} ${res.statusText}`)
  }
  const html = await res.text()
  return {
    source: "baseballdata.jp",
    year,
    league,
    fetchedAt: new Date().toISOString(),
    rows: parseBaseballDataTeamPitchingRows(html),
  }
}

async function main(): Promise<void> {
  const { year, leagues } = parseArgs()
  for (const league of leagues) {
    const snapshot = await fetchSnapshot(year, league)
    const outPath = join(projectRoot, "_data", "baseballdata_team_pitching", year, `${league}.json`)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
    console.log(`[baseballdata:team-pitching] ${year} ${league}: ${snapshot.rows.length} rows -> ${outPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
