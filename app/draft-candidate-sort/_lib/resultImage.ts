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
  "/draft-candidate-sort/result-template-2026.jpg"
export const draftResultImageWidth = 960
export const draftResultImageHeight = 1280

export const draftResultTemplateLayout = {
  columns: [
    { x: 36, rowTop: 250 },
    { x: 337, rowTop: 250 },
    { x: 638, rowTop: 250 },
  ],
  rowHeight: 79.36,
  textLeftOffset: 47,
  nameBaselineOffset: 43,
  subTextBaselineOffset: 68,
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
