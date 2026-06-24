import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  plateAppearanceResolvedResultText,
  preferSummaryWhenAppearancePositionTwoIsOutNote,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { hitBases } from "../lib/yahooGame/resultJaHitBases"
import { buildAppearanceZipResultOverrides } from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2110164"
const playLines = JSON.parse(
  readFileSync(join(root, "_data/diag_hirakawa_play_lines.json"), "utf8"),
) as Record<string, string>
const gameIds = [...new Set(Object.keys(playLines).map((k) => k.split("-")[0]))]

for (const gid of gameIds) {
  const doc = JSON.parse(
    readFileSync(join(root, "_data/scraped_games/canonical", `${gid}.json`), "utf8"),
  ) as CanonicalGameDocument
  const m = buildAppearanceZipResultOverrides(doc)
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== YAHOO) continue
    const o = m.get(pa.paId)
    if (!o) continue
    const resolved = plateAppearanceResolvedResultText(doc, pa)
    const pref = preferSummaryWhenAppearancePositionTwoIsOutNote(o, pa.resultSummaryJa)
    if (o !== resolved || pref !== o || hitBases(resolved) !== hitBases(o)) {
      console.log(
        pa.paId,
        "app=",
        o,
        "pref=",
        pref,
        "resolved=",
        resolved,
        "summary=",
        pa.resultSummaryJa,
        "hb=",
        hitBases(resolved),
        "hb_app=",
        hitBases(o),
      )
    }
  }
}
