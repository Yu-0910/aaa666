/**
 * 打席結果テキストの集計用スナップショット（TS SSOT）を Python から使うための CLI。
 *
 * stdin: JSON { "strings": string[] }
 * stdout: JSON { "byString": Record<string, PaOutcomeStatsRow> }
 */

import { readFileSync } from "fs"
import {
  paOutcomeStatsFromResultJa,
  type PaOutcomeStatsRow,
} from "../lib/yahooGame/paSettlementStatsFromResultJa"

function main(): void {
  const raw = readFileSync(0, "utf8")
  let input: { strings?: unknown }
  try {
    input = JSON.parse(raw) as { strings?: unknown }
  } catch {
    console.error("[pa_outcome_classify_cli] invalid JSON on stdin")
    process.exit(1)
  }
  const arr = input.strings
  const strings = Array.isArray(arr)
    ? arr.map((s) => (typeof s === "string" ? s : String(s ?? "")))
    : []

  const byString: Record<string, PaOutcomeStatsRow> = {}
  for (const s of strings) {
    byString[s] = paOutcomeStatsFromResultJa(s)
  }
  process.stdout.write(JSON.stringify({ byString }), "utf8")
}

main()
