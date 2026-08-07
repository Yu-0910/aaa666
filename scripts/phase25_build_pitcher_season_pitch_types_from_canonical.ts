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



import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs"

import { join, dirname } from "path"

import { fileURLToPath } from "url"

import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { writeJsonFileWithRetrySync } from "../lib/fs/writeFileWithRetry"

import {

  accumulatePitcherSeasonPitchTypesFromDocs,

  aggregatePitcherSeasonPitchTypeRows,
  collectPitcherSeasonPaBlocksFromGame,

} from "../lib/yahooGame/pitcherSeasonPitchTypes"

import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { extractCanonicalGameYmd } from "../lib/yahooGame/loadCanonicalGames"



const __dirname = dirname(fileURLToPath(import.meta.url))

const projectRoot = join(__dirname, "..")



function parseArgs(): { year: string; from: string | null; to: string | null; onlyNpbIds: string[] | null } {

  const args = process.argv.slice(2)

  let year = "2026"
  let from: string | null = null
  let to: string | null = null
  let onlyNpbIds: string[] | null = null

  for (let i = 0; i < args.length; i++) {

    if (args[i] === "--year" && args[i + 1]) {

      year = args[i + 1]!.trim()

      i++

    } else if (args[i] === "--from" && args[i + 1]) {

      from = String(args[i + 1]).trim()

      i++

    } else if (args[i] === "--to" && args[i + 1]) {

      to = String(args[i + 1]).trim()

      i++

    } else if (args[i] === "--only-npb-ids" && args[i + 1]) {

      onlyNpbIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      i++

    }

  }

  return { year, from, to, onlyNpbIds }

}

function isYmd(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
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

  const { year, from, to, onlyNpbIds } = parseArgs()
  if ((from && !isYmd(from)) || (to && !isYmd(to))) {
    console.error("[phase25-pitch-types] invalid --from/--to. expected YYYY-MM-DD")
    process.exit(1)
  }

  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot, { year })

  if (!docs.length) {

    console.error("[phase25-pitch-types] no canonical games")

    process.exit(1)

  }



  const roster = parseRosterCsv(

    readFileSync(join(projectRoot, "_data/npb_roster_2026.csv"), "utf8"),

  )



  const targetNpbIds = onlyNpbIds ? [...onlyNpbIds] : null
  const targetNpbIdSet = targetNpbIds ? new Set(targetNpbIds) : null
  const inputDocs =
    targetNpbIdSet
      ? docs.filter((doc) => {
          const chunk = collectPitcherSeasonPaBlocksFromGame(doc, roster)
          for (const npb of chunk.keys()) {
            if (targetNpbIdSet.has(npb)) return true
          }
          return false
        })
      : docs
  const byNpb = accumulatePitcherSeasonPitchTypesFromDocs(inputDocs, roster)



  const outDir = join(projectRoot, "_data", "derived", "pitcher_season_pitch_types", year)

  mkdirSync(outDir, { recursive: true })



  for (const f of readdirSync(outDir).filter((x) => x.endsWith(".json"))) {
    const npbId = f.replace(/^npb_/, "").replace(/\.json$/, "")
    if (targetNpbIds && !targetNpbIds.includes(npbId)) continue
    unlinkSync(join(outDir, f))

  }



  let n = 0

  const generatedAt = new Date().toISOString()

  for (const [npb, acc] of byNpb) {
    if (targetNpbIdSet && !targetNpbIdSet.has(npb)) continue
    if (from || to) {
      const inRange = [...acc.gameIds].some((gid) => {
        const doc = docs.find((d) => d.gameId === gid)
        const ymd = doc ? extractCanonicalGameYmd(doc) : ""
        if (!ymd) return false
        if (from && ymd < from) return false
        if (to && ymd > to) return false
        return true
      })
      if (!inRange) continue
    }

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

    writeJsonFileWithRetrySync(path, payload)

    n++

  }



  console.log(
    `[phase25-pitch-types] wrote ${n} files → ${outDir}${from || to ? ` (range=${from ?? "(start)"}..${to ?? "(end)"})` : ""}`,
  )

}



main()


