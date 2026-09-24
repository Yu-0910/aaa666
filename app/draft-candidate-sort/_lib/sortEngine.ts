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

export type DraftSortRelationRecord = {
  id: string
  less: string[]
  equal: string[]
  greater: string[]
}

export type DraftSortRankEntry = {
  candidateId: string
  rank: number
}

export type DraftSortState = {
  algorithmVersion: 2
  candidateIds: string[]
  currentComparison: DraftSortComparison | null
  currentIndex: number
  answers: DraftSortAnswer[]
  ranking: string[]
  rankEntries: DraftSortRankEntry[]
  relations: Record<string, DraftSortRelationRecord>
  unknownCounts: Record<string, number>
  tieGroups: string[][]
  completed: boolean
  completedReason: "single" | "sorted" | null
  progressPercent: number
  estimatedComparisonCount: number
}

class UndefinedOrderError extends Error {
  constructor(
    readonly leftId: string,
    readonly rightId: string,
  ) {
    super("Comparison has not been answered yet.")
  }
}

const forwardFactor = 1.05
export const tieHideMinimumAnswers = 10
export const tieHideRate = 0.2

export function createInitialSortState(candidateIds: string[]): DraftSortState {
  return rebuildDraftSortState(candidateIds, [])
}

export function rebuildDraftSortState(
  candidateIds: string[],
  answers: DraftSortAnswer[],
): DraftSortState {
  const normalizedIds = normalizeCandidateIds(candidateIds)
  const validIdSet = new Set(normalizedIds)
  const validAnswers = answers.filter(
    (answer) => validIdSet.has(answer.leftId) && validIdSet.has(answer.rightId),
  )
  const relations = createRelationRecords(normalizedIds)
  const unknownCounts: Record<string, number> = {}

  for (const answer of validAnswers) {
    if (answer.choice === "left") {
      addGreaterRelation(relations, normalizedIds, answer.leftId, answer.rightId)
    } else if (answer.choice === "right") {
      addGreaterRelation(relations, normalizedIds, answer.rightId, answer.leftId)
    } else {
      if (answer.choice === "unknown") {
        unknownCounts[answer.leftId] = (unknownCounts[answer.leftId] ?? 0) + 1
        unknownCounts[answer.rightId] = (unknownCounts[answer.rightId] ?? 0) + 1
      }
      addEqualRelation(relations, normalizedIds, answer.leftId, answer.rightId)
    }
  }

  return deriveDraftSortState(normalizedIds, validAnswers, relations, unknownCounts)
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
  comparison = state.currentComparison,
): DraftSortState {
  if (!comparison) return { ...state, completed: true, progressPercent: 100 }

  const existingAnswer = state.answers.find((answer) =>
    isSamePair(answer.leftId, answer.rightId, comparison.leftId, comparison.rightId),
  )
  if (existingAnswer) return state

  const answer: DraftSortAnswer = {
    ...comparison,
    choice,
    answeredAt: now.toISOString(),
  }

  const nextRelations = cloneRelations(state.relations)
  const nextUnknownCounts = { ...state.unknownCounts }
  if (choice === "left") {
    addGreaterRelation(nextRelations, state.candidateIds, comparison.leftId, comparison.rightId)
  } else if (choice === "right") {
    addGreaterRelation(nextRelations, state.candidateIds, comparison.rightId, comparison.leftId)
  } else {
    if (choice === "unknown") {
      nextUnknownCounts[comparison.leftId] =
        (nextUnknownCounts[comparison.leftId] ?? 0) + 1
      nextUnknownCounts[comparison.rightId] =
        (nextUnknownCounts[comparison.rightId] ?? 0) + 1
    }
    addEqualRelation(nextRelations, state.candidateIds, comparison.leftId, comparison.rightId)
  }

  return deriveDraftSortState(
    state.candidateIds,
    [...state.answers, answer],
    nextRelations,
    nextUnknownCounts,
  )
}

export function undoDraftSortAnswer(state: DraftSortState): DraftSortState {
  if (state.answers.length === 0) return state
  return rebuildDraftSortState(state.candidateIds, state.answers.slice(0, -1))
}

export function getFordJohnsonMaxComparisons(candidateCount: number): number {
  let total = 0
  for (let k = 1; k <= candidateCount; k += 1) {
    total += Math.ceil(Math.log2((3 * k) / 4))
  }
  return Math.max(0, total)
}

function deriveDraftSortState(
  candidateIds: string[],
  answers: DraftSortAnswer[],
  relations: Record<string, DraftSortRelationRecord>,
  unknownCounts: Record<string, number>,
): DraftSortState {
  let ranking = candidateIds
  let currentComparison: DraftSortComparison | null = null
  let completed = candidateIds.length <= 1
  let completedReason: DraftSortState["completedReason"] =
    candidateIds.length <= 1 ? "single" : null

  if (!completed) {
    try {
      ranking = fordJohnsonSort(candidateIds, relations)
      completed = true
      completedReason = "sorted"
    } catch (error) {
      if (!(error instanceof UndefinedOrderError)) {
        throw error
      }
      currentComparison = normalizeComparison(error.leftId, error.rightId)
      ranking = buildPartialRanking(candidateIds, relations)
    }
  }

  const relationProgress = calculateRelationProgress(candidateIds, relations)
  const comparisonProgress = calculateComparisonProgress(
    answers.length,
    candidateIds.length,
  )
  const progressPercent = completed
    ? 100
    : Math.min(99, Math.max(relationProgress, comparisonProgress))

  return {
    algorithmVersion: 2,
    candidateIds,
    currentComparison,
    currentIndex: answers.length,
    answers,
    ranking,
    rankEntries: buildRankEntries(ranking, relations),
    relations,
    unknownCounts,
    tieGroups: buildTieGroups(candidateIds, relations),
    completed,
    completedReason,
    progressPercent,
    estimatedComparisonCount: getFordJohnsonMaxComparisons(candidateIds.length),
  }
}

function fordJohnsonSort(
  candidateIds: string[],
  relations: Record<string, DraftSortRelationRecord>,
): string[] {
  const insertionBatchEnd = (k: number): number =>
    Math.floor(
      (forwardFactor * (2 ** (k + 1) + (k % 2 === 0 ? 1 : -1))) / 3,
    )

  const insertOrder = (length: number): number[] => {
    const order: number[] = []
    let previousEnd = 0

    for (let k = 1; previousEnd < length; k += 1) {
      const currentEnd = Math.min(insertionBatchEnd(k), length)
      if (currentEnd <= previousEnd) continue

      for (let index = currentEnd; index > previousEnd; index -= 1) {
        order.push(index - 1)
      }
      previousEnd = currentEnd
    }

    return order
  }

  const leftStrategyPivot = (length: number): number => {
    const k = Math.floor(Math.log2(length))
    const pivot = Math.max(length - 2 ** k + 1, 2 ** (k - 1))
    return Math.min(length - 1, Math.max(0, pivot - 1))
  }

  const binaryInsertion = (collection: string[], item: string): string[] => {
    let left = 0
    let right = collection.length

    while (left < right) {
      const pivot = left + leftStrategyPivot(right - left)
      if (compareGreater(item, collection[pivot], relations)) {
        right = pivot
      } else {
        left = pivot + 1
      }
    }

    const result = collection.concat()
    result.splice(left, 0, item)
    return result
  }

  if (candidateIds.length < 2) return candidateIds.concat()
  if (candidateIds.length === 2) {
    return compareGreater(candidateIds[0], candidateIds[1], relations)
      ? [candidateIds[0], candidateIds[1]]
      : [candidateIds[1], candidateIds[0]]
  }

  const pairs: string[][] = []
  let pairKeys: string[] = []
  const surplus: string[] = []

  for (let index = 0; index < candidateIds.length; index += 2) {
    if (index === candidateIds.length - 1) {
      surplus.push(candidateIds[index])
    } else if (compareGreater(candidateIds[index], candidateIds[index + 1], relations)) {
      pairs.push([candidateIds[index + 1], candidateIds[index]])
      pairKeys.push(candidateIds[index + 1])
    } else {
      pairs.push([candidateIds[index], candidateIds[index + 1]])
      pairKeys.push(candidateIds[index])
    }
  }

  const sortedPairs: string[][] = []
  pairKeys = fordJohnsonSort(pairKeys, relations)
  for (const key of pairKeys) {
    const pair = pairs.find((candidatePair) => candidatePair[0] === key)
    if (pair) sortedPairs.push(pair)
  }

  let result = pairKeys

  for (const index of insertOrder(sortedPairs.length)) {
    const pair = sortedPairs[index]
    const pivot = result.findIndex((candidateId) => candidateId === pair[0])

    if (pivot === 0) {
      result = [pair[1], ...result]
    } else {
      result = binaryInsertion(result.slice(0, pivot), pair[1]).concat(
        result.slice(pivot),
      )
    }
  }

  if (surplus.length > 0) {
    result = binaryInsertion(result, surplus[0])
  }

  return result
}

function compareGreater(
  greaterId: string,
  lessId: string,
  relations: Record<string, DraftSortRelationRecord>,
): boolean {
  if (greaterId === lessId) return false
  const greaterRecord = relations[greaterId]
  if (!greaterRecord) throw new UndefinedOrderError(greaterId, lessId)

  if (greaterRecord.less.includes(lessId)) return true
  if (
    greaterRecord.equal.includes(lessId) ||
    greaterRecord.greater.includes(lessId)
  ) {
    return false
  }
  throw new UndefinedOrderError(greaterId, lessId)
}

function addGreaterRelation(
  relations: Record<string, DraftSortRelationRecord>,
  candidateIds: string[],
  greaterId: string,
  lessId: string,
): void {
  if (!isValidRelationInput(relations, greaterId, lessId)) return

  const greaterGroup = getEqualGroup(relations, greaterId)
  const lessGroup = getEqualGroup(relations, lessId)
  const allGreater = new Set<string>()
  const allLess = new Set<string>()

  for (const id of greaterGroup) {
    allGreater.add(id)
    for (const relatedId of relations[id].greater) allGreater.add(relatedId)
  }
  for (const id of lessGroup) {
    allLess.add(id)
    for (const relatedId of relations[id].less) allLess.add(relatedId)
  }

  for (const highId of allGreater) {
    for (const lowId of allLess) {
      if (highId === lowId) continue
      addUnique(relations[highId].less, lowId)
      addUnique(relations[lowId].greater, highId)
    }
  }
}

function addEqualRelation(
  relations: Record<string, DraftSortRelationRecord>,
  candidateIds: string[],
  leftId: string,
  rightId: string,
): void {
  if (!isValidRelationInput(relations, leftId, rightId)) return

  const equalGroup = new Set([
    ...getEqualGroup(relations, leftId),
    ...getEqualGroup(relations, rightId),
  ])
  const greaterSet = new Set<string>()
  const lessSet = new Set<string>()

  for (const id of equalGroup) {
    for (const relatedId of relations[id].greater) {
      if (!equalGroup.has(relatedId)) greaterSet.add(relatedId)
    }
    for (const relatedId of relations[id].less) {
      if (!equalGroup.has(relatedId)) lessSet.add(relatedId)
    }
  }

  for (const id of equalGroup) {
    relations[id].equal = [...equalGroup].filter((equalId) => equalId !== id)
    relations[id].greater = []
    relations[id].less = []
  }

  for (const highId of greaterSet) {
    for (const equalId of equalGroup) {
      addGreaterRelation(relations, candidateIds, highId, equalId)
    }
  }
  for (const lowId of lessSet) {
    for (const equalId of equalGroup) {
      addGreaterRelation(relations, candidateIds, equalId, lowId)
    }
  }
}

function createRelationRecords(
  candidateIds: string[],
): Record<string, DraftSortRelationRecord> {
  return Object.fromEntries(
    candidateIds.map((id) => [
      id,
      {
        id,
        less: [],
        equal: [],
        greater: [],
      },
    ]),
  )
}

function cloneRelations(
  relations: Record<string, DraftSortRelationRecord>,
): Record<string, DraftSortRelationRecord> {
  return Object.fromEntries(
    Object.entries(relations).map(([id, record]) => [
      id,
      {
        id: record.id,
        less: [...record.less],
        equal: [...record.equal],
        greater: [...record.greater],
      },
    ]),
  )
}

function normalizeCandidateIds(candidateIds: string[]): string[] {
  return Array.from(new Set(candidateIds))
}

function normalizeComparison(leftId: string, rightId: string): DraftSortComparison {
  return stableHash(leftId) <= stableHash(rightId)
    ? { leftId, rightId }
    : { leftId: rightId, rightId: leftId }
}

function buildPartialRanking(
  candidateIds: string[],
  relations: Record<string, DraftSortRelationRecord>,
): string[] {
  return [...candidateIds].sort((left, right) => {
    if (relations[left].less.includes(right)) return -1
    if (relations[left].greater.includes(right)) return 1
    if (relations[left].equal.includes(right)) {
      return stableHash(left) - stableHash(right) || left.localeCompare(right)
    }
    return (
      relations[right].greater.length - relations[left].greater.length ||
      relations[left].less.length - relations[right].less.length ||
      stableHash(left) - stableHash(right) ||
      left.localeCompare(right)
    )
  })
}

function buildRankEntries(
  ranking: string[],
  relations: Record<string, DraftSortRelationRecord>,
): DraftSortRankEntry[] {
  let currentRank = 1
  return ranking.map((candidateId, index) => {
    if (
      index > 0 &&
      !relations[candidateId]?.equal.includes(ranking[index - 1])
    ) {
      currentRank = index + 1
    }
    return { candidateId, rank: currentRank }
  })
}

function buildTieGroups(
  candidateIds: string[],
  relations: Record<string, DraftSortRelationRecord>,
): string[][] {
  const visited = new Set<string>()
  const groups: string[][] = []

  for (const id of candidateIds) {
    if (visited.has(id)) continue
    const group = getEqualGroup(relations, id)
    for (const memberId of group) visited.add(memberId)
    if (group.length > 1) groups.push(group)
  }

  return groups
}

function getEqualGroup(
  relations: Record<string, DraftSortRelationRecord>,
  candidateId: string,
): string[] {
  const visited = new Set<string>()
  const queue = [candidateId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) continue
    visited.add(currentId)
    for (const equalId of relations[currentId]?.equal ?? []) {
      if (!visited.has(equalId)) queue.push(equalId)
    }
  }

  return [...visited].sort(
    (left, right) => stableHash(left) - stableHash(right) || left.localeCompare(right),
  )
}

function calculateRelationProgress(
  candidateIds: string[],
  relations: Record<string, DraftSortRelationRecord>,
): number {
  const denominator = candidateIds.length * (candidateIds.length - 1)
  if (denominator <= 0) return 0

  const relationCount = candidateIds.reduce((total, id) => {
    const record = relations[id]
    return total + record.less.length + record.equal.length + record.greater.length
  }, 0)

  return Math.floor(Math.sqrt(relationCount / denominator) * 100)
}

function calculateComparisonProgress(
  answerCount: number,
  candidateCount: number,
): number {
  const estimatedComparisons = getFordJohnsonMaxComparisons(candidateCount)
  if (estimatedComparisons <= 0) return 0
  const answerRatio = Math.min(1, answerCount / estimatedComparisons)
  return Math.min(99, Math.floor(Math.pow(answerRatio, 0.7) * 100))
}

function isValidRelationInput(
  relations: Record<string, DraftSortRelationRecord>,
  leftId: string,
  rightId: string,
): boolean {
  return leftId !== rightId && Boolean(relations[leftId] && relations[rightId])
}

function isSamePair(
  leftId: string,
  rightId: string,
  otherLeftId: string,
  otherRightId: string,
): boolean {
  return (
    (leftId === otherLeftId && rightId === otherRightId) ||
    (leftId === otherRightId && rightId === otherLeftId)
  )
}

function addUnique(items: string[], item: string): void {
  if (!items.includes(item)) items.push(item)
}

function stableHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}
