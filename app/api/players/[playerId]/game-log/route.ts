import fs from "node:fs"
import path from "node:path"
import {
  decodePlayerPathSegment,
  jsonDerivedResponse,
  yearFromRequest,
} from "@/lib/api/derivedPlayerApiShared"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { getProjectRoot } from "@/lib/projectRoot"
import { getYahooIdForPilotAsync } from "@/lib/seasonStatsPilot"
import { loadCanonicalGameDocument } from "@/lib/yahooGame/loadCanonicalGame"
import { parseRosterCsv } from "@/lib/yahooGame/rosterCsv"
import { findBattingLineForNpbPlayer } from "@/lib/yahooGame/battingLineForNpbPlayer"
import { findPitchingLineForNpbPlayer } from "@/lib/yahooGame/pitcherForNpbPlayer"
import { parseGameDateYmdFromCanonical } from "@/lib/yahooGame/gameDateFromCanonical"

export const dynamic = "force-dynamic"

type PlayerGameLogBatterRow = {
  date: string
  opponent: string
  team: string
  ab: number
  h: number
  hr: number
  rbi: number
  so: number
  bb: number
}

type PlayerGameLogPitcherRow = {
  date: string
  opponent: string
  team: string
  ip: string
  pitches: number
  h: number
  hr: number
  so: number
  bb: number
  r: number
  er: number
}

export type PlayerGameLogApiPayload = {
  role: "batter" | "pitcher"
  batterRows: PlayerGameLogBatterRow[]
  pitcherRows: PlayerGameLogPitcherRow[]
}

export type PlayerGameLogApiResponse = {
  hasData: boolean
  year: string
  payload: PlayerGameLogApiPayload | null
  code?: string
  message?: string
}

function readRosterRows() {
  const rosterPath = path.join(getProjectRoot(), "_data", "npb_roster_2026.csv")
  if (!fs.existsSync(rosterPath)) return []
  return parseRosterCsv(fs.readFileSync(rosterPath, "utf8"))
}

function otherTeamName(teams: Array<{ teamName?: string }>, teamName: string): string {
  return teams.find((team) => String(team.teamName ?? "").trim() !== teamName)?.teamName?.trim() ?? "—"
}

export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> | { playerId: string } },
) {
  try {
    const { playerId } = context.params instanceof Promise ? await context.params : context.params
    const decoded = decodePlayerPathSegment((playerId || "").trim())
    const year = yearFromRequest(request)
    const rosterPlayer = findRosterPlayerByPublicId(decoded)
    const slugEntry = resolvePlayerSlugEntry(decoded)
    const npbPlayerId = rosterPlayer?.npb_player_id ?? slugEntry?.npbPlayerId ?? ""
    if (!npbPlayerId) {
      return jsonDerivedResponse({
        hasData: false,
        year,
        payload: null,
        code: "NOT_FOUND",
      } satisfies PlayerGameLogApiResponse)
    }

    const projectRoot = getProjectRoot()
    const rosterRows = readRosterRows()
    const yahooBatterId = await getYahooIdForPilotAsync(npbPlayerId)
    const battingDerivedPath = yahooBatterId
      ? path.join(projectRoot, "_data", "derived", "player_season_batting", year, `yahoo_${yahooBatterId}.json`)
      : ""
    const pitchingDerivedPath = path.join(
      projectRoot,
      "_data",
      "derived",
      "player_season_pitching_poc",
      year,
      `npb_${npbPlayerId}.json`,
    )

    const batterRows: PlayerGameLogBatterRow[] = []
    const pitcherRows: PlayerGameLogPitcherRow[] = []

    if (battingDerivedPath && fs.existsSync(battingDerivedPath)) {
      const battingDerived = JSON.parse(fs.readFileSync(battingDerivedPath, "utf8")) as {
        source?: { canonicalGames?: string[] }
      }
      for (const gameId of battingDerived.source?.canonicalGames ?? []) {
        const doc = loadCanonicalGameDocument(projectRoot, String(gameId))
        if (!doc) continue
        const hit = findBattingLineForNpbPlayer(doc, rosterRows, npbPlayerId)
        if (!hit) continue
        batterRows.push({
          date: parseGameDateYmdFromCanonical(doc) ?? "",
          opponent: otherTeamName(doc.game?.teams ?? [], hit.teamName),
          team: hit.teamName,
          ab: Number(hit.line.ab ?? 0),
          h: Number(hit.line.h ?? 0),
          hr: Number(hit.line.hr ?? 0),
          rbi: Number(hit.line.rbi ?? 0),
          so: Number(hit.line.so ?? 0),
          bb: Number(hit.line.bb ?? 0),
        })
      }
    }

    if (fs.existsSync(pitchingDerivedPath)) {
      const pitchingDerived = JSON.parse(fs.readFileSync(pitchingDerivedPath, "utf8")) as {
        source?: { canonicalGames?: string[] }
      }
      for (const gameId of pitchingDerived.source?.canonicalGames ?? []) {
        const doc = loadCanonicalGameDocument(projectRoot, String(gameId))
        if (!doc) continue
        const hit = findPitchingLineForNpbPlayer(doc, rosterRows, npbPlayerId)
        if (!hit) continue
        pitcherRows.push({
          date: parseGameDateYmdFromCanonical(doc) ?? "",
          opponent: otherTeamName(doc.game?.teams ?? [], hit.teamName),
          team: hit.teamName,
          ip: String(hit.line.ip ?? "0"),
          pitches: Number(hit.line.pitches ?? 0),
          h: Number(hit.line.h ?? 0),
          hr: Number(hit.line.hr ?? 0),
          so: Number(hit.line.so ?? 0),
          bb: Number(hit.line.bb ?? 0),
          r: Number(hit.line.r ?? 0),
          er: Number(hit.line.er ?? 0),
        })
      }
    }

    batterRows.sort((a, b) => b.date.localeCompare(a.date))
    pitcherRows.sort((a, b) => b.date.localeCompare(a.date))
    const role = pitcherRows.length > 0 && batterRows.length === 0 ? "pitcher" : "batter"
    const payload: PlayerGameLogApiPayload = {
      role,
      batterRows,
      pitcherRows,
    }
    return jsonDerivedResponse({
      hasData: batterRows.length > 0 || pitcherRows.length > 0,
      year,
      payload: batterRows.length > 0 || pitcherRows.length > 0 ? payload : null,
    } satisfies PlayerGameLogApiResponse)
  } catch {
    return jsonDerivedResponse(
      {
        hasData: false,
        year: yearFromRequest(request),
        payload: null,
        code: "SERVER_ERROR",
        message: "Failed to load player game logs",
      } satisfies PlayerGameLogApiResponse,
      { status: 500 },
    )
  }
}

