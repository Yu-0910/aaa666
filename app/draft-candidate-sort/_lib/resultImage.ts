import type { CandidateForSort } from "./candidateData"
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
  "/draft-candidate-sort/result-template-2026.png"
export const draftResultImageWidth = 1196
export const draftResultImageHeight = 1315

export const draftResultTemplateLayout = {
  columns: [
    { x: 37, rowTop: 242 },
    { x: 421, rowTop: 242 },
    { x: 805, rowTop: 242 },
  ],
  rowHeight: 75.18,
  textLeftOffset: 106,
  nameBaselineOffset: 35,
  subTextBaselineOffset: 58,
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
      return {
        rank: index + 1,
        name: candidate?.name ?? row.candidateId,
        subText: candidate?.schoolOrTeam ?? "",
      }
    })
}
