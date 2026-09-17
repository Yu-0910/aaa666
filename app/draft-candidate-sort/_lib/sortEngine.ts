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

export type DraftSortRatingRecord = {
  id: string
  rating: number
  comparisonCount: number
  confidence: number
}

export type DraftSortState = {
  candidateIds: string[]
  comparisonQueue: DraftSortComparison[]
  currentComparison: DraftSortComparison | null
  currentIndex: number
  answers: DraftSortAnswer[]
  ranking: string[]
  ratings: Record<string, DraftSortRatingRecord>
  unknownCounts: Record<string, number>
  tieGroups: string[][]
  completed: boolean
  completedReason: "single" | "stable" | "maxQuestions" | null
}

export const tieHideMinimumAnswers = 10
export const tieHideRate = 0.2
export const initialRating = 1500
export const topTargetSize = 36
export const topFocusSize = 48

export function createInitialSortState(candidateIds: string[]): DraftSortState {
  const uniqueIds = Array.from(new Set(candidateIds))
  const maxComparisons = getMaxComparisons(uniqueIds.length)
  const ratings = Object.fromEntries(
    uniqueIds.map((id) => [
      id,
      {
        id,
        rating: initialRating,
        comparisonCount: 0,
        confidence: 0,
      },
    ]),
  )
  const initialState: DraftSortState = {
    candidateIds: uniqueIds,
    comparisonQueue: buildPlaceholderComparisonQueue(uniqueIds, maxComparisons),
    currentComparison: null,
    currentIndex: 0,
    answers: [],
    ranking: uniqueIds,
    ratings,
    unknownCounts: {},
    tieGroups: [],
    completed: uniqueIds.length <= 1,
    completedReason: uniqueIds.length <= 1 ? "single" : null,
  }

  return {
    ...initialState,
    currentComparison: uniqueIds.length <= 1 ? null : selectNextComparison(initialState),
  }
}

export function getCurrentComparison(
  state: DraftSortState,
): DraftSortComparison | null {
  return state.currentComparison
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
  const nextRatings = cloneRatings(state.ratings)
  let nextTieGroups = state.tieGroups

  if (choice === "left") {
    updateRatings(nextRatings, comparison.leftId, comparison.rightId, 1)
  }

  if (choice === "right") {
    updateRatings(nextRatings, comparison.leftId, comparison.rightId, 0)
  }

  if (choice === "tie") {
    updateRatings(nextRatings, comparison.leftId, comparison.rightId, 0.5)
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
    touchRatings(nextRatings, comparison.leftId, comparison.rightId)
  }

  const nextIndex = state.currentIndex + 1
  const nextRanking = rankCandidateIds(state.candidateIds, nextRatings)
  const completedReason = getCompletedReason({
    answers: nextAnswers,
    candidateIds: state.candidateIds,
    ratings: nextRatings,
    maxComparisons: state.comparisonQueue.length,
  })
  const nextStateBase: DraftSortState = {
    ...state,
    currentIndex: nextIndex,
    answers: nextAnswers,
    ranking: nextRanking,
    ratings: nextRatings,
    unknownCounts: nextUnknownCounts,
    tieGroups: nextTieGroups,
    completed: completedReason !== null,
    completedReason,
  }

  return {
    ...nextStateBase,
    currentComparison:
      completedReason !== null ? null : selectNextComparison(nextStateBase),
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

function getMaxComparisons(candidateCount: number): number {
  if (candidateCount <= 1) return 0
  if (candidateCount === 2) return 1
  if (candidateCount <= topTargetSize) return Math.max(18, Math.ceil(candidateCount * 1.15))
  return Math.min(110, Math.max(36, Math.ceil(candidateCount * 0.85)))
}

function buildPlaceholderComparisonQueue(
  candidateIds: string[],
  maxComparisons: number,
): DraftSortComparison[] {
  if (candidateIds.length <= 1) return []
  return Array.from({ length: maxComparisons }, (_, index) => ({
    leftId: candidateIds[index % candidateIds.length],
    rightId: candidateIds[(index + 1) % candidateIds.length],
  }))
}

function selectNextComparison(state: DraftSortState): DraftSortComparison | null {
  if (state.candidateIds.length <= 1) return null

  const ranked = rankCandidateIds(state.candidateIds, state.ratings)
  const focusIds =
    state.answers.length < Math.ceil(state.candidateIds.length / 2)
      ? ranked
      : ranked.slice(0, Math.min(topFocusSize, ranked.length))
  const pairCounts = getPairCounts(state.answers)
  const leftId = [...focusIds].sort((left, right) => {
    const leftRecord = state.ratings[left]
    const rightRecord = state.ratings[right]
    return (
      leftRecord.comparisonCount - rightRecord.comparisonCount ||
      rightRecord.confidence - leftRecord.confidence ||
      stableHash(left) - stableHash(right)
    )
  })[0]

  if (!leftId) return null

  const leftRating = state.ratings[leftId].rating
  const rightId = focusIds
    .filter((id) => id !== leftId)
    .sort((left, right) => {
      const leftPairCount = pairCounts[getPairKey(leftId, left)] ?? 0
      const rightPairCount = pairCounts[getPairKey(leftId, right)] ?? 0
      return (
        leftPairCount - rightPairCount ||
        Math.abs(state.ratings[left].rating - leftRating) -
          Math.abs(state.ratings[right].rating - leftRating) ||
        state.ratings[left].comparisonCount - state.ratings[right].comparisonCount ||
        stableHash(left) - stableHash(right)
      )
    })[0]

  return rightId ? { leftId, rightId } : null
}

function updateRatings(
  ratings: Record<string, DraftSortRatingRecord>,
  leftId: string,
  rightId: string,
  leftScore: 0 | 0.5 | 1,
): void {
  const left = ratings[leftId]
  const right = ratings[rightId]
  if (!left || !right) return

  const expectedLeft = 1 / (1 + 10 ** ((right.rating - left.rating) / 400))
  const expectedRight = 1 - expectedLeft
  const rightScore = 1 - leftScore
  const leftK = getKFactor(left.comparisonCount)
  const rightK = getKFactor(right.comparisonCount)

  left.rating = Math.round(left.rating + leftK * (leftScore - expectedLeft))
  right.rating = Math.round(right.rating + rightK * (rightScore - expectedRight))
  left.comparisonCount += 1
  right.comparisonCount += 1
  left.confidence = getConfidence(left.comparisonCount)
  right.confidence = getConfidence(right.comparisonCount)
}

function touchRatings(
  ratings: Record<string, DraftSortRatingRecord>,
  leftId: string,
  rightId: string,
): void {
  for (const id of [leftId, rightId]) {
    const record = ratings[id]
    if (!record) continue
    record.comparisonCount += 1
    record.confidence = getConfidence(record.comparisonCount)
  }
}

function getKFactor(comparisonCount: number): number {
  return Math.max(14, 48 - comparisonCount * 3)
}

function getConfidence(comparisonCount: number): number {
  return Math.min(1, comparisonCount / 5)
}

function getCompletedReason({
  answers,
  candidateIds,
  ratings,
  maxComparisons,
}: {
  answers: DraftSortAnswer[]
  candidateIds: string[]
  ratings: Record<string, DraftSortRatingRecord>
  maxComparisons: number
}): DraftSortState["completedReason"] {
  if (candidateIds.length <= 1) return "single"
  if (answers.length >= maxComparisons) return "maxQuestions"
  if (isTopTargetStable(candidateIds, ratings, answers.length)) return "stable"
  return null
}

function isTopTargetStable(
  candidateIds: string[],
  ratings: Record<string, DraftSortRatingRecord>,
  answerCount: number,
): boolean {
  if (candidateIds.length <= topTargetSize) {
    return answerCount >= Math.max(18, Math.ceil(candidateIds.length * 0.75))
  }

  const ranked = rankCandidateIds(candidateIds, ratings)
  const topIds = ranked.slice(0, topTargetSize)
  const boundaryIn = ratings[topIds[topIds.length - 1]]
  const boundaryOut = ratings[ranked[topTargetSize]]
  const minTopComparisons = Math.min(
    ...topIds.map((id) => ratings[id]?.comparisonCount ?? 0),
  )
  const boundaryGap =
    boundaryIn && boundaryOut ? boundaryIn.rating - boundaryOut.rating : 0

  return answerCount >= 36 && minTopComparisons >= 2 && boundaryGap >= 60
}

function rankCandidateIds(
  candidateIds: string[],
  ratings: Record<string, DraftSortRatingRecord>,
): string[] {
  return [...candidateIds].sort((left, right) => {
    const leftRecord = ratings[left]
    const rightRecord = ratings[right]
    return (
      rightRecord.rating - leftRecord.rating ||
      rightRecord.confidence - leftRecord.confidence ||
      rightRecord.comparisonCount - leftRecord.comparisonCount ||
      stableHash(left) - stableHash(right)
    )
  })
}

function cloneRatings(
  ratings: Record<string, DraftSortRatingRecord>,
): Record<string, DraftSortRatingRecord> {
  return Object.fromEntries(
    Object.entries(ratings).map(([id, record]) => [id, { ...record }]),
  )
}

function getPairCounts(answers: DraftSortAnswer[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const answer of answers) {
    const key = getPairKey(answer.leftId, answer.rightId)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function getPairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("::")
}

function stableHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
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
