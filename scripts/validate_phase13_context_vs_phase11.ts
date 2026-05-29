/**
 * Phase13 対チーム行が Phase11 同一 SSOT（試合×打者）と一致するか検証する。
 *
 *   npx tsx scripts/validate_phase13_context_vs_phase11.ts --year 2026
 *   npx tsx scripts/validate_phase13_context_vs_phase11.ts --year 2026 --fail
 *   npx tsx scripts/validate_phase13_context_vs_phase11.ts --year 2026 --yahoo 1100097
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  aggregateBattingForBatterInGameForProfiles,
  emptyBattingSeasonAggYahoo,
  mergeBattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { loadCanonicalGamesMergedForDerivedPipeline } from "../lib/yahooGame/loadCanonicalGamesMergedForDerivedPipeline"
import { injectTeamsFromTextPbpIfMissing } from "../lib/yahooGame/inferTeamsFromTextPbp"
import { dedupePlateAppearancesByInningHalfOrder } from "../lib/yahooGame/dedupePlateAppearances"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Row = {
  split_type: string
  split_value: string
  pa: number
  ab: number
  h: number
  r: number
  rbi: number
  e: number
  hr: number
}

function parseArgs(): { year: string; fail: boolean; yahoo: string | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  let yahoo: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]
      i++
    } else if (args[i] === "--fail") {
      fail = true
    } else if ((args[i] === "--yahoo" || args[i] === "--yahoo-id") && args[i + 1]) {
      yahoo = args[i + 1].trim()
      i++
    }
  }
  return { year, fail, yahoo }
}

function resolveStadiumName(_gameId: string): string {
  return "未設定"
}

function contextFromInningHalf(
  doc: CanonicalGameDocument,
  half: string,
): { vsTeamValue: string } | null {
  const sb = doc.game.scoreboard
  if (sb.length < 2) return null
  const visitorName = (sb[0].teamName ?? "").trim()
  const homeName = (sb[1].teamName ?? "").trim()
  if (!visitorName || !homeName) return null
  const isTop = /表/.test(half)
  const isBottom = /裏/.test(half)
  if (!isTop && !isBottom) return null
  return { vsTeamValue: `vs_${isTop ? homeName : visitorName}` }
}

function resolveVsTeamForBatter(doc: CanonicalGameDocument, bid: string): string | null {
  const pas = dedupePlateAppearancesByInningHalfOrder(
    doc.domain?.plateAppearances ?? [],
    doc.gameId,
  )
  const myPa = pas.find((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
  if (myPa) {
    return contextFromInningHalf(doc, String(myPa.inningHalf ?? "").trim())?.vsTeamValue ?? null
  }
  const teams = doc.game.teams ?? []
  if (teams.length >= 2) {
    const onVisitor = (teams[0]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === bid,
    )
    const onHome = (teams[1]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === bid,
    )
    const visitorName = (doc.game.scoreboard[0]?.teamName ?? "").trim()
    const homeName = (doc.game.scoreboard[1]?.teamName ?? "").trim()
    if (onVisitor && !onHome && homeName) return `vs_${homeName}`
    if (onHome && !onVisitor && visitorName) return `vs_${visitorName}`
  }
  return null
}

function recomputeVsTeam(
  docs: CanonicalGameDocument[],
  bid: string,
  vsTeamValue: string,
): { pa: number; ab: number; h: number; r: number; rbi: number; e: number; hr: number; g: number } {
  const agg = emptyBattingSeasonAggYahoo()
  for (const baseDoc of docs) {
    const doc = injectTeamsFromTextPbpIfMissing(baseDoc)
    const vs = resolveVsTeamForBatter(doc, bid)
    if (vs !== vsTeamValue) continue
    const gameAgg = aggregateBattingForBatterInGameForProfiles(doc, bid)
    if (!gameAgg) continue
    mergeBattingSeasonAggYahoo(agg, gameAgg)
  }
  return {
    pa: agg.pa,
    ab: agg.ab,
    h: agg.h,
    r: agg.r,
    rbi: agg.rbi,
    e: agg.e,
    hr: agg.hr,
    g: agg.gameIds.size,
  }
}

function main(): void {
  const { year, fail, yahoo } = parseArgs()
  const docs = loadCanonicalGamesMergedForDerivedPipeline(projectRoot)
  const ctxDir = join(projectRoot, "_data", "derived", "player_season_batting_context", year)
  if (!existsSync(ctxDir)) {
    console.error(`[validate:phase13] missing ${ctxDir}`)
    process.exit(fail ? 1 : 0)
  }

  const files = readdirSync(ctxDir).filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
  let mismatches = 0
  let checked = 0

  for (const f of files) {
    const bid = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
    if (yahoo && bid !== yahoo) continue

    const raw = JSON.parse(readFileSync(join(ctxDir, f), "utf8")) as { rows?: Row[] }
    const vsRows = (raw.rows ?? []).filter((r) => r.split_type === "vs_team")
    for (const row of vsRows) {
      checked++
      const exp = recomputeVsTeam(docs, bid, row.split_value)
      const fields: Array<keyof typeof exp> = ["g", "pa", "ab", "h", "hr", "r", "rbi", "e"]
      const diffs: string[] = []
      for (const key of fields) {
        const got = (row as Record<string, number>)[key] ?? 0
        const want = exp[key]
        if (got !== want) diffs.push(`${key} file=${got} exp=${want}`)
      }
      if (diffs.length > 0) {
        mismatches++
        console.log(
          `[validate:phase13] MISMATCH yahoo_${bid} ${row.split_value} (${row.split_value.replace(/^vs_/, "")})`,
        )
        for (const d of diffs) console.log(`  ${d}`)
      }
    }
  }

  console.log(
    `[validate:phase13] checked ${checked} vs_team rows, mismatches=${mismatches}${yahoo ? ` (yahoo=${yahoo})` : ""}`,
  )
  if (fail && mismatches > 0) process.exit(1)
}

main()
