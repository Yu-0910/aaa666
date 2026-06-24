/**
 * 佐藤: 実況のみ vs ハイブリッドの塁割当差分
 * npx tsx scripts/diag_sato_text_vs_hybrid.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeForPlateAppearanceHybrid,
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { buildScoreBasesContextByPaId } from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const REF: Record<string, number> = {
  none: 123,
  r1: 48,
  r2: 20,
  r3: 8,
  r12: 14,
  r13: 4,
  r23: 3,
  loaded: 5,
}

function loadSatoGameIds(): string[] {
  const lines = JSON.parse(
    readFileSync(join(root, "_data/diag_sato_play_lines.json"), "utf8"),
  ) as Record<string, string>
  return [...new Set(Object.keys(lines).map((k) => k.split("-")[0]))].sort()
}

function main(): void {
  const textAgg = new Map<string, number>()
  const hybridAgg = new Map<string, number>()
  const changes: string[] = []

  for (const gid of loadSatoGameIds()) {
    const doc = JSON.parse(
      readFileSync(join(CANONICAL, `${gid}.json`), "utf8"),
    ) as CanonicalGameDocument
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    if (!pas.length) continue

    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, gid),
    )

    for (const pa of pas) {
      const playLine = playMap.get(pa.paId)
      const fromText = basesBeforeFromSportsnaviPlayLine(playLine)
      if (!fromText) continue
      const hybrid = basesBeforeForPlateAppearanceHybrid(pa, playLine, scoreCtx.get(pa.paId))
      if (!hybrid) continue

      const textSit = classifySituationAtPaStart(fromText).detail
      const hybridSit = classifySituationAtPaStart(hybrid).detail
      textAgg.set(textSit, (textAgg.get(textSit) ?? 0) + 1)
      hybridAgg.set(hybridSit, (hybridAgg.get(hybridSit) ?? 0) + 1)

      if (textSit !== hybridSit) {
        const ctx = scoreCtx.get(pa.paId)
        const token = extractSportsnaviSituationTokenFromPlayLine(playLine ?? "") ?? "-"
        const result = plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 30)
        changes.push(
          `${pa.paId}\t${textSit}→${hybridSit}\t${token}\tchain=${JSON.stringify(ctx?.chainStart)} last=${JSON.stringify(ctx?.lastClass)}\t${result}`,
        )
      }
    }
  }

  console.log("=== PA count: text-only vs hybrid vs ref ===")
  for (const k of Object.keys(REF)) {
    const t = textAgg.get(k) ?? 0
    const h = hybridAgg.get(k) ?? 0
    const r = REF[k]!
    console.log(
      `${k.padEnd(6)} text=${String(t).padStart(3)} hybrid=${String(h).padStart(3)} ref=${String(r).padStart(3)} | text-ref=${t - r >= 0 ? "+" : ""}${t - r} hybrid-ref=${h - r >= 0 ? "+" : ""}${h - r}`,
    )
  }

  console.log(`\n=== hybrid overrides (${changes.length} PA) ===`)
  for (const c of changes) console.log(c)
}

main()
