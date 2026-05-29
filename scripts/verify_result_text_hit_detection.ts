/**
 * 結果テキストの安打判定が注釈（[]）で誤爆しないことの退行検証。
 *
 * 例: "捕ゴロ[ヒットエンドラン]" はアウトであり、「ヒット」文字列で安打扱いしてはいけない。
 *
 * 実行:
 *   npx tsx scripts/verify_result_text_hit_detection.ts
 */

import assert from "assert"
import { isAtBat } from "../lib/yahooGame/resultJaHitBases"
import {
  getTotalBasesFromResultJa,
  isHitResultJa,
  isInterferenceResultText,
  stripBracketNotes,
  shouldTreatInterferenceAsAtBat,
} from "../lib/yahooGame/paSettlementStatsFromResultJa"

function run(): void {
  assert.strictEqual(stripBracketNotes("捕ゴロ[ヒットエンドラン]"), "捕ゴロ")
  assert.strictEqual(isHitResultJa("捕ゴロ[ヒットエンドラン]"), false, "注釈ヒットで安打誤判定しない")
  assert.strictEqual(getTotalBasesFromResultJa("捕ゴロ[ヒットエンドラン]"), 0, "塁打も 0")

  assert.strictEqual(isHitResultJa("中安[ランエンドヒット]"), true, "本体が安打なら安打")
  assert.strictEqual(getTotalBasesFromResultJa("中安[ランエンドヒット]"), 1)

  assert.strictEqual(isHitResultJa("一安[リプレー検証後判定変わらず]"), true, "一安も安打")
  assert.strictEqual(getTotalBasesFromResultJa("一安[リプレー検証後判定変わらず]"), 1)

  assert.strictEqual(isHitResultJa("二安[ダイビングキャッチ、送球が逸れる]"), true, "二安も安打（内野安打）")
  assert.strictEqual(getTotalBasesFromResultJa("二安[ダイビングキャッチ、送球が逸れる]"), 1)

  assert.strictEqual(isHitResultJa("三安"), true, "三安も安打（内野安打）")
  assert.strictEqual(getTotalBasesFromResultJa("三安"), 1)

  // 既存の例外（ファウル/ボール行の補足）も維持
  assert.strictEqual(isHitResultJa("ファウル[ランエンドヒット]"), false)
  assert.strictEqual(isHitResultJa("ボール[ランエンドヒット、送球が逸れる]"), false)

  // 守備妨害: 原則は打数に入れないが、三振後の付記なら打数・三振として扱う
  assert.strictEqual(
    shouldTreatInterferenceAsAtBat("空三振[ランエンドヒット、バットが捕手に直撃、守備妨害]"),
    true,
  )
  assert.strictEqual(shouldTreatInterferenceAsAtBat("守備妨害"), false)
  assert.strictEqual(isInterferenceResultText("打妨"), true)
  assert.strictEqual(shouldTreatInterferenceAsAtBat("打妨"), false)
  assert.strictEqual(isAtBat("打妨"), false, "出場成績の打妨は打数に含めない")

  console.log("verify_result_text_hit_detection: OK")
}

run()

