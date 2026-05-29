/**
 * Python などから lib/yahooGame/pitchCountSim の分類をそのまま使うための CLI。
 *
 * stdin: JSON { "strings": string[] }（重複可。空文字も可）
 * stdout: JSON { "byString": Record<string, { countKind, typeBucket }> }
 *
 *   echo '{"strings":["ボール","空振り"]}' | npx tsx scripts/pitch_result_ja_classify_cli.ts
 */

import { readFileSync } from "fs"
import {
  bucketPitchResultForTypeRow,
  classifyPitchResultForCountJa,
} from "../lib/yahooGame/pitchCountSim"

function main(): void {
  const raw = readFileSync(0, "utf8")
  let input: { strings?: unknown }
  try {
    input = JSON.parse(raw) as { strings?: unknown }
  } catch {
    console.error("[pitch_result_ja_classify_cli] invalid JSON on stdin")
    process.exit(1)
  }
  const arr = input.strings
  const strings = Array.isArray(arr)
    ? arr.map((s) => (typeof s === "string" ? s : String(s ?? "")))
    : []

  const byString: Record<string, { countKind: string; typeBucket: string }> =
    {}
  for (const s of strings) {
    byString[s] = {
      countKind: classifyPitchResultForCountJa(s),
      typeBucket: bucketPitchResultForTypeRow(s),
    }
  }
  process.stdout.write(
    JSON.stringify({ byString }, null, 0),
    "utf8"
  )
}

main()
