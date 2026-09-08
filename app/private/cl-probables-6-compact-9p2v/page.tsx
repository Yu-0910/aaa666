import { readFile } from "node:fs/promises"
import path from "node:path"
import { loadPlayerProfileMergedForInitialHtml, type PlayerProfileMergedPayload } from "@/lib/playerProfileMergedServer"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { TEAM_CODE_TO_SHORT } from "@/lib/standings/teamCodes"
import CompactProbablesBoard from "./CompactProbablesBoard"
import type { Metadata } from "next"

type TopProbablesSnapshot = {
  asOfDateJst?: string
  cards?: Array<{
    games?: Array<{
      dateJst?: string
      gameId?: string
      homeTeamCode?: string
      awayTeamCode?: string
      homeProbable?: {
        teamCode?: string
        pitcherNameJa?: string
        pitcherPublicId?: string
      }
      awayProbable?: {
        teamCode?: string
        pitcherNameJa?: string
        pitcherPublicId?: string
      }
    }>
  }>
}

type ProbableBoardPlayer = {
  publicId: string
  nameJa: string
  teamCode: string
  teamName: string
  opponentTeamCode: string
  opponentTeamName: string
  homeAway: "home" | "away"
  dayNight: "day" | "night"
  gameDateJst: string
  profileMerged: PlayerProfileMergedPayload | null
}

const TARGET_DATE = "2026-09-02"
const TARGET_TEAM_CODES = new Set(["H", "G", "DB", "S", "D", "C"])
const PREFERRED_ORDER = ["H", "S", "G", "DB", "D", "C"]

export const metadata: Metadata = {
  title: "CL Probables Compact Board",
  robots: {
    index: false,
    follow: false,
  },
}

function teamNameFromCode(code: string): string {
  return TEAM_CODE_TO_SHORT[code] ?? code
}

function byPreferredOrder(a: ProbableBoardPlayer, b: ProbableBoardPlayer): number {
  return PREFERRED_ORDER.indexOf(a.teamCode) - PREFERRED_ORDER.indexOf(b.teamCode)
}

async function loadBoardPlayers(): Promise<ProbableBoardPlayer[]> {
  const filePath = path.join(process.cwd(), "public", "data", "top-probables", "2026", "current.json")
  const snapshot = JSON.parse(await readFile(filePath, "utf8")) as TopProbablesSnapshot
  const players: ProbableBoardPlayer[] = []

  for (const card of snapshot.cards ?? []) {
    for (const game of card.games ?? []) {
      if ((game.dateJst ?? "") !== TARGET_DATE) continue
      const probablePairs = [
        {
          slot: game.homeProbable,
          teamCode: game.homeProbable?.teamCode ?? game.homeTeamCode ?? "",
          opponentTeamCode: game.awayTeamCode ?? "",
          homeAway: "home" as const,
        },
        {
          slot: game.awayProbable,
          teamCode: game.awayProbable?.teamCode ?? game.awayTeamCode ?? "",
          opponentTeamCode: game.homeTeamCode ?? "",
          homeAway: "away" as const,
        },
      ]

      for (const probable of probablePairs) {
        if (!TARGET_TEAM_CODES.has(probable.teamCode)) continue
        const publicId = String(probable.slot?.pitcherPublicId ?? "").trim()
        if (!publicId) continue
        const slugEntry = resolvePlayerSlugEntry(publicId)
        const profileMerged = await loadPlayerProfileMergedForInitialHtml({
          playerId: slugEntry?.slug || publicId,
          npbPlayerId: slugEntry?.npbPlayerId || publicId,
        })
        players.push({
          publicId,
          nameJa: String(probable.slot?.pitcherNameJa ?? slugEntry?.nameJa ?? publicId).trim(),
          teamCode: probable.teamCode,
          teamName: teamNameFromCode(probable.teamCode),
          opponentTeamCode: probable.opponentTeamCode,
          opponentTeamName: teamNameFromCode(probable.opponentTeamCode),
          homeAway: probable.homeAway,
          dayNight: "night",
          gameDateJst: TARGET_DATE,
          profileMerged,
        })
      }
    }
  }

  return players.sort(byPreferredOrder)
}

export default async function CompactClProbablesPage() {
  const players = await loadBoardPlayers()
  return <CompactProbablesBoard players={players} />
}
