import assert from "node:assert/strict"

const sortEngine = await import("../app/draft-candidate-sort/_lib/sortEngine.ts")
const resultBuilder = await import("../app/draft-candidate-sort/_lib/resultBuilder.ts")
const candidateData = await import("../app/draft-candidate-sort/_lib/candidateData.ts")
const storage = await import("../app/draft-candidate-sort/_lib/draftSortStorage.ts")

const {
  applyDraftSortAnswer,
  createInitialSortState,
  shouldShowTieButton,
  undoDraftSortAnswer,
} = sortEngine
const {
  buildBanzukeRows,
  buildDraftPredictionRows,
  buildUnknownRows,
} = resultBuilder
const {
  filterCandidatesForSort,
  getCandidateDataSet,
  getCandidatesForSort,
  validateCandidateDataSet,
} = candidateData
const { createDraftSortSession } = storage

const now = new Date("2026-09-17T00:00:00.000Z")

{
  const session = createDraftSortSession("recommended", now)
  assert.equal(session.currentRoute, "/draft-candidate-sort/sort")
  assert.equal(session.targetFilter, "recommended")
  assert.deepEqual(session.answers, [])
}

{
  const dataSet = getCandidateDataSet()
  assert.ok(dataSet.displayPlayers.length > 0)
  assert.equal(dataSet.displayPlayers.length, dataSet.internalPriority.length)
  assert.deepEqual(validateCandidateDataSet(dataSet), [])
  assert.ok(filterCandidatesForSort(getCandidatesForSort(), "recommended").length > 0)
}

{
  const errors = validateCandidateDataSet({
    version: "test",
    updatedAt: "2026-09-17",
    displayPlayers: [
      {
        id: "a",
        name: "候補A",
        category: "highSchool",
        positionGroup: "pitcher",
        schoolOrTeam: "所属A",
        throwBat: "右右",
        heightWeight: "180/80",
      },
    ],
    internalPriority: [{ id: "a", priorityGroup: "recommended" }],
  })
  assert.deepEqual(errors, [])
}

{
  const candidates = [
    {
      id: "a",
      name: "候補A",
      category: "highSchool",
      positionGroup: "pitcher",
      schoolOrTeam: "所属A",
      throwBat: "右右",
      heightWeight: "180/80",
      priorityGroup: "recommended",
    },
    {
      id: "b",
      name: "候補B",
      category: "university",
      positionGroup: "infielder",
      schoolOrTeam: "所属B",
      throwBat: "右左",
      heightWeight: "175/75",
      priorityGroup: "normal",
    },
    {
      id: "c",
      name: "候補C",
      category: "corporate",
      positionGroup: "outfielder",
      schoolOrTeam: "所属C",
      throwBat: "左左",
      heightWeight: "178/78",
      priorityGroup: "recommended",
    },
  ]
  assert.equal(filterCandidatesForSort(candidates, "all").length, 3)
  assert.equal(filterCandidatesForSort(candidates, "highSchool").length, 1)
  assert.equal(filterCandidatesForSort(candidates, "university").length, 1)
  assert.equal(filterCandidatesForSort(candidates, "universityCorporate").length, 2)
  assert.equal(filterCandidatesForSort(candidates, "recommended").length, 2)
}

{
  let state = createInitialSortState(["a", "b"])
  state = applyDraftSortAnswer(state, "unknown", now)
  assert.equal(state.completed, true)
  assert.equal(state.unknownCounts.a, 1)
  assert.equal(state.unknownCounts.b, 1)
}

{
  let state = createInitialSortState(Array.from({ length: 32 }, (_, index) => `p${index}`))
  for (let index = 0; index < 10; index += 1) {
    state = applyDraftSortAnswer(state, index < 2 ? "tie" : "left", now)
  }
  assert.equal(shouldShowTieButton(state.answers), false)
  const undone = undoDraftSortAnswer(state)
  assert.equal(undone.answers.length, 9)
  assert.equal(shouldShowTieButton(undone.answers), true)
}

{
  const labels = buildBanzukeRows(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]).map(
    (row) => row.rankLabel,
  )
  assert.deepEqual(labels, ["横綱", "大関", "関脇", "小結", "前頭1"])
}

{
  const rows = buildDraftPredictionRows(Array.from({ length: 40 }, (_, index) => `p${index + 1}`))
  assert.equal(rows.length, 36)
  assert.equal(rows.filter((row) => row.round === 1).length, 12)
  assert.equal(rows.filter((row) => row.round === 2).length, 12)
  assert.equal(rows.filter((row) => row.round === 3).length, 12)
  assert.equal(rows.at(-1).overallRank, 36)
}

{
  assert.deepEqual(buildUnknownRows({ a: 1, b: 3, c: 0 }), [
    { candidateId: "b", unknownCount: 3 },
    { candidateId: "a", unknownCount: 1 },
  ])
}

console.log("draft candidate sort phase13 validation passed")
