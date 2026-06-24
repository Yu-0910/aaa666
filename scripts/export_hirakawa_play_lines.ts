import { writeFileSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const Y = "2110164"
const out: Record<string, string> = {}
const dir = join(root, "_data", "scraped_games", "canonical")
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue
  const raw = readFileSync(join(dir, f), "utf8")
  if (!raw.includes(`"yahooBatterId": "${Y}"`)) continue
  const doc = JSON.parse(raw) as CanonicalGameDocument
  const m = buildPaIdToSportsnaviPlayLineMap(doc)
  for (const pa of doc.domain?.plateAppearances ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== Y) continue
    const line = m.get(pa.paId)
    if (line) out[pa.paId] = line
  }
}
writeFileSync(join(root, "_data", "diag_hirakawa_play_lines.json"), JSON.stringify(out))
console.log("lines", Object.keys(out).length)
