/**
 * Phase 26 診断: vs_hand 合計が phase11 通算を上回る (negative gap) 打者の根因を試合単位で分類する。
 *
 * 入力:
 *   - --year <year>           対象シーズン (default 2026)
 *   - --batter <yahooBatterId> 対象打者 ID（複数指定可）
 *   - --top <n>                指定なしのときは audit ファイルから top N を抽出
 *
 * 出力:
 *   _data/derived/audit/vs_hand_negative_delta_{year}.json
 *
 *   各打者×試合の以下を JSON で書き出す:
 *     - hasBattingLine          : battingLines にこの打者の行があるか
 *     - canonicalPaCount        : plateAppearances 内の当該打者件数（dedup 前）
 *     - canonicalPaIds          : 同上の paId 一覧
 *     - canonicalPaUniqIds      : paId set サイズ（重複検出用）
 *     - canonicalPaInnHalfOrder : inning-half-order キーの set（vs_hand dedup と同等）
 *     - dedupSurvivors          : dedupePlateAppearancesByInningHalfOrder 通過数
 *     - textFallbackUsed        : buildTextFallbackPlateAppearances を起動するか
 *     - textFallbackAddedPaIds  : テキストから足された paId のうち paMap に無かったもの
 *
 * 実行:
 *   npx tsx scripts/diag_negative_delta_batters.ts --year 2026 --top 30
 *   npx tsx scripts/diag_negative_delta_batters.ts --year 2026 --batter 2000099
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import {
  dedupePlateAppearancesByInningHalfOrder,
  mergePhase10RestoredIntoDocIfPresent,
} from "../lib/seasonStatsPilot"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Args = { year: string; batters: string[]; top: number }

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let year = "2026"
  const batters: string[] = []
  let top = 30
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--batter" && args[i + 1]) {
      batters.push(args[i + 1]!)
      i++
    } else if (args[i] === "--top" && args[i + 1]) {
      top = parseInt(args[i + 1]!, 10) || 30
      i++
    }
  }
  return { year, batters, top }
}

function loadAuditNegativeBatters(year: string, top: number): string[] {
  const p = join(projectRoot, "_data", "derived", "audit", `vs_hand_audit_${year}.json`)
  if (!existsSync(p)) return []
  try {
    const doc = JSON.parse(readFileSync(p, "utf8")) as {
      topGapPlayers?: Array<{ yahooBatterId: string; gap: { pa: number }; hasNegativeGap?: boolean }>
    }
    const list = (doc.topGapPlayers ?? [])
      .filter((r) => r?.hasNegativeGap === true || (r?.gap && Number(r.gap.pa) < 0))
      .sort((a, b) => Number(a.gap?.pa ?? 0) - Number(b.gap?.pa ?? 0)) // 最も負が大きい (gap=-3) が先頭
      .map((r) => String(r.yahooBatterId))
    return list.slice(0, top)
  } catch {
    return []
  }
}

function inningHalfOrderKey(paId: string, gameId: string): string {
  if (!paId.startsWith(`${gameId}-`)) return paId
  const tail = paId.slice(gameId.length + 1)
  const parts = tail.split("-")
  if (parts.length < 3) return paId
  const inn = parts[0]!
  const half = parts[1]!
  const orderStr = parts.slice(2).join("-")
  const ord = parseInt(orderStr, 10)
  if (!Number.isFinite(ord)) return paId
  return `${inn}-${half}-${ord}`
}

function compact(s: string): string {
  return String(s ?? "").replace(/\s/g, "").replace(/　/g, "")
}

function main(): void {
  const { year, batters, top } = parseArgs()
  const targetBatters = batters.length > 0 ? batters : loadAuditNegativeBatters(year, top)
  if (targetBatters.length === 0) {
    console.error("[diag:negative-delta] no target batters (provide --batter or run audit:vs-hand-full first)")
    process.exit(2)
  }

  const docs0 = loadCanonicalGames(projectRoot)
  const docs = docs0.map((d) => mergePhase10RestoredIntoDocIfPresent(d))
  const docByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) docByGameId.set(String(d.gameId ?? ""), d)

  type GameDetail = {
    gameId: string
    hasBattingLine: boolean
    battingLineP0: { pa: number; ab: number; bb: number; hbp: number; sh: number } | null
    canonicalPaCount: number
    canonicalPaIds: string[]
    canonicalPaUniqIds: number
    canonicalInnHalfOrderKeys: string[]
    canonicalInnHalfOrderUniq: number
    dedupSurvivors: number
    dedupSurvivorPaIds: string[]
    /** PA 経路 P0（dedup 後・結果有り） */
    paP0: { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number }
    textFallbackUsed: boolean
    textFallbackTotal: number
    textFallbackAddedPaIds: string[]
  }
  type BatterReport = {
    yahooBatterId: string
    batterName: string
    games: GameDetail[]
    summary: {
      gamesWithPa: number
      gamesWithoutBattingLine: number
      totalCanonicalPaCount: number
      totalDedupSurvivors: number
      totalTextFallbackAdded: number
      totalDuplicatePaIds: number
      totalDuplicateInnHalfOrderKeys: number
    }
  }

  const reports: BatterReport[] = []

  for (const bid of targetBatters) {
    const games: GameDetail[] = []
    let batterName = ""
    let gamesWithPa = 0
    let gamesWithoutBattingLine = 0
    let totalCanonicalPaCount = 0
    let totalDedupSurvivors = 0
    let totalTextFallbackAdded = 0
    let totalDuplicatePaIds = 0
    let totalDuplicateInnHalfOrderKeys = 0

    for (const doc of docs) {
      const gameId = String(doc.gameId ?? "")
      if (!gameId) continue
      const mentioned = doc.game?.yahooPlayersMentioned ?? {}
      const nm = String(mentioned[bid] ?? "").trim()
      if (nm && !batterName) batterName = nm

      const allPas = doc.domain?.plateAppearances ?? []
      const myPas = allPas.filter((p) => String(p.yahooBatterId ?? "").trim() === bid)
      if (myPas.length === 0) continue
      gamesWithPa += 1
      totalCanonicalPaCount += myPas.length

      const paIds = myPas.map((p) => String(p.paId ?? ""))
      const paIdSet = new Set(paIds)
      const innHalfOrderKeys = paIds.map((id) => inningHalfOrderKey(id, gameId))
      const innHalfOrderSet = new Set(innHalfOrderKeys)

      if (paIds.length !== paIdSet.size) totalDuplicatePaIds += paIds.length - paIdSet.size
      if (innHalfOrderKeys.length !== innHalfOrderSet.size) {
        totalDuplicateInnHalfOrderKeys += innHalfOrderKeys.length - innHalfOrderSet.size
      }

      const survivors = dedupePlateAppearancesByInningHalfOrder(myPas, gameId)
      totalDedupSurvivors += survivors.length
      const survivorIds = survivors.map((p) => String(p.paId ?? ""))

      const battingLine = (doc.domain?.battingLines ?? []).find(
        (l) => String(l.yahooPlayerId ?? "").trim() === bid,
      )
      const hasBattingLine = Boolean(battingLine)
      if (!hasBattingLine) gamesWithoutBattingLine += 1

      const battingLineP0 = battingLine
        ? {
            pa:
              (battingLine.ab ?? 0) +
              (battingLine.bb ?? 0) +
              (battingLine.hbp ?? 0) +
              (battingLine.sh ?? 0),
            ab: battingLine.ab ?? 0,
            bb: battingLine.bb ?? 0,
            hbp: battingLine.hbp ?? 0,
            sh: battingLine.sh ?? 0,
          }
        : null

      // PA 経路 P0（dedup 後・結果有り、vs_hand と同条件）
      const paP0 = { pa: 0, ab: 0, bb: 0, hbp: 0, sh: 0, sf: 0 }
      for (const pa of survivors) {
        const last = String(pa.resultSummaryJa ?? "").trim() ||
          (Array.isArray(pa.pitchEvents) && pa.pitchEvents.length > 0
            ? String(pa.pitchEvents[pa.pitchEvents.length - 1]?.resultJa ?? "").trim()
            : "")
        if (!last) continue
        paP0.pa += 1
        if (/四球|敬遠|申告敬遠/.test(last)) paP0.bb += 1
        if (/死球/.test(last)) paP0.hbp += 1
        if (/犠打|送りバント/.test(last)) paP0.sh += 1
        if (/犠飛|犠牲フライ|犠牲飛/.test(last)) paP0.sf += 1
        // ab approximation: PA - BB - HBP - SH - SF
      }
      paP0.ab = Math.max(0, paP0.pa - paP0.bb - paP0.hbp - paP0.sh - paP0.sf)

      // 簡易: textFallback の起動条件は「battingLine が無い」かつ batterName が引ける
      const textFallbackUsed = !hasBattingLine && Boolean(batterName)
      // 実際に追加された数を再現するのは重いので、survivors と canonical の差分で代替
      let textFallbackTotal = 0
      const textFallbackAddedPaIds: string[] = []
      if (textFallbackUsed) {
        const keyBatter = compact(batterName)
        const secs = doc.game?.textPlayByPlay ?? []
        for (const sec of secs) {
          const title = String(sec?.sectionTitle ?? "").trim()
          const m = title.match(/^(\d+)回(表|裏)$/)
          if (!m) continue
          const inning = m[1]
          const half = m[2]
          for (const line of sec.lines ?? []) {
            const s = String(line ?? "")
            const om = s.match(/^\s*(\d+)\s*[：:]/u)
            if (!om?.[1]) continue
            const mName = s.match(/^\s*\d+\s*[：:]\s*\d+番\s*([^\s]+)\s*([^\s]+)/u)
            const joined =
              mName?.[1] && mName?.[2] ? compact(`${mName[1]}${mName[2]}`) : compact(s)
            if (!joined.includes(keyBatter)) continue
            textFallbackTotal += 1
            const order = String(om[1])
            const paId = `${gameId}-${inning}-${half}-${order}`
            if (!paIdSet.has(paId)) textFallbackAddedPaIds.push(paId)
          }
        }
        totalTextFallbackAdded += textFallbackAddedPaIds.length
      }

      games.push({
        gameId,
        hasBattingLine,
        battingLineP0,
        canonicalPaCount: myPas.length,
        canonicalPaIds: paIds,
        canonicalPaUniqIds: paIdSet.size,
        canonicalInnHalfOrderKeys: innHalfOrderKeys,
        canonicalInnHalfOrderUniq: innHalfOrderSet.size,
        dedupSurvivors: survivors.length,
        dedupSurvivorPaIds: survivorIds,
        paP0,
        textFallbackUsed,
        textFallbackTotal,
        textFallbackAddedPaIds,
      })
    }

    reports.push({
      yahooBatterId: bid,
      batterName,
      games,
      summary: {
        gamesWithPa,
        gamesWithoutBattingLine,
        totalCanonicalPaCount,
        totalDedupSurvivors,
        totalTextFallbackAdded,
        totalDuplicatePaIds,
        totalDuplicateInnHalfOrderKeys,
      },
    })
  }

  const outDir = join(projectRoot, "_data", "derived", "audit")
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `vs_hand_negative_delta_${year}.json`)
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        year,
        targetBatters,
        reports,
      },
      null,
      2,
    ),
    "utf8",
  )
  console.log(`[diag:negative-delta] wrote ${outPath}`)
  // print short summary
  for (const r of reports) {
    console.log(
      `  yahoo_${r.yahooBatterId} ${r.batterName}: gamesWithPa=${r.summary.gamesWithPa}, ` +
        `gamesWithoutBattingLine=${r.summary.gamesWithoutBattingLine}, ` +
        `canonicalPa=${r.summary.totalCanonicalPaCount} → dedupSurvivors=${r.summary.totalDedupSurvivors}, ` +
        `textFallbackAdded=${r.summary.totalTextFallbackAdded}, ` +
        `dupPaIds=${r.summary.totalDuplicatePaIds}, dupInnHalfOrderKeys=${r.summary.totalDuplicateInnHalfOrderKeys}`,
    )
  }
}

main()
