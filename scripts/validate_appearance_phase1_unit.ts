/**
 * Phase 1: 出場成績末尾列 → canonical 拡張のユニット検証。
 * `npm run validate:appearance-phase1`
 */
import assert from "node:assert/strict"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  STATS_ROW_APPEARANCE_START_INDEX,
  buildAppearanceZipResultOverrides,
  countNonEmptyAppearanceSlots,
  diagnoseBattingAppearanceSlotsVsPlateAppearances,
  extractAppearanceStatSlotsFromCells,
} from "../lib/yahooGame/appearanceStatsTrailingCells"
import {
  inferBattingLineFromStatsRow,
  inferPitchingLineFromStatsRow,
} from "../lib/yahooGame/buildCanonical"
import {
  plateAppearanceLastResultText,
  plateAppearanceResolvedResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

function main(): void {
  assert.equal(STATS_ROW_APPEARANCE_START_INDEX, 14)

  const cells = ["7", "山田", ".315", "4", "1", "2", "1", "0", "0", "0", "0", "0", "0", "1", "左安", "", "三振", "四球"]
  const slots = extractAppearanceStatSlotsFromCells(cells)
  assert.deepEqual(slots, ["左安", "", "三振", "四球"])
  assert.equal(countNonEmptyAppearanceSlots(slots), 3)

  const row = {
    yahooPlayerId: "1234567",
    playerName: "山田",
    cells,
  }
  const bl = inferBattingLineFromStatsRow(row)
  assert.ok(bl)
  assert.deepEqual(bl!.appearancePaSlotsJa, ["左安", "", "三振", "四球"])

  const pitchCells = [
    "投",
    "田中",
    "3.60",
    "6.0",
    "88",
    "24",
    "5",
    "1",
    "7",
    "2",
    "0",
    "0",
    "2",
    "2",
    "三振",
    "飛",
    "",
  ]
  const pl = inferPitchingLineFromStatsRow({
    yahooPlayerId: "7654321",
    playerName: "田中",
    cells: pitchCells,
  })
  assert.ok(pl)
  assert.deepEqual(pl!.appearanceVsBfSlotsJa, ["三振", "飛", ""])

  const doc: CanonicalGameDocument = {
    schemaVersion: "yahoo-game-canonical-v1",
    gameId: "test-game",
    builtAt: new Date().toISOString(),
    sourceSchema: "yahoo-game-normalized-v0",
    sourceCompositeFingerprint: "x",
    normalizedFetchedAt: new Date().toISOString(),
    game: {
      meta: { documentTitle: "", ogTitle: "" },
      scoreboard: [],
      teams: [],
      textPlayByPlay: [],
      statsPlayerLinkedRows: [],
      yahooPlayersMentioned: {},
      missingOrPartial: [],
      pitchByPitchNote: { status: "test" },
    },
    domain: {
      plateAppearances: [
        {
          paId: "test-game-1-表-1",
          inningHalf: "1回表",
          yahooBatterId: "1234567",
          resultSummaryJa: "左安",
        },
        {
          paId: "test-game-3-表-1",
          inningHalf: "3回表",
          yahooBatterId: "1234567",
          resultSummaryJa: "三振",
        },
        {
          paId: "test-game-5-表-1",
          inningHalf: "5回表",
          yahooBatterId: "1234567",
          resultSummaryJa: "四球",
        },
      ],
      pitchEvents: [],
      battingLines: [bl!],
      pitchingLines: [],
    },
  }
  const diag = diagnoseBattingAppearanceSlotsVsPlateAppearances(doc)
  assert.equal(diag.length, 1)
  assert.equal(diag[0]!.yahooBatterId, "1234567")
  assert.equal(diag[0]!.nSlotsNonEmpty, 3)
  assert.equal(diag[0]!.mPlateAppearances, 3)
  assert.equal(diag[0]!.ok, true)

  // Phase 2: zip 一致時は plateAppearanceResolvedResultText が出場成績スロットを返す
  const docZip: CanonicalGameDocument = {
    ...doc,
    domain: {
      ...doc.domain,
      battingLines: [
        {
          ...bl!,
          appearancePaSlotsJa: ["左安", "三振", "四球"],
        },
      ],
    },
  }
  const zip = buildAppearanceZipResultOverrides(docZip)
  assert.equal(zip.size, 3)
  assert.equal(
    plateAppearanceResolvedResultText(docZip, docZip.domain.plateAppearances[0]!),
    "左安",
  )
  assert.equal(
    plateAppearanceResolvedResultText(docZip, {
      ...docZip.domain.plateAppearances[0]!,
      resultSummaryJa: "違う要約",
    }),
    "左安",
  )

  const prevFlag = process.env.TOPPAGE_APPEARANCE_PRIMARY
  process.env.TOPPAGE_APPEARANCE_PRIMARY = "0"
  try {
    const pa0 = { ...docZip.domain.plateAppearances[0]!, resultSummaryJa: "違う要約" }
    assert.equal(plateAppearanceResolvedResultText(docZip, pa0), plateAppearanceLastResultText(pa0))
  } finally {
    if (prevFlag === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
    else process.env.TOPPAGE_APPEARANCE_PRIMARY = prevFlag
  }

  // Phase 2（計画書）: appearance_only では zip に無い打席は要約に落とさない
  const prevSrc = process.env.TOPPAGE_PLATE_RESULT_SOURCE
  const prevAp = process.env.TOPPAGE_APPEARANCE_PRIMARY
  process.env.TOPPAGE_APPEARANCE_PRIMARY = "1"
  try {
    process.env.TOPPAGE_PLATE_RESULT_SOURCE = "hybrid"
    const paNoZip: CanonicalGameDocument = {
      ...docZip,
      domain: {
        ...docZip.domain,
        battingLines: [{ ...docZip.domain.battingLines[0]!, appearancePaSlotsJa: ["左安", "", ""] }],
      },
    }
    const paLast = paNoZip.domain.plateAppearances[2]!
    assert.equal(
      plateAppearanceResolvedResultText(paNoZip, { ...paLast, resultSummaryJa: "四球" }),
      plateAppearanceLastResultText({ ...paLast, resultSummaryJa: "四球" }),
    )

    process.env.TOPPAGE_PLATE_RESULT_SOURCE = "appearance_only"
    assert.equal(
      plateAppearanceResolvedResultText(paNoZip, { ...paLast, resultSummaryJa: "四球" }),
      "",
    )
  } finally {
    if (prevSrc === undefined) delete process.env.TOPPAGE_PLATE_RESULT_SOURCE
    else process.env.TOPPAGE_PLATE_RESULT_SOURCE = prevSrc
    if (prevAp === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
    else process.env.TOPPAGE_APPEARANCE_PRIMARY = prevAp
  }

  console.log("validate_appearance_phase1_unit: OK")
}

main()
