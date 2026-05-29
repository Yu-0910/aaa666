import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import { sbCsFromTextPlayByPlayForDebug } from "../lib/yahooGame/diagRunnerSbCs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { yahooPlayerId: string } {
  const args = process.argv.slice(2)
  const yahooPlayerId = args[0] ? String(args[0]).trim() : ""
  if (!yahooPlayerId) {
    console.error("usage: tsx scripts/diag_cs_for_player.ts <yahooPlayerId>")
    process.exit(1)
  }
  return { yahooPlayerId }
}

function main(): void {
  const { yahooPlayerId } = parseArgs()
  const docs = loadCanonicalGames(projectRoot)

  let totalCs = 0
  let totalSb = 0
  const hits: Array<{ gameId: string; inningHalf?: string; kind: string; sourceLine?: string }> = []

  for (const doc of docs) {
    const events = sbCsFromTextPlayByPlayForDebug(doc)
    for (const e of events) {
      if (e.yahooRunnerId !== yahooPlayerId) continue
      if (e.kind === "CS") totalCs += 1
      if (e.kind === "SB") totalSb += 1
      hits.push({ gameId: doc.gameId, inningHalf: e.inningHalf, kind: e.kind, sourceLine: e.sourceLine })
    }
  }

  console.log(JSON.stringify({ yahooPlayerId, totalSb, totalCs, hits }, null, 2))
}

main()

