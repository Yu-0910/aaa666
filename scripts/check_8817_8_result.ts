import { readFileSync } from "fs"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { hitBases } from "../lib/yahooGame/resultJaHitBases"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const doc = JSON.parse(
  readFileSync("_data/scraped_games/canonical/2021038817.json", "utf8"),
) as CanonicalGameDocument
const pa = doc.domain.plateAppearances?.find((p) => p.paId === "2021038817-8-表-5")
if (!pa) throw new Error("pa not found")
const r = plateAppearanceResolvedResultText(doc, pa)
console.log("resolved:", JSON.stringify(r))
console.log("summary:", pa.resultSummaryJa)
console.log("hitBases resolved:", hitBases(r))
console.log("hitBases summary:", hitBases(pa.resultSummaryJa ?? ""))
