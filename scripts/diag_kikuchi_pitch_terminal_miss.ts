/**
 * 菊池: 一球あり・決着パース不可の打席一覧
 * npx tsx scripts/diag_kikuchi_pitch_terminal_miss.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  plateAppearanceResultTextFromPitchOnly,
  plateAppearanceResolvedResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "1100082"
const CANONICAL = join(root, "_data/scraped_games/canonical")

const LABEL: Record<string, string> = {
  none: "なし",
  r1: "一塁",
  r2: "二塁",
  r3: "三塁",
  r12: "一二塁",
  r13: "一三塁",
  r23: "二三塁",
  loaded: "満塁",
}

type Row = {
  date: string
  paId: string
  inning: string
  half: string
  sit: string
  appear: string
  pitchCount: number
  allResultJa: string
  resultSummaryJa: string
}

function gameDate(doc: CanonicalGameDocument): string {
  const m = (doc.game?.meta?.documentTitle ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  return m ? m[0]! : "?"
}

function main(): void {
  const miss: Row[] = []

  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const raw = readFileSync(join(CANONICAL, f), "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    const doc = JSON.parse(raw) as CanonicalGameDocument
    const date = gameDate(doc)
    const targets = (doc.domain.plateAppearances ?? [])
      .filter((pa) => (pa.yahooBatterId ?? "").trim() === YAHOO)
      .sort((a, b) => comparePaIdChronological(a.paId, b.paId))
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )

    for (const pa of targets) {
      const pitchCount = (pa.pitchEvents ?? []).length
      const pitch = plateAppearanceResultTextFromPitchOnly(pa).trim()
      if (pitchCount === 0 || pitch) continue

      const playLine = playMap.get(pa.paId) ?? ""
      const basesBefore = basesBeforeFromScoreIllustration(scoreCtx.get(pa.paId), playLine, pa)
      const pm = pa.paId.match(/^\d+-(\d+)-(表|裏)-(\d+)$/)
      miss.push({
        date,
        paId: pa.paId,
        inning: pm?.[1] ?? "?",
        half: pm?.[2] ?? "?",
        sit: basesBefore ? LABEL[classifySituationAtPaStart(basesBefore).detail] ?? "?" : "?",
        appear: plateAppearanceResolvedResultText(doc, pa).trim(),
        pitchCount,
        allResultJa: (pa.pitchEvents ?? []).map((e) => e.resultJa ?? "").join(" → "),
        resultSummaryJa: (pa.resultSummaryJa ?? "").trim(),
      })
    }
  }

  miss.sort((a, b) => comparePaIdChronological(a.paId, b.paId))

  console.log(`菊池涼介 — 一球あり・決着パース不可: ${miss.length}件\n`)
  console.log("日付\t回\tpaId\t状況\t出場成績\t球数\tresultSummaryJa\t一球resultJa列")
  for (const r of miss) {
    console.log(
      `${r.date}\t${r.inning}回${r.half}\t${r.paId}\t${r.sit}\t${r.appear}\t${r.pitchCount}\t${r.resultSummaryJa || "-"}\t${r.allResultJa}`,
    )
  }
}

main()
