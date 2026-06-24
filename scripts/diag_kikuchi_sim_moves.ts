import { readFileSync } from "fs"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromResultJa,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

const d = JSON.parse(readFileSync("_data/diag_kikuchi_per_pa.json", "utf8"))
const REF = d.ref
const rows = d.paRows as Array<{ paId: string; hybrid: string; result: string }>

function l1(m: Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>): number {
  let s = 0
  for (const [k, r] of Object.entries(REF) as [string, (typeof REF)[string]][]) {
    const g = m.get(k) ?? emptyBattingSeasonAggYahoo()
    for (const sk of ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const) {
      s += Math.abs(g[sk] - r[sk])
    }
  }
  return s
}

function build(overrides: Record<string, string>): Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>> {
  const m = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  for (const row of rows) {
    const sit = overrides[row.paId] ?? row.hybrid
    const g = m.get(sit) ?? emptyBattingSeasonAggYahoo()
    g.pa += 1
    updateBattingAggFromResultJa(g, row.result)
    m.set(sit, g)
  }
  return m
}

const cases: Record<string, string>[] = [
  { "2021038624-9-裏-2": "r2", "2021038699-1-表-2": "none" },
  { "2021038817-2-表-2": "r2", "2021038699-1-表-2": "none" },
  { "2021038624-9-裏-2": "r2", "2021038817-2-表-2": "r2", "2021038699-1-表-2": "none" },
  { "2021038699-1-表-2": "none" },
  { "2021038624-9-裏-2": "r2" },
]

for (const c of cases) {
  console.log(JSON.stringify(c), "L1=", l1(build(c)))
}
