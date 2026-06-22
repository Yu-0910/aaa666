/**

 * canonical 全試合から投手別シーズン球種別 JSON を出力。

 *

 *   npx tsx scripts/phase25_build_pitcher_season_pitch_types_from_canonical.ts --year 2026

 *   npm run phase25:build:pitcher-season-pitch-types

 *

 * 出力: _data/derived/pitcher_season_pitch_types/{year}/npb_{npbPlayerId}.json

 *

 * 試合数（source.canonicalGames）は phase:pitcher-poc1 の登板数と同一母数（pitchingLines 登板）。
 * Whiff% = 空振り ÷ スイング数（スイング企図）。

 */



import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"

import { join, dirname } from "path"

import { fileURLToPath } from "url"

import type { CanonicalGameDocument } from "../lib/yahooGame/types"

import {

  accumulatePitcherSeasonPitchTypesFromDocs,

  aggregatePitcherSeasonPitchTypeRows,

} from "../lib/yahooGame/pitcherSeasonPitchTypes"

import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"



const __dirname = dirname(fileURLToPath(import.meta.url))

const projectRoot = join(__dirname, "..")



function parseArgs(): { year: string } {

  const args = process.argv.slice(2)

  let year = "2026"

  for (let i = 0; i < args.length; i++) {

    if (args[i] === "--year" && args[i + 1]) {

      year = args[i + 1]!.trim()

      i++

    }

  }

  return { year }

}



function loadCanonicalFiles(): CanonicalGameDocument[] {

  const dir = join(projectRoot, "_data", "scraped_games", "canonical")

  if (!existsSync(dir)) return []

  const out: CanonicalGameDocument[] = []

  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {

    try {

      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as CanonicalGameDocument

      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)

    } catch {

      // ignore

    }

  }

  return out

}



function main(): void {

  const { year } = parseArgs()

  const docs = loadCanonicalFiles()

  if (!docs.length) {

    console.error("[phase25-pitch-types] no canonical games")

    process.exit(1)

  }



  const roster = parseRosterCsv(

    readFileSync(join(projectRoot, "_data/npb_roster_2026.csv"), "utf8"),

  )



  const byNpb = accumulatePitcherSeasonPitchTypesFromDocs(docs, roster)



  const outDir = join(projectRoot, "_data", "derived", "pitcher_season_pitch_types", year)

  mkdirSync(outDir, { recursive: true })



  for (const f of readdirSync(outDir).filter((x) => x.endsWith(".json"))) {

    unlinkSync(join(outDir, f))

  }



  let n = 0

  const generatedAt = new Date().toISOString()

  for (const [npb, acc] of byNpb) {

    if (!acc.blocks.length) continue

    const agg = aggregatePitcherSeasonPitchTypeRows(acc.blocks)

    const payload = {

      schemaVersion: "pitcher-season-pitch-types-v1",

      seasonYear: year,

      npbPlayerId: npb,

      yahooPitcherIds: [...acc.yahooIds].sort(),

      generatedAt,

      source: { canonicalGames: [...acc.gameIds].sort() },

      ...agg,

    }

    const path = join(outDir, `npb_${npb}.json`)

    writeFileSync(path, JSON.stringify(payload, null, 2), "utf8")

    n++

  }



  console.log(`[phase25-pitch-types] wrote ${n} files → ${outDir}`)

}



main()


