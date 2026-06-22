import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  detectThreeGameSeriesFromGames,
  pickRecentThreeGameSeriesCards,
} from "@/lib/probables/detectThreeGameSeries"
import { enrichProbablesCard } from "@/lib/probables/enrichProbablesCard"
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
    pitcherNameJa: row.pitcherNameJa,
    pitcherNpbId: resolved?.pitcherNpbId ?? null,
    pitcherPublicId: resolved?.pitcherPublicId ?? null,
    source: "sportingnews",
    topOpponentBatters,
  }
}

export function buildTopProbablesSnapshot(options: {
  year: string
  projectRoot?: string
  asOfDateJst?: string
}): TopProbablesSnapshot {
  const projectRoot = options.projectRoot ?? getProjectRoot()
  const year = options.year
  const asOfDateJst = options.asOfDateJst ?? todayJstYmd()
  const warnings: string[] = []

  const from = addDaysYmd(asOfDateJst, -1)
  const to = addDaysYmd(asOfDateJst, 14)
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
  const snByTeam = new Map<string, SportingNewsRotationSnapshot | null>()
  for (const code of teamCodeSet) {
    snByTeam.set(code, readSnSnapshot(projectRoot, year, code))
    if (!snByTeam.get(code)) {
      warnings.push(`Sporting News スナップショットなし: ${code}`)
    }
  }

  const cards: TopProbablesCard[] = picked.map((series) => {
    const games: TopProbablesGame[] = series.games.map((g) => ({
      dateJst: g.dateJst,
      gameId: g.gameId,
      homeTeamCode: g.homeTeamCode,
      awayTeamCode: g.awayTeamCode,
      homeProbable: buildPitcherSlot(
        year,
        g.homeTeamCode,
        g.awayTeamCode,
        g.dateJst,
        snByTeam,
        warnings,
      ),
      awayProbable: buildPitcherSlot(
        year,
        g.awayTeamCode,
        g.homeTeamCode,
        g.dateJst,
        snByTeam,
        warnings,
      ),
    }))

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

    return enrichProbablesCard(projectRoot, year, card)
  })

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
