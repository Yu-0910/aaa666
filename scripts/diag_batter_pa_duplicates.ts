/**
 * 指定 Yahoo 打者の plateAppearances を全 canonical で調査する。
 * - 同一試合内で同一 paId が複数回出現するか（重複取得）
 * - 出場成績行（battingLines）の PA 近似と、canonical の打席数・打数（結果テキスト由来）の差
 *
 * 実行: npx tsx scripts/diag_batter_pa_duplicates.ts --yahoo 1860140
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import {
  plateAppearanceLastResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import { isAtBat } from "../lib/yahooGame/resultJaHitBases"
import { mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { yahoo: string } {
  const args = process.argv.slice(2)
  let yahoo = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yahoo" && args[i + 1]) {
      yahoo = args[i + 1]!
      i++
    }
  }
  if (!yahoo) {
    console.error("Usage: tsx scripts/diag_batter_pa_duplicates.ts --yahoo <yahooBatterId>")
    process.exit(1)
  }
  return { yahoo }
}

function paSacFlyCount(bid: string, pas: PlateAppearance[] | undefined): number {
  let n = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const t = plateAppearanceLastResultText(pa)
    if (/犠飛|犠牲フライ|犠牲飛/.test(t)) n += 1
  }
  return n
}

function countPasFromResults(bid: string, pas: PlateAppearance[] | undefined): {
  paWithResult: number
  abFromResult: number
} {
  let paWithResult = 0
  let abFromResult = 0
  for (const pa of pas ?? []) {
    if (String(pa.yahooBatterId ?? "").trim() !== bid) continue
    const t = plateAppearanceLastResultText(pa)
    if (!t) continue
    paWithResult += 1
    if (isAtBat(t)) abFromResult += 1
  }
  return { paWithResult, abFromResult }
}

function main(): void {
  process.chdir(projectRoot)
  const { yahoo: bid } = parseArgs()

  const docs = loadCanonicalGames(projectRoot)
  let totalRaw = 0
  let totalUniquePaIds = 0
  let globalPaWithResult = 0
  let globalAbFromResult = 0
  let linePaApproxSum = 0
  let lineAbSum = 0

  console.log(`[diag_batter_pa_duplicates] yahooBatterId=${bid} games=${docs.length}\n`)

  for (const doc of docs) {
    const merged = mergePhase10RestoredIntoDocIfPresent(doc)
    const gameId = merged.gameId
    const raw = (merged.domain?.plateAppearances ?? []).filter(
      (p) => String(p.yahooBatterId ?? "").trim() === bid,
    )

    const idCounts = new Map<string, number>()
    for (const pa of raw) {
      const id = String(pa.paId ?? "").trim()
      if (!id) continue
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
    }
    const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1)

    const bl = (merged.domain?.battingLines ?? []).find(
      (l) => String(l.yahooPlayerId ?? "").trim() === bid,
    )
    const hasLine = !!bl
    const ab = Math.max(0, Math.trunc(Number(bl?.ab ?? 0)))
    const bb = Math.max(0, Math.trunc(Number(bl?.bb ?? 0)))
    const hbp = Math.max(0, Math.trunc(Number(bl?.hbp ?? 0)))
    const sh = Math.max(0, Math.trunc(Number(bl?.sh ?? 0)))
    const sf = raw.length > 0 ? paSacFlyCount(bid, merged.domain?.plateAppearances) : 0
    const paApprox = hasLine ? ab + bb + hbp + sh + sf : 0

    const { paWithResult, abFromResult } = countPasFromResults(bid, merged.domain?.plateAppearances)

    totalRaw += raw.length
    totalUniquePaIds += idCounts.size
    globalPaWithResult += paWithResult
    globalAbFromResult += abFromResult
    if (hasLine) {
      linePaApproxSum += paApprox
      lineAbSum += ab
    }

    if (raw.length === 0) continue

    const mismatchLine =
      hasLine &&
      (raw.length !== paApprox || ab !== abFromResult || dupIds.length > 0)

    if (mismatchLine || dupIds.length > 0) {
      console.log(`--- game ${gameId} ---`)
      console.log(
        `  battingLine: has=${hasLine} paApprox=${paApprox} (ab+bb+hbp+sh+sf) ab=${ab} bb=${bb} hbp=${hbp} sh=${sh} sf=${sf}`,
      )
      console.log(
        `  plateAppearances: count=${raw.length} uniquePaIds=${idCounts.size} paWithResult=${paWithResult} abFromParsedResults=${abFromResult}`,
      )
      if (dupIds.length > 0) {
        console.log(`  DUPLICATE paId in raw array:`)
        for (const [pid, c] of dupIds) console.log(`    ${pid} x${c}`)
      }
      if (hasLine && raw.length > paApprox) {
        console.log(`  WARN: more PAs than line paApprox (+${raw.length - paApprox})`)
      }
      if (hasLine && raw.length < paApprox) {
        console.log(`  WARN: fewer PAs than line paApprox (-${paApprox - raw.length})`)
      }
      if (hasLine && abFromResult !== ab) {
        console.log(`  WARN: AB from result text (${abFromResult}) != line.ab (${ab})`)
      }
      const ids = raw.map((p) => String(p.paId ?? "").trim()).filter(Boolean)
      console.log(`  paIds: ${ids.slice(0, 12).join(", ")}${ids.length > 12 ? " …" : ""}`)
      console.log("")
    }
  }

  console.log("=== season totals (games with batting line for this batter) ===")
  console.log(`  sum(line paApprox) = ${linePaApproxSum}`)
  console.log(`  sum(line ab)      = ${lineAbSum}`)
  console.log(`  raw PA rows total = ${totalRaw}`)
  console.log(`  unique paId total = ${totalUniquePaIds}`)
  console.log(`  PA w/ result text = ${globalPaWithResult}`)
  console.log(`  AB from results   = ${globalAbFromResult}`)
  if (totalRaw !== totalUniquePaIds) {
    console.log(`\n  GLOBAL: raw rows > unique paIds by ${totalRaw - totalUniquePaIds} (duplicate paId keys)`)
  }
}

main()
