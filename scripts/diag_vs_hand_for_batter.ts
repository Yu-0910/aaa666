/**
 * 1 選手の対左右集計を打席単位でダンプ（調査用）。
 * npx tsx scripts/diag_vs_hand_for_batter.ts --yahoo 1400127
 */
import { loadVsHandRowsFromCanonicalWithDebug } from "../lib/seasonStatsPilot"

function main() {
  const yahoo = process.argv.includes("--yahoo")
    ? String(process.argv[process.argv.indexOf("--yahoo") + 1] ?? "").trim()
    : "1400127"
  const d = loadVsHandRowsFromCanonicalWithDebug(yahoo)
  console.log(JSON.stringify({ yahoo, rows: d.rows.map((r) => ({ label: r.split_label, ab: r.ab, h: r.h, pa: r.pa })) }, null, 2))
  const sumAb = d.rows
    .filter((r) => r.split_type === "vs_hand" && r.split_value !== "unknown")
    .reduce((s, r) => s + r.ab, 0)
  console.log("sum AB (R+L):", sumAb)
}

main()
