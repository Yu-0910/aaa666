/**
 * 1 batter について `loadVsHandRowsFromCanonicalWithDebug` を呼び、
 * `cellTeamUnresolvedSamples` を含む reconciliation を表示する。
 *
 * 使い方: npx tsx scripts/diag_phase29_one_batter.ts <yahoo_id>
 */
import { loadVsHandRowsFromCanonicalWithDebug } from "@/lib/seasonStatsPilot"

const bid = process.argv[2]
if (!bid || !/^\d+$/.test(bid)) {
  console.error("usage: tsx scripts/diag_phase29_one_batter.ts <yahoo_id>")
  process.exit(2)
}

const r = loadVsHandRowsFromCanonicalWithDebug(bid)
const recon = r.reconciliation
console.log(JSON.stringify(
  {
    rows: r.rows.map((row) => ({ split: row.split_value, pa: row.pa, ab: row.ab, h: row.h, hr: row.hr })),
    reconciliation: recon,
  },
  null,
  2,
))
