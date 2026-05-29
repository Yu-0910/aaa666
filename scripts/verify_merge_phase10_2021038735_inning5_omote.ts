/**
 * 2026-04-18 日本ハム vs 西武（gameId 2021038735）5回表の攻撃（先発側＝表）について、
 * derived phase10 の一行群から pickResultSummaryJaFromPitchRows の出力が期待どおりか検証する。
 *
 *   npm run verify:merge-phase10-2021038735-inning5-omote
 */

import assert from "assert"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  pickResultSummaryJaFromPitchRows,
  type Phase10PitchRow,
} from "../lib/yahooGame/mergePhase10FromPitchRows"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

type Phase10File = {
  pitchRows?: Array<Record<string, string | undefined>>
}

function numPitchNo(row: Record<string, string | undefined>): number {
  const n = parseInt(String(row.pitch_no ?? "0"), 10)
  return Number.isFinite(n) ? n : 0
}

function toPhase10Rows(rows: Record<string, string | undefined>[]): Phase10PitchRow[] {
  return rows.map((x) => x as unknown as Phase10PitchRow)
}

function run(): void {
  const path = join(
    projectRoot,
    "_data",
    "scraped_games",
    "derived",
    "2021038735_phase10_restored.json",
  )
  const raw = JSON.parse(readFileSync(path, "utf8")) as Phase10File
  const pitchRows = Array.isArray(raw.pitchRows) ? raw.pitchRows : []

  const top5 = pitchRows.filter(
    (r) => r.inning === "5" && (r.top_bottom === "表" || r.top_bottom === "\u8868"),
  )

  const byOrder = new Map<string, typeof pitchRows>()
  for (const r of top5) {
    const bo = String(r.bat_order ?? "").trim()
    if (!bo) continue
    const list = byOrder.get(bo) ?? []
    list.push(r)
    byOrder.set(bo, list)
  }

  /** 打順 → 期待する resultSummaryJa（§6a・§6b 適用後） */
  const expected: Record<string, string> = {
    // カナリオ: 見逃し → 二ゴロ
    "1": "二ゴロ",
    // 秋山: … → 空三振
    "2": "空三振[ワンバウンド]",
    // 滝澤: 見逃し → 左安
    "3": "左安[グラブ弾く]",
    // 桑原: 末尾がボール[…の前は ファウル[ランエンドヒット]（末尾ボール系を剥がす）
    "4": "ファウル[ランエンドヒット]",
  }

  for (const bo of Object.keys(expected).sort()) {
    const list = byOrder.get(bo)
    assert.ok(list && list.length > 0, `5回表 打順${bo}: 球行がありません (${path})`)

    const sorted = [...list].sort((a, b) => numPitchNo(a) - numPitchNo(b))
    const summary = pickResultSummaryJaFromPitchRows(toPhase10Rows(sorted))

    assert.strictEqual(
      summary,
      expected[bo],
      `5回表 打順${bo}: resultSummaryJa が期待と異なります（実際: ${summary}）`,
    )
  }

  console.log(
    "verify_merge_phase10_2021038735_inning5_omote: OK（5回表・攻撃 打順1〜4）",
  )
}

run()
