/**
 * canonical の plateAppearances から pitch_by_type_{gameId}_{yahooPitcherId}.json を一括出力
 *
 *   npx tsx scripts/build_pitch_types_from_canonical.ts --game-id 2021038624
 */

import { mkdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGameDocument } from "../lib/yahooGame/loadCanonicalGame"
import {
  buildPitchTypesResponseFromCanonical,
  yahooPitcherIdsWithPitchEvents,
} from "../lib/yahooGame/pitchTypesFromCanonical"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { gameId: string; outDir: string } {
  const args = process.argv.slice(2)
  let gameId = ""
  let outDir = "_data/yahoo_games_pilot"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--game-id" && args[i + 1]) {
      gameId = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--out-dir" && args[i + 1]) {
      outDir = args[i + 1]!.trim()
      i++
    }
  }
  return { gameId, outDir }
}

function main() {
  const { gameId: rawGid, outDir: rawOut } = parseArgs()
  const gameId = rawGid || "2021038624"
  const outDirRel = rawOut || "_data/yahoo_games_pilot"
  const outDir = join(projectRoot, outDirRel)

  const doc = loadCanonicalGameDocument(projectRoot, gameId)
  if (!doc) {
    console.error(`canonical not found: _data/scraped_games/canonical/${gameId}.json`)
    process.exit(1)
  }

  const pas = doc.domain.plateAppearances ?? []
  const pitcherIds = yahooPitcherIdsWithPitchEvents(pas)
  mkdirSync(outDir, { recursive: true })

  let n = 0
  for (const yid of pitcherIds) {
    const data = buildPitchTypesResponseFromCanonical(gameId, yid, pas)
    if (!data) continue
    const path = join(outDir, `pitch_by_type_${gameId}_${yid}.json`)
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8")
    console.log("wrote", path.replace(projectRoot + "\\", "").replace(projectRoot + "/", ""))
    n++
  }
  console.log(`done: ${n} files`)
}

main()
