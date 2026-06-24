/**
 * 佐藤輝明: スポナビ REF 225打席 vs canonical 237打席 の差分12件を特定
 * npx tsx scripts/diag_sato_teruaki_pa225_vs237.ts
 */
import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import {
  basesBeforeFromScoreIllustration,
  buildScoreBasesContextByPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { loadSportsnaviScoreSnapshots } from "../lib/yahooGame/sportsnaviScoreSnapshotIO"
import { basesBeforeFromSportsnaviPlayLine } from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import { plateAppearanceResolvedResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { comparePaIdChronological } from "../lib/yahooGame/paIdFormat"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const CANONICAL = join(root, "_data/scraped_games/canonical")

/** スポナビ状況別 REF の母数（diag_sato_play_lines = 225打席） */
const REF_PLAY_LINES = JSON.parse(
  readFileSync(join(root, "_data/diag_sato_play_lines.json"), "utf8"),
) as Record<string, string>

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

type PaRec = {
  paId: string
  gameId: string
  gameDate: string
  result: string
  hasPlayLine: boolean
  inRef225: boolean
  score?: string
  text?: string
}

function loadCanonicalPas(): PaRec[] {
  const out: PaRec[] = []
  for (const f of readdirSync(CANONICAL)) {
    if (!f.endsWith(".json")) continue
    const p = join(CANONICAL, f)
    const raw = readFileSync(p, "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    const doc = JSON.parse(raw) as CanonicalGameDocument
    const playMap = buildPaIdToSportsnaviPlayLineMap(doc)
    const title = doc.game?.meta?.documentTitle ?? ""
    const dateM = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    const gameDate = dateM ? `${dateM[1]}-${dateM[2]!.padStart(2, "0")}-${dateM[3]!.padStart(2, "0")}` : "?"
    const allPas = [...(doc.domain.plateAppearances ?? [])].sort((a, b) =>
      comparePaIdChronological(a.paId, b.paId),
    )
    const scoreCtx = buildScoreBasesContextByPaId(
      allPas.map((p) => p.paId),
      loadSportsnaviScoreSnapshots(root, doc.gameId),
    )
    for (const pa of allPas) {
      if ((pa.yahooBatterId ?? "").trim() !== YAHOO) continue
      const paId = pa.paId
      const playLine = playMap.get(paId) ?? ""
      const ctx = scoreCtx.get(paId)
      const scoreB = basesBeforeFromScoreIllustration(ctx, playLine, pa)
      const textB = basesBeforeFromSportsnaviPlayLine(playLine)
      out.push({
        paId,
        gameId: doc.gameId,
        gameDate,
        result: plateAppearanceResolvedResultText(doc, pa).trim(),
        hasPlayLine: playLine.length > 0,
        inRef225: paId in REF_PLAY_LINES,
        score: scoreB ? classifySituationAtPaStart(scoreB).detail : undefined,
        text: textB ? classifySituationAtPaStart(textB).detail : undefined,
      })
    }
  }
  out.sort((a, b) => comparePaIdChronological(a.paId, b.paId))
  return out
}

function main(): void {
  const canonical = loadCanonicalPas()
  const refIds = new Set(Object.keys(REF_PLAY_LINES))
  const canonIds = new Set(canonical.map((p) => p.paId))

  const onlyCanonical = canonical.filter((p) => !p.inRef225)
  const onlyRef = [...refIds].filter((id) => !canonIds.has(id))

  console.log("佐藤輝明 — 225 vs 237 打席差分\n")
  console.log(`diag_sato_play_lines.json (REF母数): ${refIds.size}`)
  console.log(`canonical 全打席:                 ${canonical.length}`)
  console.log(`差分 (canonical - REF):         ${canonical.length - refIds.size}\n`)

  console.log("=== canonical にあって REF225 に無い打席（+12 候補） ===\n")
  console.log("paId\t試合日\tgameId\tscore\ttext\t結果")
  for (const p of onlyCanonical) {
    console.log(
      `${p.paId}\t${p.gameDate}\t${p.gameId}\t${LABEL[p.score ?? "?"] ?? p.score}\t${LABEL[p.text ?? "?"] ?? p.text}\t${p.result.slice(0, 28)}`,
    )
  }
  console.log(`\n件数: ${onlyCanonical.length}`)

  if (onlyRef.length) {
    console.log("\n=== REF225 にあって canonical に無い打席 ===\n")
    for (const id of onlyRef.sort()) {
      console.log(`${id}\t${(REF_PLAY_LINES[id] ?? "").slice(0, 60)}`)
    }
    console.log(`\n件数: ${onlyRef.length}`)
  }

  const byGame = new Map<string, number>()
  for (const p of onlyCanonical) {
    byGame.set(p.gameId, (byGame.get(p.gameId) ?? 0) + 1)
  }
  if (byGame.size) {
    console.log("\n=== 余剰打席の試合別 ===\n")
    for (const [gid, n] of [...byGame.entries()].sort()) {
      const sample = onlyCanonical.find((p) => p.gameId === gid)
      console.log(`${gid} (${sample?.gameDate ?? "?"}): ${n}打席`)
    }
  }

  const REF_COUNTS: Record<string, number> = {
    none: 123, r1: 48, r2: 20, r3: 8, r12: 14, r13: 4, r23: 3, loaded: 5,
  }
  const KEYS = Object.keys(REF_COUNTS)
  for (const scope of ["225のみ", "237全体"] as const) {
    const rows = scope === "225のみ" ? canonical.filter((p) => p.inRef225 && p.score) : canonical.filter((p) => p.score)
    const m = new Map<string, number>()
    for (const p of rows) m.set(p.score!, (m.get(p.score!) ?? 0) + 1)
    let l1 = 0
    for (const k of KEYS) l1 += Math.abs((m.get(k) ?? 0) - REF_COUNTS[k]!)
    console.log(`\n=== ${scope} score_illustration L1(PA) = ${l1} ===`)
    for (const k of KEYS) {
      const d = (m.get(k) ?? 0) - REF_COUNTS[k]!
      if (d !== 0) console.log(`  ${LABEL[k]}: ${d >= 0 ? "+" : ""}${d}`)
    }
  }
}

main()
