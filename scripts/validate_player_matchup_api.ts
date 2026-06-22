/**
 * Phase 2: 対戦成績 API ローダーの検証（HTTP サーバー不要）
 *
 *   npx tsx scripts/validate_player_matchup_api.ts [--fail]
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { fetchPlayerMatchupPayload, resolveMatchupNpbPlayerId } from "@/lib/playerMatchupApi"
import { PLAYER_MATCHUP_SCHEMA_VERSION } from "@/lib/playerMatchupTypes"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const root = getProjectRoot()
  const year = "2026"
  const battingDir = path.join(root, "_data", "derived", "player_matchup_batting", year)
  const pitchingDir = path.join(root, "_data", "derived", "player_matchup_pitching", year)

  assert(fs.existsSync(battingDir), `missing ${battingDir} — run npm run phase30:build:player-matchup`)
  assert(fs.existsSync(pitchingDir), `missing ${pitchingDir}`)

  const sampleBat = fs
    .readdirSync(battingDir)
    .find((f) => f.startsWith("npb_") && f.endsWith(".json"))
  assert(sampleBat != null, "no batting matchup json")

  const npbFromFile = sampleBat!.replace(/^npb_/, "").replace(/\.json$/, "")
  assert(/^\d+$/.test(npbFromFile), "npb id from filename")

  const resolved = resolveMatchupNpbPlayerId(npbFromFile)
  assert(resolved === npbFromFile, "resolveMatchupNpbPlayerId numeric")

  const batting = await fetchPlayerMatchupPayload(year, npbFromFile, "batter")
  assert(batting.payload != null, "batting payload")
  assert(batting.payload!.schemaVersion === PLAYER_MATCHUP_SCHEMA_VERSION, "schema")
  assert(batting.payload!.role === "batter", "role batter")
  assert(batting.payload!.teams.length >= 1, "at least one team block")
  const row = batting.payload!.teams[0]?.opponents[0]
  assert(row != null && row.ab >= 0, "opponent row")

  const unknown = await fetchPlayerMatchupPayload(year, "00000000", "batter")
  assert(unknown.payload == null, "unknown player null")

  console.log(
    `[validate_player_matchup_api] ok sample=${npbFromFile} teams=${batting.payload!.teams.length} opponent=${row!.opponentName}`,
  )
}

main().catch((e) => {
  console.error("[validate_player_matchup_api] FAIL", e)
  if (process.argv.includes("--fail")) process.exit(1)
  throw e
})
