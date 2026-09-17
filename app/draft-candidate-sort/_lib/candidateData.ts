import { candidates2026DataSet } from "../_data/candidates2026"

export type CandidateCategory = "highSchool" | "university" | "corporate"

export type CandidatePositionGroup =
  | "pitcher"
  | "catcher"
  | "infielder"
  | "outfielder"

export type CandidatePriorityGroup = "recommended" | "normal"

export type CandidateDisplayData = {
  id: string
  name: string
  category: CandidateCategory
  positionGroup: CandidatePositionGroup
  schoolOrTeam: string
  throwBat: string
  heightWeight: string
}

export type CandidateInternalData = {
  id: string
  priorityGroup: CandidatePriorityGroup
}

export type CandidateDataSet = {
  version: string
  updatedAt: string
  displayPlayers: CandidateDisplayData[]
  internalPriority: CandidateInternalData[]
}

export type CandidateForSort = CandidateDisplayData & {
  priorityGroup: CandidatePriorityGroup
}

export type CandidateFilter =
  | "all"
  | "highSchool"
  | "university"
  | "universityCorporate"
  | "recommended"

const candidateDataSet: CandidateDataSet = candidates2026DataSet

const categoryLabels = {
  highSchool: "高校生",
  university: "大学生",
  corporate: "社会人",
} satisfies Record<CandidateCategory, string>

const positionGroupLabels = {
  pitcher: "投手",
  catcher: "捕手",
  infielder: "内野手",
  outfielder: "外野手",
} satisfies Record<CandidatePositionGroup, string>

const filterLabels = {
  all: "全候補",
  highSchool: "高校生のみ",
  university: "大学生のみ",
  universityCorporate: "大学、社会人のみ",
  recommended: "中位以上候補",
} satisfies Record<CandidateFilter, string>

export function getCandidateDataSet(): CandidateDataSet {
  return candidateDataSet
}

export function getCandidateDisplayPlayers(): CandidateDisplayData[] {
  return candidateDataSet.displayPlayers
}

export function getCandidatesForSort(): CandidateForSort[] {
  const priorityById = new Map(
    candidateDataSet.internalPriority.map((entry) => [
      entry.id,
      entry.priorityGroup,
    ]),
  )

  return candidateDataSet.displayPlayers.map((player) => ({
    ...player,
    priorityGroup: priorityById.get(player.id) ?? "normal",
  }))
}

export function filterCandidatesForSort(
  candidates: CandidateForSort[],
  filter: CandidateFilter,
): CandidateForSort[] {
  switch (filter) {
    case "all":
      return candidates
    case "highSchool":
      return candidates.filter((candidate) => candidate.category === "highSchool")
    case "university":
      return candidates.filter((candidate) => candidate.category === "university")
    case "universityCorporate":
      return candidates.filter(
        (candidate) =>
          candidate.category === "university" ||
          candidate.category === "corporate",
      )
    case "recommended":
      return candidates.filter(
        (candidate) => candidate.priorityGroup === "recommended",
      )
  }
}

export function getCandidateCategoryLabel(category: CandidateCategory): string {
  return categoryLabels[category]
}

export function getCandidatePositionGroupLabel(
  positionGroup: CandidatePositionGroup,
): string {
  return positionGroupLabels[positionGroup]
}

export function getCandidateFilterLabel(filter: CandidateFilter): string {
  return filterLabels[filter]
}

export function validateCandidateDataSet(dataSet: CandidateDataSet): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const player of dataSet.displayPlayers) {
    if (ids.has(player.id)) {
      errors.push(`duplicate display player id: ${player.id}`)
    }
    ids.add(player.id)
  }

  for (const entry of dataSet.internalPriority) {
    if (!ids.has(entry.id)) {
      errors.push(`internal priority id is missing in display players: ${entry.id}`)
    }
  }

  return errors
}
