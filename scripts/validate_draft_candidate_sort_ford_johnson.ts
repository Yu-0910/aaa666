import assert from "node:assert/strict"
import {
  applyDraftSortAnswer,
  createInitialSortState,
  rebuildDraftSortState,
  undoDraftSortAnswer,
  type DraftSortChoice,
  type DraftSortState,
} from "../app/draft-candidate-sort/_lib/sortEngine"
import {
  createDraftSortSession,
  draftSortStorageKey,
  loadDraftSortSession,
  saveDraftSortSession,
} from "../app/draft-candidate-sort/_lib/draftSortStorage"

type RankMap = Record<string, number>

function answerUntilComplete(
  ids: string[],
  choose: (leftId: string, rightId: string) => DraftSortChoice,
): DraftSortState {
  let state = createInitialSortState(ids)
  const seenPairs = new Set<string>()
  let guard = 0

  while (!state.completed) {
    assert.ok(state.currentComparison, "current comparison exists")
    const { leftId, rightId } = state.currentComparison
    const pairKey = [leftId, rightId].sort().join("::")
    assert.equal(seenPairs.has(pairKey), false, "same pair is not asked twice")
    seenPairs.add(pairKey)
    state = applyDraftSortAnswer(
      state,
      choose(leftId, rightId),
      new Date(`2026-01-01T00:00:${String(guard).padStart(2, "0")}Z`),
      { leftId, rightId },
    )
    guard += 1
    assert.ok(guard < 300, "sort completes without infinite loop")
  }

  return state
}

function choiceFromRanks(ranks: RankMap) {
  return (leftId: string, rightId: string): DraftSortChoice => {
    if (ranks[leftId] === ranks[rightId]) return "tie"
    return ranks[leftId] < ranks[rightId] ? "left" : "right"
  }
}

function assertRankingMatchesRanks(state: DraftSortState, ranks: RankMap): void {
  for (let index = 1; index < state.ranking.length; index += 1) {
    const previous = state.ranking[index - 1]
    const current = state.ranking[index]
    assert.ok(
      ranks[previous] <= ranks[current],
      `${previous} should not be ranked below ${current}`,
    )
  }
}

function installLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  ;(globalThis as typeof globalThis & { window: unknown }).window = {
    localStorage: {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
  }
  return store
}

function run(): void {
  assert.equal(createInitialSortState([]).completed, true, "0 candidates")
  assert.equal(createInitialSortState(["a"]).completed, true, "1 candidate")

  const twoLeft = answerUntilComplete(["a", "b"], () => "left")
  assert.equal(twoLeft.ranking.length, 2, "2 candidates complete")

  const oddRanks = { a: 1, b: 2, c: 3, d: 4, e: 5 }
  const odd = answerUntilComplete(Object.keys(oddRanks), choiceFromRanks(oddRanks))
  assertRankingMatchesRanks(odd, oddRanks)

  const evenRanks = { a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 }
  const even = answerUntilComplete(Object.keys(evenRanks), choiceFromRanks(evenRanks))
  assertRankingMatchesRanks(even, evenRanks)

  const allLeft = answerUntilComplete(["a", "b", "c", "d"], () => "left")
  assert.equal(allLeft.completed, true, "all-left answers complete")

  const allRight = answerUntilComplete(["a", "b", "c", "d"], () => "right")
  assert.equal(allRight.completed, true, "all-right answers complete")

  const randomRanks = { a: 4, b: 1, c: 6, d: 3, e: 2, f: 5, g: 7 }
  const random = answerUntilComplete(
    Object.keys(randomRanks),
    choiceFromRanks(randomRanks),
  )
  assertRankingMatchesRanks(random, randomRanks)

  const ties = answerUntilComplete(
    ["a", "b", "c", "d"],
    choiceFromRanks({ a: 1, b: 1, c: 3, d: 3 }),
  )
  assert.deepEqual(
    ties.rankEntries.map((entry) => entry.rank),
    [1, 1, 3, 3],
    "competition ranks are used for ties",
  )

  const allTie = answerUntilComplete(["a", "b", "c", "d", "e"], () => "tie")
  assert.equal(allTie.completed, true, "all-tie answers complete")
  assert.ok(allTie.tieGroups.some((group) => group.length === 5), "all tie group")

  const transitive = rebuildDraftSortState(["a", "b", "c"], [
    {
      leftId: "a",
      rightId: "b",
      choice: "left",
      answeredAt: "2026-01-01T00:00:00.000Z",
    },
    {
      leftId: "b",
      rightId: "c",
      choice: "left",
      answeredAt: "2026-01-01T00:00:01.000Z",
    },
  ])
  assert.ok(
    transitive.relations.a.less.includes("c"),
    "A > B and B > C imply A > C",
  )

  let undoBase = createInitialSortState(["a", "b", "c", "d"])
  assert.ok(undoBase.currentComparison)
  undoBase = applyDraftSortAnswer(undoBase, "left")
  const afterOne = undoBase
  undoBase = applyDraftSortAnswer(undoBase, "left")
  const undone = undoDraftSortAnswer(undoBase)
  assert.deepEqual(undone.answers, afterOne.answers, "undo removes last answer")
  assert.deepEqual(
    undone.currentComparison,
    afterOne.currentComparison,
    "undo recalculates next question",
  )

  const reloaded = rebuildDraftSortState(random.candidateIds, random.answers)
  assert.deepEqual(reloaded.ranking, random.ranking, "reload rebuilds ranking")
  assert.deepEqual(
    reloaded.currentComparison,
    random.currentComparison,
    "reload rebuilds position",
  )

  const reordered = answerUntilComplete(
    Object.keys(randomRanks).reverse(),
    choiceFromRanks(randomRanks),
  )
  assert.deepEqual(
    reordered.ranking,
    random.ranking,
    "initial candidate order does not change final ranking",
  )

  let doubleClick = createInitialSortState(["a", "b", "c"])
  assert.ok(doubleClick.currentComparison)
  const comparison = doubleClick.currentComparison
  doubleClick = applyDraftSortAnswer(doubleClick, "left", new Date(), comparison)
  const answerCount = doubleClick.answers.length
  doubleClick = applyDraftSortAnswer(doubleClick, "left", new Date(), comparison)
  assert.equal(
    doubleClick.answers.length,
    answerCount,
    "stale repeated answer is ignored",
  )

  const store = installLocalStorageMock({
    [draftSortStorageKey]: JSON.stringify({ version: 1, targetFilter: "all" }),
  })
  assert.equal(loadDraftSortSession(), null, "old session is not loaded")
  assert.equal(store.has(draftSortStorageKey), false, "old session key is cleared")

  const session = createDraftSortSession("all")
  const savedState = answerUntilComplete(["a", "b", "c"], () => "left")
  saveDraftSortSession({
    ...session,
    candidateIds: savedState.candidateIds,
    answers: savedState.answers,
    ranking: savedState.ranking,
    rankEntries: savedState.rankEntries,
    relations: savedState.relations,
    progressPercent: savedState.progressPercent,
    completedReason: savedState.completedReason,
    unknownCounts: savedState.unknownCounts,
    tieGroups: savedState.tieGroups,
  })
  assert.equal(loadDraftSortSession()?.algorithmVersion, 2, "v2 session loads")

  console.log("draft candidate Ford-Johnson validation passed")
}

run()
