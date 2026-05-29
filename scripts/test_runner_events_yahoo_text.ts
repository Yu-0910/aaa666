import fs from "node:fs"
import { runnerEventsFromYahooTextHtml } from "../lib/yahooGame/runnerEventsFromYahooTextHtml"

const htmlPath = process.argv[2]
const gameId = process.argv[3]

if (!htmlPath || !gameId) {
  console.error(
    "usage: npx tsx scripts/test_runner_events_yahoo_text.ts <yahooTextHtmlPath> <gameId>"
  )
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, "utf8")
const runnerEvents = runnerEventsFromYahooTextHtml({ gameId, html })
console.log(JSON.stringify({ gameId, runnerEvents }, null, 2))

