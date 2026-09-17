import type { DraftSortRankEntry } from "./sortEngine"

export type BanzukeSide = "east" | "west"

export type BanzukeRow = {
  rankLabel: string
  eastId: string | null
  westId: string | null
}

export type DraftPredictionRound = 1 | 2 | 3

export type DraftPredictionRow = {
  overallRank: number
  displayRank: number
  round: DraftPredictionRound
  candidateId: string
}

export type UnknownCandidateRow = {
  candidateId: string
  unknownCount: number
}

export type DraftSortBuiltResults = {
  banzukeResult: BanzukeRow[]
  draftPredictionResult: DraftPredictionRow[]
  unknownResult: UnknownCandidateRow[]
}

export function buildDraftSortResults({
  ranking,
  rankEntries,
  unknownCounts,
}: {
  ranking: string[]
  rankEntries?: DraftSortRankEntry[]
  unknownCounts: Record<string, number>
}): DraftSortBuiltResults {
  return {
    banzukeResult: buildBanzukeRows(ranking),
    draftPredictionResult: buildDraftPredictionRows(ranking, rankEntries),
    unknownResult: buildUnknownRows(unknownCounts),
  }
}

export function buildBanzukeRows(ranking: string[]): BanzukeRow[] {
  const rows: BanzukeRow[] = []

  for (let index = 0; index < ranking.length; index += 2) {
    rows.push({
      rankLabel: getBanzukeRankLabel(index),
      eastId: ranking[index] ?? null,
      westId: ranking[index + 1] ?? null,
    })
  }

  return rows
}

export function buildDraftPredictionRows(
  ranking: string[],
  rankEntries: DraftSortRankEntry[] = ranking.map((candidateId, index) => ({
    candidateId,
    rank: index + 1,
  })),
): DraftPredictionRow[] {
  const rankByCandidateId = new Map(
    rankEntries.map((entry) => [entry.candidateId, entry.rank]),
  )

  return ranking.slice(0, 36).map((candidateId, index) => {
    const overallRank = index + 1
    return {
      overallRank,
      displayRank: rankByCandidateId.get(candidateId) ?? overallRank,
      round: getDraftRound(overallRank),
      candidateId,
    }
  })
}

export function buildUnknownRows(
  unknownCounts: Record<string, number>,
): UnknownCandidateRow[] {
  return Object.entries(unknownCounts)
    .filter(([, unknownCount]) => unknownCount > 0)
    .map(([candidateId, unknownCount]) => ({ candidateId, unknownCount }))
    .sort((left, right) => right.unknownCount - left.unknownCount)
}

function getBanzukeRankLabel(index: number): string {
  if (index === 0) return "横綱"
  if (index === 2) return "大関"
  if (index === 4) return "関脇"
  if (index === 6) return "小結"

  const maegashiraNumber = Math.floor((index - 8) / 2) + 1
  return `前頭${maegashiraNumber}`
}

function getDraftRound(overallRank: number): DraftPredictionRound {
  if (overallRank <= 12) return 1
  if (overallRank <= 24) return 2
  return 3
}
