export type DraftSortChoice = "left" | "right" | "tie" | "unknown"

export type DraftSortAnswer = {
  leftId: string
  rightId: string
  choice: DraftSortChoice
  answeredAt: string
}

export type DraftSortComparison = {
  leftId: string
  rightId: string
}

export type DraftSortState = {
  candidateIds: string[]
  comparisonQueue: DraftSortComparison[]
  currentIndex: number
  answers: DraftSortAnswer[]
  ranking: string[]
  unknownCounts: Record<string, number>
  tieGroups: string[][]
  completed: boolean
}

export const tieHideMinimumAnswers = 10
export const tieHideRate = 0.2

export function createInitialSortState(candidateIds: string[]): DraftSortState {
  const uniqueIds = Array.from(new Set(candidateIds))

  return {
    candidateIds: uniqueIds,
    comparisonQueue: buildMergeComparisonQueue(uniqueIds),
    currentIndex: 0,
    answers: [],
    ranking: uniqueIds,
    unknownCounts: {},
    tieGroups: [],
    completed: uniqueIds.length <= 1,
  }
}

export function getCurrentComparison(
  state: DraftSortState,
): DraftSortComparison | null {
  return state.comparisonQueue[state.currentIndex] ?? null
}

export function shouldShowTieButton(answers: DraftSortAnswer[]): boolean {
  const totalAnswers = answers.length
  if (totalAnswers < tieHideMinimumAnswers) return true

  const tieAnswers = answers.filter((answer) => answer.choice === "tie").length
  return tieAnswers / totalAnswers < tieHideRate
}

export function applyDraftSortAnswer(
  state: DraftSortState,
  choice: DraftSortChoice,
  now = new Date(),
): DraftSortState {
  const comparison = getCurrentComparison(state)
  if (!comparison) return { ...state, completed: true }

  const answer: DraftSortAnswer = {
    ...comparison,
    choice,
    answeredAt: now.toISOString(),
  }

  const nextAnswers = [...state.answers, answer]
  const nextUnknownCounts = { ...state.unknownCounts }
  let nextTieGroups = state.tieGroups
  let nextRanking = state.ranking

  if (choice === "left") {
    nextRanking = preferBefore(state.ranking, comparison.leftId, comparison.rightId)
  }

  if (choice === "right") {
    nextRanking = preferBefore(state.ranking, comparison.rightId, comparison.leftId)
  }

  if (choice === "tie") {
    nextTieGroups = mergeTieGroup(
      state.tieGroups,
      comparison.leftId,
      comparison.rightId,
    )
  }

  if (choice === "unknown") {
    nextUnknownCounts[comparison.leftId] =
      (nextUnknownCounts[comparison.leftId] ?? 0) + 1
    nextUnknownCounts[comparison.rightId] =
      (nextUnknownCounts[comparison.rightId] ?? 0) + 1
  }

  const nextIndex = state.currentIndex + 1

  return {
    ...state,
    currentIndex: nextIndex,
    answers: nextAnswers,
    ranking: nextRanking,
    unknownCounts: nextUnknownCounts,
    tieGroups: nextTieGroups,
    completed: nextIndex >= state.comparisonQueue.length,
  }
}

export function undoDraftSortAnswer(state: DraftSortState): DraftSortState {
  if (state.answers.length === 0) return state

  const previousAnswers = state.answers.slice(0, -1)
  const replayed = createInitialSortState(state.candidateIds)

  return previousAnswers.reduce(
    (nextState, answer) =>
      applyDraftSortAnswer(nextState, answer.choice, new Date(answer.answeredAt)),
    replayed,
  )
}

function buildMergeComparisonQueue(candidateIds: string[]): DraftSortComparison[] {
  if (candidateIds.length <= 1) return []

  const midpoint = Math.ceil(candidateIds.length / 2)
  const left = candidateIds.slice(0, midpoint)
  const right = candidateIds.slice(midpoint)

  return [
    ...buildMergeComparisonQueue(left),
    ...buildMergeComparisonQueue(right),
    ...buildCrossComparisons(left, right),
  ]
}

function buildCrossComparisons(
  left: string[],
  right: string[],
): DraftSortComparison[] {
  const comparisons: DraftSortComparison[] = []
  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftId = left[index]
    const rightId = right[index]
    if (leftId && rightId) {
      comparisons.push({ leftId, rightId })
    }
  }

  return comparisons
}

function preferBefore(ranking: string[], preferredId: string, otherId: string) {
  const nextRanking = ranking.filter((id) => id !== preferredId)
  const otherIndex = nextRanking.indexOf(otherId)

  if (otherIndex === -1) return ranking

  nextRanking.splice(otherIndex, 0, preferredId)
  return nextRanking
}

function mergeTieGroup(
  tieGroups: string[][],
  leftId: string,
  rightId: string,
): string[][] {
  const matchingGroups = tieGroups.filter(
    (group) => group.includes(leftId) || group.includes(rightId),
  )
  const otherGroups = tieGroups.filter(
    (group) => !group.includes(leftId) && !group.includes(rightId),
  )
  const merged = Array.from(new Set([leftId, rightId, ...matchingGroups.flat()]))

  return [...otherGroups, merged]
}

