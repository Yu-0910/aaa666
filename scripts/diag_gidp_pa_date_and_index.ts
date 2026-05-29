/**
 * 指定打者について、plateAppearances 側で「併殺打（GIDP）」と判定できる打席を抽出し、
 * 試合日と「その試合で何打席目か」を出力する。
 *
 * 実行:
 *   npx tsx scripts/diag_gidp_pa_date_and_index.ts --year 2026 --batter-ids 1500128,1950278
 */

import { readdirSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; batterIds: string[] } {
  const args = process.argv.slice(2)
  let year = "2026"
  let batterIds: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if ((args[i] === "--batter-ids" || args[i] === "--bids") && args[i + 1]) {
      batterIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  if (batterIds.length === 0) {
    console.error("[diag_gidp_pa] missing --batter-ids")
    process.exit(1)
  }
  return { year, batterIds }
}

function extractDateJaFromTitle(title: string): string {
  const s = String(title ?? "")
  const m = s.match(/(\d{4}年\d{1,2}月\d{1,2}日)/)
  return m ? m[1] : ""
}

function lastPitchResult(pa: PlateAppearance): string {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return (String(pa.resultSummaryJa ?? "").trim() || String(last?.resultJa ?? "").trim() || "").trim()
}

function isGidp(result: string): boolean {
  const s = String(result ?? "").trim()
  if (!s) return false
  if (/併殺崩れ/.test(s)) return false
  if (/盗塁/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  if (/(けん制|牽制)/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  return /併殺|併打|併殺打|ダブルプレー|ゲッツー/.test(s)
}

type Hit = {
  batterId: string
  dateJa: string
  gameId: string
  paIndexInGame: number
  inningHalf?: string
  paId: string
  result: string
}

function main(): void {
  const { year, batterIds } = parseArgs()
  const canonDir = join(projectRoot, "_data", "scraped_games", "canonical")
  const files = readdirSync(canonDir).filter((f) => /^\d+\.json$/.test(f))
  const target = new Set(batterIds)
  const out: Hit[] = []

  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(canonDir, f), "utf8")) as CanonicalGameDocument
    const title = String(doc?.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue
    const dateJa = extractDateJaFromTitle(title)
    const pas = doc.domain?.plateAppearances ?? []

    for (const bid of target) {
      let n = 0
      for (const pa of pas) {
        if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
        n += 1
        const r = lastPitchResult(pa)
        if (!isGidp(r)) continue
        out.push({
          batterId: bid,
          dateJa,
          gameId: doc.gameId,
          paIndexInGame: n,
          inningHalf: pa.inningHalf,
          paId: pa.paId,
          result: r,
        })
      }
    }
  }

  out.sort((a, b) => (a.batterId + a.dateJa + a.gameId + a.paIndexInGame).localeCompare(b.batterId + b.dateJa + b.gameId + b.paIndexInGame))
  console.log(`[diag_gidp_pa] year=${year} hits=${out.length}`)
  for (const h of out) {
    console.log(`- batterId=${h.batterId} date=${h.dateJa} gameId=${h.gameId} pa=${h.paIndexInGame} inning=${h.inningHalf ?? ""} paId=${h.paId} result=${h.result}`)
  }
}

main()

