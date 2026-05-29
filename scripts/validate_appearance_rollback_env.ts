/**
 * Phase 4 ゲート: `TOPPAGE_APPEARANCE_PRIMARY` による zip 無効化が
 * `plateAppearanceResolvedResultText` に反映されることを検証する。
 *
 *   npm run validate:appearance-rollback
 */
import assert from "node:assert/strict"
import type { BattingLine, CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"
import { isAppearancePrimaryZipEnabled } from "../lib/yahooGame/appearancePrimaryFeatureFlag"
import {
  plateAppearanceLastResultText,
  plateAppearanceResolvedResultText,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

function withEnv<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.TOPPAGE_APPEARANCE_PRIMARY
  if (value === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
  else process.env.TOPPAGE_APPEARANCE_PRIMARY = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
    else process.env.TOPPAGE_APPEARANCE_PRIMARY = prev
  }
}

function main(): void {
  withEnv(undefined, () => assert.equal(isAppearancePrimaryZipEnabled(), true))
  withEnv("1", () => assert.equal(isAppearancePrimaryZipEnabled(), true))
  withEnv("true", () => assert.equal(isAppearancePrimaryZipEnabled(), true))
  withEnv("0", () => assert.equal(isAppearancePrimaryZipEnabled(), false))
  withEnv("false", () => assert.equal(isAppearancePrimaryZipEnabled(), false))
  withEnv("off", () => assert.equal(isAppearancePrimaryZipEnabled(), false))
  withEnv("no", () => assert.equal(isAppearancePrimaryZipEnabled(), false))
  withEnv("typo_or_unknown", () => assert.equal(isAppearancePrimaryZipEnabled(), true))

  const bl: BattingLine = {
    yahooPlayerId: "1234567",
    playerName: "山田",
    inferredFrom: "stats_row_v0",
    // zip は「非空スロット数 === dedupe 後の当該打者打席数」のときだけ張る（本番と同じ）
    appearancePaSlotsJa: ["左安"],
  }
  const doc: CanonicalGameDocument = {
    schemaVersion: "yahoo-game-canonical-v1",
    gameId: "rollback-test",
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
          paId: "rollback-test-1-表-1",
          inningHalf: "1回表",
          yahooBatterId: "1234567",
          resultSummaryJa: "左安",
        },
      ],
      pitchEvents: [],
      battingLines: [bl],
      pitchingLines: [],
    },
  }

  const pa: PlateAppearance = {
    ...doc.domain.plateAppearances[0]!,
    resultSummaryJa: "違う要約",
  }

  withEnv(undefined, () => {
    assert.equal(plateAppearanceResolvedResultText(doc, pa), "左安")
  })
  withEnv("0", () => {
    assert.equal(plateAppearanceResolvedResultText(doc, pa), plateAppearanceLastResultText(pa))
  })

  console.log("validate_appearance_rollback_env: OK")
}

main()
