/**
 * Phase11（個人成績: plateAppearances 由来）と、出場成績テーブル（battingLines）合算の整合性チェック。
 *
 * 目的:
 * - 「同じ選手・同じ期間に AB が 72 と 73 のように二系統でズレる」ケースを早期に検知する
 * - `捕２` のような打席結果略記の取りこぼしで H がズレるケースを検知する
 * - 一球ログ復元や表記ゆれが入ったときに、どの選手が影響を受けたか可視化する
 *
 * 使い方:
 *   tsx scripts/validate_phase11_vs_batting_lines_totals.ts --year 2026
 *
 * 注意:
 * - battingLines 側が欠損している試合（missingOrPartial 等）があると、battingLines 合算は「部分和」になる。
 *   そのため本スクリプトは「両方が揃っているゲームのみ」を対象に比較する（= false positive を避ける）。
 */

import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import {
  aggregateBattingSeasonByYahooBatter,
  aggregateBattingSeasonByYahooBatterFromBattingLines,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

function parseArgs(): { year: string; from: string; to: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  let from = ""
  let to = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--from" && args[i + 1]) {
      from = String(args[i + 1]).trim()
      i++
    } else if (args[i] === "--to" && args[i + 1]) {
      to = String(args[i + 1]).trim()
      i++
    }
  }
  return { year, from, to }
}

function hasAnyBattingLines(doc: CanonicalGameDocument): boolean {
  return (doc.domain?.battingLines?.length ?? 0) > 0
}
function hasAnyPlateAppearances(doc: CanonicalGameDocument): boolean {
  return (doc.domain?.plateAppearances?.length ?? 0) > 0
}

function main(): void {
  const { year, from, to } = parseArgs()
  const projectRoot = process.cwd()
  const docsAll = loadCanonicalGames(projectRoot, { year, from: from || undefined, to: to || undefined })

  // 両方が揃っている試合のみ比較対象（同じ入力集合に揃える）
  const docs = docsAll.filter((d) => hasAnyBattingLines(d) && hasAnyPlateAppearances(d))
  if (docs.length === 0) {
    console.error(
      `[validate_phase11_vs_batting_lines_totals] no comparable games found (year=${year}).`,
    )
    process.exit(1)
  }

  const byPa = aggregateBattingSeasonByYahooBatter(docs)
  const byLines = aggregateBattingSeasonByYahooBatterFromBattingLines(docs)

  const batterIds = new Set<string>([...byPa.keys(), ...byLines.keys()])
  const mismatches: Array<{
    yahooBatterId: string
    gPa: number
    abPa: number
    hPa: number
    pa: number
    gLines: number
    abLines: number
    hLines: number
    paApproxLines: number
  }> = []

  for (const bid of [...batterIds].sort()) {
    const a = byPa.get(bid)
    const b = byLines.get(bid)
    if (!a || !b) continue
    // 出場成績行は PA を近似で持つため、比較の主対象は AB / H。
    if (a.ab !== b.ab || a.h !== b.h) {
      mismatches.push({
        yahooBatterId: bid,
        gPa: a.gameIds.size,
        abPa: a.ab,
        hPa: a.h,
        pa: a.pa,
        gLines: b.gameIds.size,
        abLines: b.ab,
        hLines: b.h,
        paApproxLines: b.pa,
      })
    }
  }

  if (mismatches.length === 0) {
    console.log(
      `[validate_phase11_vs_batting_lines_totals] OK (year=${year}${from || to ? ` range=${from || "(start)"}..${to || "(end)"}` : ""}): no AB/H mismatches on comparable games (n=${docs.length}).`,
    )
    return
  }

  console.log(
    `[validate_phase11_vs_batting_lines_totals] AB/H mismatch batters: ${mismatches.length} (comparable games n=${docs.length}${from || to ? ` range=${from || "(start)"}..${to || "(end)"}` : ""})`,
  )
  for (const m of mismatches) {
    console.log(
      `  yahooBatterId=${m.yahooBatterId}  PA(ab=${m.abPa},h=${m.hPa},pa=${m.pa},g=${m.gPa})  battingLines(ab=${m.abLines},h=${m.hLines},pa~=${m.paApproxLines},g=${m.gLines})`,
    )
  }

  process.exit(1)
}

main()

