/**
 * 指定打者の「併殺打（GIDP）」判定になった打席を一覧化して検証する。
 *
 * 実行:
 *   npx tsx scripts/diag_gidp_events_for_batter.ts --year 2026 --batter-id 1800050
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; batterId: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  let batterId = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if ((args[i] === "--batter-id" || args[i] === "--bid") && args[i + 1]) {
      batterId = String(args[i + 1]).trim()
      i++
    }
  }
  if (!batterId) {
    console.error("[diag_gidp] missing --batter-id")
    process.exit(1)
  }
  return { year, batterId }
}

function isGidpLikeText(result: string): boolean {
  const s = String(result ?? "").trim()
  if (!s) return false
  if (/盗塁/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  if (/(けん制|牽制)/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  return /併殺|併打|併殺打|ダブルプレー|ゲッツー/.test(s)
}

function main(): void {
  const { year, batterId } = parseArgs()
  const docs = loadCanonicalGames(projectRoot)
  const hits: Array<{ gameId: string; paId: string; inningHalf?: string; result: string }> = []

  for (const doc of docs) {
    const title = String(doc.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    for (const pa of doc.domain?.plateAppearances ?? []) {
      if (String(pa.yahooBatterId ?? "").trim() !== batterId) continue
      const result = String(pa.resultSummaryJa ?? "").trim()
      if (!isGidpLikeText(result)) continue
      hits.push({ gameId: doc.gameId, paId: pa.paId, inningHalf: pa.inningHalf, result })
    }
  }

  hits.sort((a, b) => (a.gameId + a.paId).localeCompare(b.gameId + b.paId))

  console.log(`[diag_gidp] year=${year} batterId=${batterId} gidpPA=${hits.length}`)
  for (const h of hits) {
    console.log(`- gameId=${h.gameId} paId=${h.paId} inning=${h.inningHalf ?? ""} result=${h.result}`)
  }
}

main()

