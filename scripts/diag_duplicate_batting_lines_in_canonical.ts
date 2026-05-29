/**
 * canonical の domain.battingLines で同一 yahooPlayerId が複数行ないか検出する。
 * 使い方: npx tsx scripts/diag_duplicate_batting_lines_in_canonical.ts [--from-date 2026-05-08] [--to-date 2026-05-09]
 * 日付指定なし: 全 canonical をスキャン
 */
import { readdirSync, readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")
const canonicalDir = join(projectRoot, "_data", "scraped_games", "canonical")

type CanonicalDoc = {
  gameId?: string
  game?: { meta?: { documentTitle?: string; ogTitle?: string } }
  domain?: { battingLines?: Array<{ yahooPlayerId?: string }> }
}

function parseArgs(): { fromDate: string | null; toDate: string | null } {
  const args = process.argv.slice(2)
  let fromDate: string | null = null
  let toDate: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from-date" && args[i + 1]) {
      fromDate = args[i + 1]!
      i++
    } else if (args[i] === "--to-date" && args[i + 1]) {
      toDate = args[i + 1]!
      i++
    }
  }
  return { fromDate, toDate }
}

/** documentTitle から YYYY-MM-DD を拾う（例: 2026年5月8日 → 2026-05-08） */
function gameDateFromTitle(title: string): string | null {
  const m = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  const y = m[1]!
  const mo = String(m[2]).padStart(2, "0")
  const d = String(m[3]).padStart(2, "0")
  return `${y}-${mo}-${d}`
}

function inDateRange(date: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  if (!date) return !from && !to
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function findDuplicates(lines: Array<{ yahooPlayerId?: string }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) {
    const id = String(line.yahooPlayerId ?? "").trim()
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const dups = new Map<string, number>()
  for (const [id, c] of counts) {
    if (c > 1) dups.set(id, c)
  }
  return dups
}

function main(): void {
  const { fromDate, toDate } = parseArgs()
  if (!existsSync(canonicalDir)) {
    console.error("missing:", canonicalDir)
    process.exit(1)
  }

  const files = readdirSync(canonicalDir).filter((f) => /^\d+\.json$/.test(f))
  const problems: Array<{
    gameId: string
    title: string
    gameDate: string | null
    dups: Map<string, number>
    lineCount: number
  }> = []

  for (const f of files) {
    const p = join(canonicalDir, f)
    let doc: CanonicalDoc
    try {
      doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalDoc
    } catch {
      continue
    }
    const gameId = String(doc.gameId ?? f.replace(/\.json$/, ""))
    const title = String(doc.game?.meta?.documentTitle ?? doc.game?.meta?.ogTitle ?? "")
    const gameDate = gameDateFromTitle(title)
    if (!inDateRange(gameDate, fromDate, toDate)) continue

    const lines = doc.domain?.battingLines ?? []
    if (lines.length === 0) continue
    const dups = findDuplicates(lines)
    if (dups.size > 0) {
      problems.push({ gameId, title: title.slice(0, 80), gameDate, dups, lineCount: lines.length })
    }
  }

  console.log(
    `scanned ${canonicalDir}\nfilter: from=${fromDate ?? "(none)"} to=${toDate ?? "(none)"}\nfiles with duplicate yahooPlayerId in battingLines: ${problems.length}\n`,
  )
  for (const row of problems.sort((a, b) => (a.gameDate ?? "").localeCompare(b.gameDate ?? ""))) {
    console.log(`gameId=${row.gameId} date=${row.gameDate ?? "?"} lines=${row.lineCount}`)
    console.log(`  title: ${row.title}`)
    const entries = [...row.dups.entries()].sort((a, b) => b[1] - a[1])
    console.log(`  duplicate yahooPlayerId (count): ${entries.map(([id, c]) => `${id}×${c}`).join(", ")}`)
    console.log("")
  }
}

main()
