/**
 * 全 batter の player_season_batting_splits/2026/yahoo_*.json から
 * `reconciliation.cellTeamUnresolvedSamples` を集めて表示する。
 */
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { getProjectRoot } from "@/lib/projectRoot"

const root = getProjectRoot()
const dir = join(root, "_data", "derived", "player_season_batting_splits", "2026")
const files = readdirSync(dir).filter((f) => f.endsWith(".json"))

const all: Array<Record<string, unknown> & { yahooId: string }> = []
let totalCount = 0
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
    reconciliation?: {
      cellTeamUnresolvedPas?: number
      cellTeamUnresolvedSamples?: Array<Record<string, unknown>>
    }
  }
  const r = j.reconciliation
  if (!r || !r.cellTeamUnresolvedPas) continue
  totalCount += r.cellTeamUnresolvedPas
  for (const s of r.cellTeamUnresolvedSamples ?? []) {
    all.push({ yahooId: f.replace(/^yahoo_/, "").replace(/\.json$/, ""), ...s })
  }
}
console.log(`total cellTeamUnresolvedPas = ${totalCount}`)
console.log(`samples (max 10/batter):`)
for (const s of all) {
  console.log(JSON.stringify(s))
}
