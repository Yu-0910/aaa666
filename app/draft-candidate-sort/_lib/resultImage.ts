import {
  getCandidatePositionGroupLabel,
  type CandidateForSort,
} from "./candidateData"
import type { DraftSortSession } from "./draftSortStorage"

export type DraftResultTemplateRow = {
  rank: number
  name: string
  subText: string
}

export type DraftResultTemplateColumn = {
  round: 1 | 2 | 3
  rows: DraftResultTemplateRow[]
}

export const draftResultTemplateSrc =
  "/draft-candidate-sort/result-template-2026.jpg"
export const draftResultImageWidth = 1536
export const draftResultImageHeight = 2048

export const draftResultTemplateLayout = {
  columns: [
    { x: 58, rowTop: 400 },
    { x: 539, rowTop: 400 },
    { x: 1021, rowTop: 400 },
  ],
  rowHeight: 126.98,
  textLeftOffset: 88,
  nameBaselineOffset: 69,
  subTextBaselineOffset: 109,
} as const

export function buildDraftResultTemplateColumns(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
): DraftResultTemplateColumn[] {
  return [1, 2, 3].map((round) => ({
    round: round as 1 | 2 | 3,
    rows: buildRowsForRound(session, candidateById, round as 1 | 2 | 3),
  }))
}

function buildRowsForRound(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
  round: 1 | 2 | 3,
): DraftResultTemplateRow[] {
  return session.draftPredictionResult
    .filter((row) => row.round === round)
    .slice(0, 12)
    .map((row, index) => {
      const candidate = candidateById.get(row.candidateId)
      const positionAndTeam = candidate
        ? `${getCandidatePositionGroupLabel(candidate.positionGroup)}／${candidate.schoolOrTeam}`
        : ""
      return {
        rank: index + 1,
        name: candidate?.name ?? row.candidateId,
        subText: positionAndTeam,
      }
    })
}
