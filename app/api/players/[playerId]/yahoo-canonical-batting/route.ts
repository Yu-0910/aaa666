import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import { compactPlayerName } from "@/lib/playerNameNormalize"
import { parseRosterCsv } from "@/lib/yahooGame/rosterCsv"
import { findBattingLineForNpbPlayer } from "@/lib/yahooGame/battingLineForNpbPlayer"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

export const dynamic = "force-dynamic"

function resolveNpbPlayerIdFromPath(
  pathParam: string,
  roster: ReturnType<typeof parseRosterCsv>
): string | null {
  let decoded = pathParam
  try {
    decoded = decodeURIComponent(pathParam)
  } catch {
    // ignore
  }
  decoded = decoded.normalize("NFC").replace(/^player-/, "")
  const trimmed = decoded.trim()
  const byId = roster.find((r) => r.npbPlayerId === trimmed)
  if (byId) return byId.npbPlayerId
  const c = compactPlayerName(decoded)
  const byName = roster.find((r) => r.compactName === c)
  if (byName) return byName.npbPlayerId
  return null
}

/**
 * Phase 5: 名簿照合済み選手の、取り込み済み canonical 1試合における打撃行
 * GET /api/players/[playerId]/yahoo-canonical-batting?gameId=2021038624
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  const { playerId: rawPlayerId } =
    context.params instanceof Promise ? await context.params : context.params
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get("gameId") || "2021038624"

  const root = getProjectRoot()
  const rosterPath = join(root, "_data", "npb_roster_2026.csv")
  const canonPath = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)

  if (!existsSync(rosterPath)) {
    return NextResponse.json({ matched: false, reason: "no_roster_file" }, { status: 503 })
  }
  if (!existsSync(canonPath)) {
    return NextResponse.json({ matched: false, reason: "no_canonical", gameId })
  }

  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const npbId = resolveNpbPlayerIdFromPath(rawPlayerId, roster)
  if (!npbId) {
    return NextResponse.json({ matched: false, reason: "not_on_roster" })
  }

  let canonical: CanonicalGameDocument
  try {
    canonical = JSON.parse(readFileSync(canonPath, "utf8")) as CanonicalGameDocument
  } catch {
    return NextResponse.json({ matched: false, reason: "canonical_read_error" }, { status: 500 })
  }

  const found = findBattingLineForNpbPlayer(canonical, roster, npbId)
  if (!found) {
    return NextResponse.json({
      matched: false,
      reason: "no_batting_line_in_game",
      gameId,
      npbPlayerId: npbId,
    })
  }

  const { line, teamName } = found
  const meta = canonical.game.meta
  return NextResponse.json({
    matched: true,
    gameId,
    npbPlayerId: npbId,
    documentTitle: meta?.documentTitle ?? "",
    dataSourceNote: "Yahoo試合ページ連携 PoC（canonical・1試合・出場成績由来）",
    playerName: line.playerName,
    team: teamName,
    avg: line.avg ?? null,
    ab: line.ab ?? null,
    r: line.r ?? null,
    h: line.h ?? null,
    hr: line.hr ?? null,
    rbi: line.rbi ?? null,
    so: line.so ?? null,
    bb: line.bb ?? null,
    hbp: line.hbp ?? null,
    sh: line.sh ?? null,
    sb: line.sb ?? null,
  })
}
