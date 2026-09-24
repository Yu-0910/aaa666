import {
  getCandidatePositionGroupLabel,
  type CandidateForSort,
} from "./candidateData"
import type { DraftSortSession } from "./draftSortStorage"
import type { BanzukeRow } from "./resultBuilder"

export type DraftResultTemplateRow = {
  rank: number
  name: string
  subText: string
}

export type DraftResultTemplateColumn = {
  round: 1 | 2 | 3
  rows: DraftResultTemplateRow[]
}

export type BanzukeTemplateCell = {
  name: string
  subText: string
}

export type BanzukeTemplateRow = {
  rankLabel: string
  west: BanzukeTemplateCell | null
  east: BanzukeTemplateCell | null
}

export const draftResultTemplateSrc =
  "/draft-candidate-sort/result-template-2026.jpg"
export const draftResultImageWidth = 1536
export const draftResultImageHeight = 2048

export const banzukeTemplateSrc =
  "/draft-candidate-sort/banzuke-template-2026.jpg"
export const banzukeImageWidth = 960
export const banzukeImageHeight = 1280

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

export const banzukeTemplateLayout = {
  rowTop: 164,
  rowHeight: 86.35,
  westTextCenter: 224,
  eastTextCenter: 735,
  nameBaselineOffset: 46,
  subTextBaselineOffset: 72,
  maxRows: 12,
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

export function buildBanzukeTemplateRows(
  session: DraftSortSession,
  candidateById: Map<string, CandidateForSort>,
): BanzukeTemplateRow[] {
  return session.banzukeResult
    .slice(0, banzukeTemplateLayout.maxRows)
    .map((row) => ({
      rankLabel: row.rankLabel,
      west: buildBanzukeTemplateCell(row, "west", candidateById),
      east: buildBanzukeTemplateCell(row, "east", candidateById),
    }))
}

function buildBanzukeTemplateCell(
  row: BanzukeRow,
  side: "west" | "east",
  candidateById: Map<string, CandidateForSort>,
): BanzukeTemplateCell | null {
  const candidateId = side === "west" ? row.westId : row.eastId
  if (!candidateId) return null

  const candidate = candidateById.get(candidateId)
  if (!candidate) return { name: candidateId, subText: "" }

  return {
    name: candidate.name,
    subText: `${getCandidatePositionGroupLabel(candidate.positionGroup)}／${candidate.schoolOrTeam}`,
  }
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
