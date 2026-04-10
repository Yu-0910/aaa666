/**
 * Phase 4: canonical → マスタ合流用派生CSV + manifest
 *
 * npx tsx scripts/run_yahoo_phase4_pipeline.ts
 * npx tsx scripts/run_yahoo_phase4_pipeline.ts --game-id 2021038624
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { parseRosterCsv, findNpbIdForYahooBatting } from "../lib/yahooGame/rosterCsv"
import { buildPocRankingRowsFromCanonical } from "../lib/yahooGame/pocRankingFromCanonical"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

function teamForYahooPlayerId(canonical: CanonicalGameDocument, yahooId: string): string {
  for (const t of canonical.game.teams) {
    if (t.startingLineup.some((p) => p.yahooPlayerId === yahooId)) return t.teamName
  }
  return ""
}

function parseArgs(): { gameId: string } {
  const a = process.argv.slice(2)
  let gameId = "2021038624"
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--game-id" && a[i + 1]) {
      gameId = a[i + 1]
      i++
    }
  }
  return { gameId }
}

function main(): void {
  const { gameId } = parseArgs()
  const canonPath = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  const rosterPath = join(root, "_data", "npb_roster_2026.csv")
  const derivedDir = join(root, "_data", "scraped_games", "derived")
  mkdirSync(derivedDir, { recursive: true })

  if (!existsSync(canonPath)) {
    console.error("missing canonical:", canonPath)
    process.exit(1)
  }
  if (!existsSync(rosterPath)) {
    console.error("missing roster:", rosterPath)
    process.exit(1)
  }

  const canonical = JSON.parse(readFileSync(canonPath, "utf8")) as CanonicalGameDocument
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))

  const lines = ["game_id,npb_player_id,yahoo_player_id,player_name,team,ab,h,r,rbi,bb,so,hr,avg_display"]
  for (const b of canonical.domain.battingLines) {
    const hint = teamForYahooPlayerId(canonical, b.yahooPlayerId)
    const m = findNpbIdForYahooBatting(roster, b.playerName, hint)
    const npb = m?.npbPlayerId ?? ""
    const team = m?.team ?? hint
    lines.push(
      [
        gameId,
        npb,
        b.yahooPlayerId,
        csvEscape(b.playerName),
        csvEscape(team),
        b.ab ?? "",
        b.h ?? "",
        b.r ?? "",
        b.rbi ?? "",
        b.bb ?? "",
        b.so ?? "",
        b.hr ?? "",
        csvEscape(b.avg ?? ""),
      ].join(",")
    )
  }

  const csvPath = join(derivedDir, `${gameId}_batting_master_bridge.csv`)
  writeFileSync(csvPath, lines.join("\n"), "utf8")

  const sampleMetrics = ["打率", "OPS", "安打", "打点"]
  const pocSamples: Record<string, number> = {}
  for (const m of sampleMetrics) {
    pocSamples[m] = buildPocRankingRowsFromCanonical(canonical, roster, m).length
  }

  const manifest = {
    schemaVersion: "yahoo-phase4-manifest-v1",
    gameId,
    generatedAt: new Date().toISOString(),
    outputs: {
      battingMasterBridgeCsv: csvPath.replace(root + "\\", "").replace(root + "/", ""),
      rankingPocApi: "/api/rankings-yahoo-poc?season=2026&league=CL&metric=打率&gameId=" + gameId,
      rankingPageHint: `/ranking/2026/CL?sort=avg&yahooPoc=1`,
    },
    pocRankingRowCountsByMetric: pocSamples,
    notes: [
      "CSV は master CSV への自動マージは行わない（差分の橋渡し用）",
      "ランキングUIは ?yahooPoc=1 で API 経由の1試合データを表示",
    ],
  }
  writeFileSync(join(derivedDir, `${gameId}_phase4_manifest.json`), JSON.stringify(manifest, null, 2), "utf8")

  console.log("Phase4 OK:", csvPath)
  console.log(JSON.stringify(manifest.outputs, null, 2))
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

main()
