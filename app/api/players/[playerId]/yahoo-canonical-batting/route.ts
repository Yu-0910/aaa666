import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { jsonDerivedResponse, yearFromRequest } from "@/lib/api/derivedPlayerApiShared"
import { compactPlayerName } from "@/lib/playerNameNormalize"
import { getProjectRoot } from "@/lib/projectRoot"
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
 * 名簿照合済み選手の、取り込み済み canonical 1試合における打撃行（計画書 Phase4 応答形）
 * GET /api/players/[playerId]/yahoo-canonical-batting?gameId=2021038624&year=2026
 */
export type YahooCanonicalBattingApiResponse = {
  hasData: boolean
  year: string
  payload: YahooCanonicalBattingPayload | null
  code?: string
  message?: string
}

export type YahooCanonicalBattingPayload =
  | {
      matched: true
      gameId: string
      npbPlayerId: string
      documentTitle: string
      dataSourceNote: string
      playerName: string
      team: string
      avg: string | null
      ab: number | null
      r: number | null
      h: number | null
      hr: number | null
      rbi: number | null
      so: number | null
      bb: number | null
      hbp: number | null
      sh: number | null
      sb: number | null
    }
  | { matched: false; reason: string; gameId?: string; npbPlayerId?: string }

export async function GET(
  req: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  const { playerId: rawPlayerId } =
    context.params instanceof Promise ? await context.params : context.params
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get("gameId") || "2021038624"
  const year = yearFromRequest(req)

  const root = getProjectRoot()
  const rosterPath = join(root, "_data", "npb_roster_2026.csv")
  const canonPath = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)

  if (!existsSync(rosterPath)) {
    return jsonDerivedResponse(
      {
        hasData: false,
        year,
        payload: null,
        code: "NO_ROSTER_FILE",
        message: "名簿 CSV が見つかりません（_data/npb_roster_2026.csv）",
      } satisfies YahooCanonicalBattingApiResponse,
      { status: 503 }
    )
  }
  if (!existsSync(canonPath)) {
    return jsonDerivedResponse({
      hasData: false,
      year,
      payload: { matched: false, reason: "no_canonical", gameId },
    } satisfies YahooCanonicalBattingApiResponse)
  }

  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const npbId = resolveNpbPlayerIdFromPath(rawPlayerId, roster)
  if (!npbId) {
    return jsonDerivedResponse({
      hasData: false,
      year,
      payload: { matched: false, reason: "not_on_roster", gameId },
    } satisfies YahooCanonicalBattingApiResponse)
  }

  let canonical: CanonicalGameDocument
  try {
    canonical = JSON.parse(readFileSync(canonPath, "utf8")) as CanonicalGameDocument
  } catch {
    return jsonDerivedResponse(
      {
        hasData: false,
        year,
        payload: null,
        code: "CANONICAL_READ_ERROR",
        message: "canonical JSON の読み込みに失敗しました",
      } satisfies YahooCanonicalBattingApiResponse,
      { status: 500 }
    )
  }

  const found = findBattingLineForNpbPlayer(canonical, roster, npbId)
  if (!found) {
    return jsonDerivedResponse({
      hasData: false,
      year,
      payload: {
        matched: false,
        reason: "no_batting_line_in_game",
        gameId,
        npbPlayerId: npbId,
      },
    } satisfies YahooCanonicalBattingApiResponse)
  }

  const { line, teamName } = found
  const meta = canonical.game.meta
  const body: YahooCanonicalBattingApiResponse = {
    hasData: true,
    year,
    payload: {
      matched: true,
      gameId,
      npbPlayerId: npbId,
      documentTitle: meta?.documentTitle ?? "",
      dataSourceNote: "canonical・1試合・出場成績由来（スポナビ/Yahoo いずれの取り込みでも可）",
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
    },
  } satisfies YahooCanonicalBattingApiResponse
}
