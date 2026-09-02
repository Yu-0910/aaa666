import { loadPlayerProfileMergedForInitialHtml, type PlayerProfileMergedPayload } from "@/lib/playerProfileMergedServer"
import { resolvePlayerSlugEntry } from "@/lib/playerSlug.server"
import { TEAM_CODE_TO_SHORT } from "@/lib/standings/teamCodes"
import { fetchDisplayJsonServer } from "@/lib/ranking/fetchDisplayJsonServer"
import CompactProbablesBoard, { type BoardMatchup } from "./CompactProbablesBoard"
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

export const dynamic = "force-dynamic"

function teamNameFromCode(code: string): string {
  return TEAM_CODE_TO_SHORT[code] ?? code
}

function byPreferredOrder(a: ProbableBoardPlayer, b: ProbableBoardPlayer): number {
  return PREFERRED_ORDER.indexOf(a.teamCode) - PREFERRED_ORDER.indexOf(b.teamCode)
}

async function buildBoardPlayer(input: {
  probable: {
    pitcherNameJa?: string
    pitcherPublicId?: string
    teamCode?: string
  } | null | undefined
  teamCode: string
  opponentTeamCode: string
  homeAway: "home" | "away"
}): Promise<ProbableBoardPlayer | null> {
  const publicId = String(input.probable?.pitcherPublicId ?? "").trim()
  if (!publicId) return null
  const slugEntry = resolvePlayerSlugEntry(publicId)
  const profileMerged = await loadPlayerProfileMergedForInitialHtml({
    playerId: slugEntry?.slug || publicId,
    npbPlayerId: slugEntry?.npbPlayerId || publicId,
  })
  return {
    publicId,
    nameJa: String(input.probable?.pitcherNameJa ?? slugEntry?.nameJa ?? publicId).trim(),
    teamCode: input.teamCode,
    teamName: teamNameFromCode(input.teamCode),
    opponentTeamCode: input.opponentTeamCode,
    opponentTeamName: teamNameFromCode(input.opponentTeamCode),
    homeAway: input.homeAway,
    dayNight: "night",
    gameDateJst: TARGET_DATE,
    profileMerged,
  }
}

async function loadBoardMatchups(): Promise<BoardMatchup[]> {
  const snapshot = await fetchDisplayJsonServer<TopProbablesSnapshot>(
    "/data/top-probables/2026/current.json"
  )
  if (!snapshot) return []
  const matchups: BoardMatchup[] = []

  for (const card of snapshot.cards ?? []) {
    for (const game of card.games ?? []) {
      if ((game.dateJst ?? "") !== TARGET_DATE) continue
      const homeTeamCode = game.homeProbable?.teamCode ?? game.homeTeamCode ?? ""
      const awayTeamCode = game.awayProbable?.teamCode ?? game.awayTeamCode ?? ""
      if (!TARGET_TEAM_CODES.has(homeTeamCode) || !TARGET_TEAM_CODES.has(awayTeamCode)) continue

      const homePlayer = await buildBoardPlayer({
        probable: game.homeProbable,
        teamCode: homeTeamCode,
        opponentTeamCode: awayTeamCode,
        homeAway: "home",
      })
      const awayPlayer = await buildBoardPlayer({
        probable: game.awayProbable,
        teamCode: awayTeamCode,
        opponentTeamCode: homeTeamCode,
        homeAway: "away",
      })
      if (!homePlayer || !awayPlayer) continue

      const ordered = [homePlayer, awayPlayer].sort(byPreferredOrder)
      matchups.push({
        gameId: String(game.gameId ?? `${ordered[0].teamCode}-${ordered[1].teamCode}`),
        gameDateJst: TARGET_DATE,
        matchupLabel: `${ordered[0].teamName} vs ${ordered[1].teamName}`,
        leftPlayer: ordered[0],
        rightPlayer: ordered[1],
      })
    }
  }

  return matchups.sort((a, b) => byPreferredOrder(a.leftPlayer, b.leftPlayer))
}

export default async function CompactClProbablesPage() {
  const matchups = await loadBoardMatchups()
  return <CompactProbablesBoard matchups={matchups} />
}
