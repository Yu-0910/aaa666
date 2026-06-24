/**
 * 佐藤輝明: なし+7 の原因 — score=text=なし だが chain/em≠なし
 * npx tsx scripts/diag_sato_teruaki_none_gap.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const CANONICAL = join(root, "_data/scraped_games/canonical")

function sit(b: { r1: boolean; r2: boolean; r3: boolean } | null | undefined): string {
  return b ? classifySituationAtPaStart(b).detail : "?"
}

function loadDocs(): CanonicalGameDocument[] {
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const raw = readFileSync(join(CANONICAL, f), "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    out.push(JSON.parse(raw) as CanonicalGameDocument)
  }
  return out
}

function main(): void {
  console.log("=== 走者なしトークン & chain/em≠なし（なし過剰候補） ===\n")
  for (const doc of loadDocs()) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of pas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = scoreCtx.get(pa.paId)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      const scoreB = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      if (!textB || !scoreB) continue
      const textK = classifySituationAtPaStart(textB).detail
      const scoreK = classifySituationAtPaStart(scoreB).detail
      if (textK !== "none" || scoreK !== "none") continue
      const chainK = sit(ctx?.chainStart)
      const emK = sit(ctx?.firstEm)
      if (chainK === "none" && emK !== "?" && emK === "none") continue
      if (chainK === "none" && !ctx?.firstEm) continue
      const token = extractSportsnaviSituationTokenFromPlayLine(playLine) ?? "-"
      if (!/走者なし/.test(token)) continue
      console.log(
        `${pa.paId}\tchain=${chainK}\tem=${emK}\t${token}\t${plateAppearanceResolvedResultText(doc, pa).trim().slice(0, 24)}`,
      )
    }
  }

  console.log("\n=== 10件の補正 — 元に戻すと L1 への影響（シミュレーション） ===\n")
  const OVERRIDE_PA = [
    "2021038660-9-表-4",
    "2021038683-3-裏-3",
    "2021038695-1-表-4",
    "2021038739-3-裏-4",
    "2021038812-1-表-4",
    "2021038812-3-表-3",
    "2021038874-8-裏-3",
    "2021038879-7-裏-4",
    "2021038973-1-裏-4",
    "2021038973-3-裏-4",
  ]
  const REF: Record<string, number> = {
    none: 123, r1: 48, r2: 20, r3: 8, r12: 14, r13: 4, r23: 3, loaded: 5,
  }
  const KEYS = ["none", "r1", "r2", "r3", "r12", "r13", "r23", "loaded"] as const
  const assign = new Map<string, string>()

  for (const doc of loadDocs()) {
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const pas = allPas.filter((p) => (p.yahooBatterId ?? "").trim() === YAHOO)
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of pas) {
      const playLine = playMap.get(pa.paId) ?? ""
      const ctx = scoreCtx.get(pa.paId)
      const scoreB = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      if (!scoreB || !textB) continue
      assign.set(
        pa.paId,
        OVERRIDE_PA.includes(pa.paId)
          ? classifySituationAtPaStart(textB).detail
          : classifySituationAtPaStart(scoreB).detail,
      )
    }
  }

  function l1(m: Map<string, string>): number {
    const c = new Map<string, number>()
    for (const s of m.values()) c.set(s, (c.get(s) ?? 0) + 1)
    let d = 0
    for (const k of KEYS) d += Math.abs((c.get(k) ?? 0) - REF[k])
    return d
  }
  console.log("10件補正を text に戻す → L1=", l1(assign))
}

main()
