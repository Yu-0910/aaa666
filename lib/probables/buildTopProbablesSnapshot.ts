import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  detectThreeGameSeriesFromGames,
  pickRecentThreeGameSeriesCards,
} from "@/lib/probables/detectThreeGameSeries"
import { enrichProbablesCard } from "@/lib/probables/enrichProbablesCard"
import { buildYahooScheduleProbableSlot } from "@/lib/probables/yahooScheduleProbables"
import {
  addDaysYmd,
  loadScheduleGamesInRange,
  readSeasonIndexBuiltAt,
  todayJstYmd,
} from "@/lib/probables/loadScheduleSnapshots"
import { resolvePitcherFromRoster } from "@/lib/probables/resolvePitcherFromRoster"
import { topOpponentBattersFromMatchup } from "@/lib/probables/topOpponentBattersFromMatchup"
import {
  TOP_PROBABLES_SCHEMA_VERSION,
  type TopProbablesCard,
  type TopProbablesGame,
  type TopProbablesPitcherSlot,
  type TopProbablesSnapshot,
} from "@/lib/probables/types"
import { sportingNewsRotationSnapshotPath } from "@/lib/sportingNews/loadRotationUrlsConfig"
import type { SportingNewsRotationSnapshot } from "@/lib/sportingNews/types"
import { teamDisplayNameFromCode } from "@/lib/standings/teamCodes"

function readSnSnapshot(
  projectRoot: string,
  year: string,
  teamCode: string,
): SportingNewsRotationSnapshot | null {
  const p = sportingNewsRotationSnapshotPath(projectRoot, year, teamCode)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SportingNewsRotationSnapshot
  } catch {
    return null
  }
}

function latestSnFetchedAt(
  projectRoot: string,
  year: string,
  teamCodes: string[],
): string | null {
  let latest: string | null = null
  for (const code of teamCodes) {
    const snap = readSnSnapshot(projectRoot, year, code)
    if (!snap?.fetchedAt) continue
    if (!latest || snap.fetchedAt > latest) latest = snap.fetchedAt
  }
  return latest
}

function buildPitcherSlot(
  year: string,
  teamCode: string,
  opponentTeamCode: string,
  dateJst: string,
  snByTeam: Map<string, SportingNewsRotationSnapshot | null>,
  warnings: string[],
): TopProbablesPitcherSlot | null {
  const sn = snByTeam.get(teamCode) ?? null
  if (!sn) return null

  const row = sn.rows.find(
    (r) =>
      r.dateJst === dateJst &&
      (r.opponentTeamCode == null || r.opponentTeamCode === opponentTeamCode),
  )
  if (!row) return null

  const matchupOpponentTeamCode = row.opponentTeamCode ?? opponentTeamCode

  const resolved = row.pitcherNameJa
    ? resolvePitcherFromRoster(row.pitcherNameJa, teamCode)
    : null

  const topOpponentBatters =
    resolved != null
      ? topOpponentBattersFromMatchup(year, resolved.pitcherNpbId, matchupOpponentTeamCode)
      : []

  return {
    teamCode,
    pitcherNameJa: resolved?.pitcherNameJa ?? row.pitcherNameJa,
    pitcherNpbId: resolved?.pitcherNpbId ?? null,
    pitcherPublicId: resolved?.pitcherPublicId ?? null,
    source: "sportingnews",
    topOpponentBatters,
  }
}

async function buildProbableSlotForGame(
  year: string,
  teamCode: string,
  opponentTeamCode: string,
  dateJst: string,
  tomorrowDate: string,
  snByTeam: Map<string, SportingNewsRotationSnapshot | null>,
  warnings: string[],
  projectRoot: string,
): Promise<TopProbablesPitcherSlot | null> {
  if (dateJst === tomorrowDate) {
    return (
      (await buildYahooScheduleProbableSlot(
        year,
        teamCode,
        opponentTeamCode,
        dateJst,
        projectRoot,
        true,
      )) ?? buildPitcherSlot(year, teamCode, opponentTeamCode, dateJst, snByTeam, warnings)
    )
  }
  return buildPitcherSlot(year, teamCode, opponentTeamCode, dateJst, snByTeam, warnings)
}

export async function buildTopProbablesSnapshot(options: {
  year: string
  projectRoot?: string
  asOfDateJst?: string
}): Promise<TopProbablesSnapshot> {
  const projectRoot = options.projectRoot ?? getProjectRoot()
  const year = options.year
  const asOfDateJst = options.asOfDateJst ?? todayJstYmd()
  const warnings: string[] = []

  // 3連戦は今日をまたぐと開始日が 2 日前になることがあるため、2 日前まで遡る。
  const from = addDaysYmd(asOfDateJst, -2)
  const to = addDaysYmd(asOfDateJst, 14)
  const tomorrowDate = addDaysYmd(asOfDateJst, 1)
  const scheduleGames = loadScheduleGamesInRange(projectRoot, from, to)
  if (scheduleGames.length === 0) {
    warnings.push(`日程スナップショットに試合がありません (${from}..${to})。phase0:fetch:schedule-ahead を実行してください。`)
  }

  const allSeries = detectThreeGameSeriesFromGames(scheduleGames)
  const picked = pickRecentThreeGameSeriesCards(allSeries, asOfDateJst)

  const teamCodeSet = new Set<string>()
  for (const card of picked) {
    teamCodeSet.add(card.teamCodes[0])
    teamCodeSet.add(card.teamCodes[1])
  }
  for (const game of scheduleGames) {
    if (game.dateJst < asOfDateJst) continue
    teamCodeSet.add(game.homeTeamCode)
    teamCodeSet.add(game.awayTeamCode)
  }
  const snByTeam = new Map<string, SportingNewsRotationSnapshot | null>()
  for (const code of teamCodeSet) {
    snByTeam.set(code, readSnSnapshot(projectRoot, year, code))
    if (!snByTeam.get(code)) {
      warnings.push(`Sporting News スナップショットなし: ${code}`)
    }
  }

  const cards: TopProbablesCard[] = []
  const coveredGameIds = new Set<string>()
  for (const series of picked) {
    const futureGames = series.games.filter((g) => g.dateJst >= asOfDateJst)
    if (futureGames.length === 0) continue

    const games: TopProbablesGame[] = []
    for (const g of futureGames) {
      const homeProbable = await buildProbableSlotForGame(
        year,
        g.homeTeamCode,
        g.awayTeamCode,
        g.dateJst,
        tomorrowDate,
        snByTeam,
        warnings,
        projectRoot,
      )
      const awayProbable = await buildProbableSlotForGame(
        year,
        g.awayTeamCode,
        g.homeTeamCode,
        g.dateJst,
        tomorrowDate,
        snByTeam,
        warnings,
        projectRoot,
      )

      games.push({
        dateJst: g.dateJst,
        gameId: g.gameId,
        homeTeamCode: g.homeTeamCode,
        awayTeamCode: g.awayTeamCode,
        homeProbable,
        awayProbable,
      })
      coveredGameIds.add(g.gameId)
    }

    const card: TopProbablesCard = {
      cardKey: series.cardKey,
      teamCodes: series.teamCodes,
      teamNames: [
        teamDisplayNameFromCode(series.teamCodes[0]),
        teamDisplayNameFromCode(series.teamCodes[1]),
      ],
      seriesStart: series.seriesStart,
      seriesEnd: series.seriesEnd,
      games,
    }

    cards.push(enrichProbablesCard(projectRoot, year, card))
  }

  const orphanGames = scheduleGames
    .filter(
      (g) =>
        g.dateJst === asOfDateJst &&
        !coveredGameIds.has(g.gameId),
    )
    .sort((a, b) => a.dateJst.localeCompare(b.dateJst) || a.gameId.localeCompare(b.gameId))
  for (const g of orphanGames) {
    const homeProbable = await buildProbableSlotForGame(
      year,
      g.homeTeamCode,
      g.awayTeamCode,
      g.dateJst,
      tomorrowDate,
      snByTeam,
      warnings,
      projectRoot,
    )
    const awayProbable = await buildProbableSlotForGame(
      year,
      g.awayTeamCode,
      g.homeTeamCode,
      g.dateJst,
      tomorrowDate,
      snByTeam,
      warnings,
      projectRoot,
    )
    const card: TopProbablesCard = {
      cardKey: `${g.homeTeamCode}-${g.awayTeamCode}:${g.dateJst}`,
      teamCodes: [g.homeTeamCode, g.awayTeamCode],
      teamNames: [teamDisplayNameFromCode(g.homeTeamCode), teamDisplayNameFromCode(g.awayTeamCode)],
      seriesStart: g.dateJst,
      seriesEnd: g.dateJst,
      games: [
        {
          dateJst: g.dateJst,
          gameId: g.gameId,
          homeTeamCode: g.homeTeamCode,
          awayTeamCode: g.awayTeamCode,
          homeProbable,
          awayProbable,
        },
      ],
    }
    cards.push(enrichProbablesCard(projectRoot, year, card))
  }

  return {
    schemaVersion: TOP_PROBABLES_SCHEMA_VERSION,
    seasonYear: year,
    generatedAt: new Date().toISOString(),
    asOfDateJst,
    source: {
      sportingNewsFetchedAt: latestSnFetchedAt(projectRoot, year, [...teamCodeSet]),
      scheduleIndexBuiltAt: readSeasonIndexBuiltAt(projectRoot, year),
      matchupDerivedPhase: "phase30",
    },
    cards,
    warnings,
  }
}

export function topProbablesOutputPath(projectRoot: string, year: string): string {
  return path.join(projectRoot, "public", "data", "top-probables", year, "current.json")
}

export function writeTopProbablesSnapshot(
  snapshot: TopProbablesSnapshot,
  projectRoot = getProjectRoot(),
): string {
  const outPath = topProbablesOutputPath(projectRoot, snapshot.seasonYear)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
  return outPath
}
