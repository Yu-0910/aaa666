/**
 * pickResultSummaryJaFromPitchRows（§6a・§6b）の退行検証。
 *   npx tsx scripts/verify_merge_phase10_result_summary.ts
 */

import assert from "assert"
import {
  pickResultSummaryJaFromPitchRows,
  type Phase10PitchRow,
} from "../lib/yahooGame/mergePhase10FromPitchRows"

function r(pitch_no: string, result: string): Phase10PitchRow {
  return { inning: "1", top_bottom: "表", bat_order: "1", pitch_no, result }
}

function run(): void {
  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "一ゴロ"), r("2", "ボール")]),
    "一ゴロ",
    "末尾ボールは直前行を要約に使う",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "左安"), r("2", "ボール[ランエンド]")]),
    "左安",
    "末尾ボール[…は直前行を要約に使う",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([
      r("1", "ファウル[ランエンドヒット]"),
      r("2", "ボール[送球が逸れる]"),
    ]),
    "ファウル[ランエンドヒット]",
    "桑原型: 末尾ボール[のみ剥がし",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "左安"), r("2", "見逃し")]),
    "左安",
    "§6b: 末尾見逃しのみは剥がす",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "左安"), r("2", "空振り"), r("3", "見逃し")]),
    "左安",
    "§6b: ストライク進行のみが連続すると剥がす",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "三振"), r("2", "ファウル")]),
    "三振",
    "素のファウルだけ末尾なら剥がす（直前が決着）",
  )

  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "ボール")]),
    "ボール",
    "1行だけボールならフォールバック（取得欠損時）",
  )

  // ファウル[…] はストライク「進行のみ」ではないので剥がさない
  assert.strictEqual(
    pickResultSummaryJaFromPitchRows([r("1", "左安"), r("2", "ファウル[ランエンドヒット]")]),
    "ファウル[ランエンドヒット]",
    "括弧付きファウルは末尾のまま（別ルール）",
  )

  const evFromRows = (rows: Phase10PitchRow[]): PitchEvent[] =>
    rows.map((row, i) => ({
      pitchIndex: parseInt(row.pitch_no ?? "0", 10) || i + 1,
      resultJa: row.result ?? null,
    }))

  assert.strictEqual(
    pickResultSummaryJaFromPitchEvents(evFromRows([r("1", "一ゴロ"), r("2", "ボール")])),
    pickResultSummaryJaFromPitchRows([r("1", "一ゴロ"), r("2", "ボール")]),
    "pitchEvents 経路は Phase10 行と同じ要約になる",
  )

  console.log("verify_merge_phase10_result_summary: OK")
}

run()
