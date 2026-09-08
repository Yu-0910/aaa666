import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { writeTextFileWithRetrySync } from "@/lib/fs/writeFileWithRetry"
import {
  detectThreeGameSeriesFromGames,
  MAX_PROBABLES_CARDS,
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
  asOfDateJst: string,
  tomorrowDate: string,
  snByTeam: Map<string, SportingNewsRotationSnapshot | null>,
  warnings: string[],
  projectRoot: string,
): Promise<TopProbablesPitcherSlot | null> {
  if (dateJst === asOfDateJst || dateJst === tomorrowDate) {
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

function hasBothProbablePitcherNames(game: TopProbablesGame): boolean {
  return Boolean(
    game.homeProbable?.pitcherNameJa?.trim() &&
      game.awayProbable?.pitcherNameJa?.trim(),
  )
}

function probablePitcherIdentity(slot: TopProbablesPitcherSlot | null): string {
  if (!slot) return ""
  const npbId = String(slot.pitcherNpbId ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (npbId) return `id:${npbId}`
  return `name:${String(slot.pitcherNameJa ?? "").normalize("NFKC").replace(/\s+/g, "")}`
}

type SportingNewsSlotLookup = (
  teamCode: string,
  opponentTeamCode: string,
  dateJst: string,
) => TopProbablesPitcherSlot | null

/**
 * Yahoo の公式予告先発と Sporting News の日付予想が連投になるとき、公式枠は維持し、
 * Sporting News 側だけを公式日付にあった同ソースの候補へ差し替える。
 *
 * 例: SN が 9/4=A, 9/5=B、Yahoo が 9/5=A の場合は 9/4=B, 9/5=A とする。
 */
export function reconcileOfficialProbablesWithSportingNews(
  games: TopProbablesGame[],
  sportingNewsSlotFor: SportingNewsSlotLookup,
  warnings: string[],
): void {
  const sides = ["homeProbable", "awayProbable"] as const
  for (let i = 0; i < games.length - 1; i++) {
    const currentGame = games[i]!
    const nextGame = games[i + 1]!
    for (const side of sides) {
      const current = currentGame[side]
      const next = nextGame[side]
      if (!current || !next || current.teamCode !== next.teamCode) continue
      if (probablePitcherIdentity(current) !== probablePitcherIdentity(next)) continue
      if (current.source === next.source) continue

      const officialGame = current.source === "yahoo-schedule" ? currentGame : nextGame
      const sportingNewsGame = current.source === "sportingnews" ? currentGame : nextGame
      const sportingNewsSide = current.source === "sportingnews" ? side : side
      const teamCode = sportingNewsGame[sportingNewsSide]?.teamCode
      if (!teamCode) continue
      const opponentTeamCode =
        sportingNewsGame.homeTeamCode === teamCode
          ? sportingNewsGame.awayTeamCode
          : sportingNewsGame.homeTeamCode
      const replacement = sportingNewsSlotFor(teamCode, opponentTeamCode, officialGame.dateJst)
      if (!replacement || probablePitcherIdentity(replacement) === probablePitcherIdentity(current)) continue

      sportingNewsGame[sportingNewsSide] = replacement
      warnings.push(
        `公式予告先発を優先して連投を回避: ${teamCode} ${currentGame.dateJst}/${nextGame.dateJst}`,
      )
    }
  }
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
  const orphanGameCandidates = scheduleGames
    .filter(
      (g) =>
        g.dateJst === asOfDateJst &&
        !picked.some((card) => card.games.some((game) => game.gameId === g.gameId)),
    )
    .sort((a, b) => a.dateJst.localeCompare(b.dateJst) || a.gameId.localeCompare(b.gameId))
  for (const game of orphanGameCandidates) {
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
  let hiddenMissingPitcherNameGames = 0
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
        asOfDateJst,
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
        asOfDateJst,
        tomorrowDate,
        snByTeam,
        warnings,
        projectRoot,
      )

      const game: TopProbablesGame = {
        dateJst: g.dateJst,
        gameId: g.gameId,
        homeTeamCode: g.homeTeamCode,
        awayTeamCode: g.awayTeamCode,
        homeProbable,
        awayProbable,
      }
      if (hasBothProbablePitcherNames(game)) {
        games.push(game)
      } else {
        hiddenMissingPitcherNameGames++
      }
      coveredGameIds.add(g.gameId)
    }
    if (games.length === 0) continue

    reconcileOfficialProbablesWithSportingNews(
      games,
      (teamCode, opponentTeamCode, dateJst) =>
        buildPitcherSlot(year, teamCode, opponentTeamCode, dateJst, snByTeam, warnings),
      warnings,
    )

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

  for (const g of orphanGameCandidates.filter((game) => !coveredGameIds.has(game.gameId))) {
    if (cards.length >= MAX_PROBABLES_CARDS) break
    const homeProbable = await buildProbableSlotForGame(
      year,
      g.homeTeamCode,
      g.awayTeamCode,
      g.dateJst,
      asOfDateJst,
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
      asOfDateJst,
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
    if (hasBothProbablePitcherNames(card.games[0]!)) {
      cards.push(enrichProbablesCard(projectRoot, year, card))
    } else {
      hiddenMissingPitcherNameGames++
    }
  }

  if (hiddenMissingPitcherNameGames > 0) {
    warnings.push(
      `予想投手名が揃わない試合を非表示: ${hiddenMissingPitcherNameGames}件`,
    )
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
  writeTextFileWithRetrySync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  return outPath
}
