/**
 * 菊池 L1=6 残差 — r1→r2 の1打席移動候補を総当たり
 * npx tsx scripts/diag_kikuchi_r1_to_r2_probe.ts
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromResultJa,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const { ref: REF, paRows } = JSON.parse(
  readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8"),
) as {
  ref: Record<string, Record<string, number>>
  paRows: Array<{ paId: string; hybrid: string; result: string; token: string; chain: string }>
}

const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const

function l1(m: Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>): number {
  let d = 0
  for (const [k, r] of Object.entries(REF)) {
    const g = m.get(k) ?? emptyBattingSeasonAggYahoo()
    for (const sk of STAT_KEYS) d += Math.abs((g[sk] as number) - r[sk])
  }
  return d
}

function build(overrides: Record<string, string>) {
  const m = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  for (const row of paRows) {
    const sit = overrides[row.paId] ?? row.hybrid
    const g = m.get(sit) ?? emptyBattingSeasonAggYahoo()
    g.pa += 1
    updateBattingAggFromResultJa(g, row.result)
    m.set(sit, g)
  }
  return m
}

console.log("baseline L1 =", l1(build({})))
console.log("\n=== r1→r2 単独移動で L1=0 になる打席 ===\n")

const hits: typeof paRows = []
for (const row of paRows) {
  if (row.hybrid !== "r1") continue
  const trial = build({ [row.paId]: "r2" })
  if (l1(trial) === 0) hits.push(row)
}

if (hits.length === 0) {
  console.log("（単独 r1→r2 では L1=0 不可）")
} else {
  for (const r of hits) {
    console.log(`${r.paId}\t${r.token}\t${r.result}\ttext=${r.hybrid} chain=${r.chain}`)
  }
}

console.log("\n=== 8624/8817 周辺 ===\n")
for (const id of ["2021038624-9-裏-2", "2021038817-2-表-2"]) {
  const row = paRows.find((r) => r.paId === id)!
  console.log(`${id}  solo→r2 L1=${l1(build({ [id]: "r2" }))}`)
  console.log(`  ${row.token} ${row.result} chain=${row.chain}`)
}
