/**
 * appearance_slots / ハイブリッド集計で score 由来 runnerEvents のみ CS に使うことの退行検証。
 *
 *   npx tsx scripts/verify_cs_runner_events_appearance_slots.ts
 */

import assert from "node:assert/strict"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  aggregateBattingSeasonByYahooBatterFromAppearanceSlots,
  csCountForBatterFromRunnerEvents,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

function minimalDoc(overrides: Partial<CanonicalGameDocument>): CanonicalGameDocument {
  return {
    gameId: "test-game",
    domain: { battingLines: [], plateAppearances: [], runnerEvents: [] },
    game: { statsPlayerLinkedRows: [] },
    ...overrides,
  } as CanonicalGameDocument
}

function run(): void {
  const bid = "1234567"
  const doc = minimalDoc({
    domain: {
      battingLines: [
        {
          yahooPlayerId: bid,
          playerName: "テスト",
          ab: 1,
          sb: 1,
          appearancePaSlotsJa: ["中安"],
          inferredFrom: "stats_row_v0",
        },
      ],
      plateAppearances: [],
      runnerEvents: [
        {
          eventId: "e-score",
          kind: "CS",
          yahooRunnerId: bid,
          inningHalf: "3回表",
          sourceTier: "score",
        },
        {
          eventId: "e-text-dup",
          kind: "CS",
          yahooRunnerId: bid,
          inningHalf: "3回表",
          sourceTier: "yahooTextDom",
        },
        {
          eventId: "e-text-other",
          kind: "CS",
          yahooRunnerId: bid,
          inningHalf: "5回表",
          sourceTier: "textPbp",
        },
      ],
    },
  })

  assert.equal(csCountForBatterFromRunnerEvents(doc, bid), 1, "score のみ（他 tier は無視）")

  const byBatter = aggregateBattingSeasonByYahooBatterFromAppearanceSlots([doc])
  const agg = byBatter.get(bid)
  assert.ok(agg, "集計対象になる")
  assert.equal(agg!.cs, 1, "Phase11 appearance_slots で score CS のみ")
  assert.equal(agg!.sb, 1, "sb は battingLines のみ")

  const csOnlyBid = "9999999"
  const csOnlyDoc = minimalDoc({
    domain: {
      battingLines: [],
      plateAppearances: [],
      runnerEvents: [
        {
          eventId: "e-cs-only",
          kind: "CS",
          yahooRunnerId: csOnlyBid,
          inningHalf: "1回裏",
          sourceTier: "score",
        },
      ],
    },
  })
  assert.equal(csCountForBatterFromRunnerEvents(csOnlyDoc, csOnlyBid), 1)
  const csOnlyAgg = aggregateBattingSeasonByYahooBatterFromAppearanceSlots([csOnlyDoc]).get(csOnlyBid)
  assert.ok(csOnlyAgg, "出場スロット無しでも score CS で集計対象")
  assert.equal(csOnlyAgg!.cs, 1)

  console.log("[verify_cs_runner_events_appearance_slots] OK")
}

run()
