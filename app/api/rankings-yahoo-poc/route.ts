import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"
import { parseRosterCsv } from "@/lib/yahooGame/rosterCsv"
import { buildPocRankingRowsFromCanonical } from "@/lib/yahooGame/pocRankingFromCanonical"
import { isYahooPocRankingApiDisabled } from "@/lib/yahooGame/yahooPhase8Policy"

export const dynamic = "force-dynamic"

/**
 * Phase 4 PoC: canonical 試合JSON + 名簿からランキング行を返す（打撃・1試合分）
 * GET /api/rankings-yahoo-poc?season=2026&league=CL&metric=打率&gameId=2021038624
 */
export async function GET(req: Request) {
  if (isYahooPocRankingApiDisabled()) {
    return NextResponse.json(
      {
        error:
          "Yahoo PoC API は無効です（環境変数 YAHOO_POC_RANKING_API_DISABLED=1）。計画書 Phase 8 参照。",
        rows: [],
      },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(req.url)
  const season = searchParams.get("season") || "2026"
  const league = (searchParams.get("league") || "CL").toUpperCase()
  const metric = searchParams.get("metric") || "打率"
  const gameId = searchParams.get("gameId") || "2021038624"

  if (league !== "CL") {
    return NextResponse.json(
      { error: "Yahoo PoC は現状セ・リーグ試合のみ（CL）", rows: [] },
      { status: 400 }
    )
  }

  const root = process.cwd()
  const canonPath = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  const rosterPath = join(root, "_data", "npb_roster_2026.csv")

  if (!existsSync(canonPath)) {
    return NextResponse.json(
      { error: `canonical がありません: ${canonPath}（先に ingest:yahoo:canonical）`, rows: [] },
      { status: 404 }
    )
  }
  if (!existsSync(rosterPath)) {
    return NextResponse.json(
      { error: `名簿がありません: ${rosterPath}`, rows: [] },
      { status: 404 }
    )
  }

  let canonical: CanonicalGameDocument
  try {
    canonical = JSON.parse(readFileSync(canonPath, "utf8")) as CanonicalGameDocument
  } catch {
    return NextResponse.json({ error: "canonical JSON の読み込みに失敗", rows: [] }, { status: 500 })
  }

  if (canonical.schemaVersion !== "yahoo-game-canonical-v1") {
    return NextResponse.json({ error: "schemaVersion が不正", rows: [] }, { status: 400 })
  }

  const rosterText = readFileSync(rosterPath, "utf8")
  const roster = parseRosterCsv(rosterText)
  const rows = buildPocRankingRowsFromCanonical(canonical, roster, metric)

  return NextResponse.json(rows, {
    headers: {
      "Cache-Control": "no-store",
      "X-Yahoo-Poc-Game": gameId,
      "X-Yahoo-Poc-Season": season,
    },
  })
}
