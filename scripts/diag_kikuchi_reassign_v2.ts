/**
 * 菊池 L1=10 残差 — なし/一塁/二塁/三塁 プールの最適再配分
 * npx tsx scripts/diag_kikuchi_reassign_v2.ts
 */
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import {
  emptyBattingSeasonAggYahoo,
  updateBattingAggFromResultJa,
  type BattingSeasonAggYahoo,
} from "../lib/yahooGame/canonicalBattingSeasonAgg"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const REF = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")).ref

type PaRow = { paId: string; hybrid: string; result: string }

const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const
const FLEX = new Set(["none", "r1", "r2", "r3"])

function paAgg(result: string): BattingSeasonAggYahoo {
  const a = emptyBattingSeasonAggYahoo()
  a.pa = 1
  updateBattingAggFromResultJa(a, result)
  return a
}

function l1FromMap(m: Map<string, BattingSeasonAggYahoo>): number {
  let d = 0
  for (const [k, r] of Object.entries(REF)) {
    const g = m.get(k) ?? emptyBattingSeasonAggYahoo()
    for (const sk of STAT_KEYS) d += Math.abs((g[sk] as number) - r[sk])
  }
  return d
}

function addAgg(a: BattingSeasonAggYahoo, b: BattingSeasonAggYahoo): void {
  for (const k of STAT_KEYS) (a[k] as number) += b[k] as number
}

function cloneMap(m: Map<string, BattingSeasonAggYahoo>): Map<string, BattingSeasonAggYahoo> {
  const out = new Map<string, BattingSeasonAggYahoo>()
  for (const [k, v] of m) out.set(k, { ...v })
  return out
}

function main(): void {
  const { paRows } = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")) as {
    paRows: PaRow[]
  }

  type Item = { idx: number; row: PaRow; agg: BattingSeasonAggYahoo; cur: string }
  const flex: Item[] = []
  const fixed = new Map<string, BattingSeasonAggYahoo>()

  for (let i = 0; i < paRows.length; i++) {
    const row = paRows[i]!
    const a = paAgg(row.result)
    if (FLEX.has(row.hybrid)) flex.push({ idx: i, row, agg: a, cur: row.hybrid })
    else {
      const g = fixed.get(row.hybrid) ?? emptyBattingSeasonAggYahoo()
      addAgg(g, a)
      fixed.set(row.hybrid, g)
    }
  }

  const baseline = l1FromMap(
    (() => {
      const m = cloneMap(fixed)
      for (const x of flex) {
        const g = m.get(x.cur) ?? emptyBattingSeasonAggYahoo()
        addAgg(g, x.agg)
        m.set(x.cur, g)
      }
      return m
    })(),
  )
  console.log(`flex ${flex.length}件, 現行 L1=${baseline}\n`)

  // 曖昧: hybrid が none/r1/r2/r3 の各 PA を別行へ再配置して L1 最小化（全探索は多いので r1→{none,r2} と none←? を重点）
  const r1Items = flex.filter((x) => x.cur === "r1")
  console.log(`一塁行 ${r1Items.length}件`)

  let bestL1 = baseline
  let bestAssign: Map<number, string> | null = null

  // 一塁から最大3件を none/r2/r3 へ（PA差: r1+2, none-1, r2-1 → 2件移動想定）
  function comb(n: number, k: number): number[][] {
    const out: number[][] = []
    const cur: number[] = []
    function go(s: number): void {
      if (cur.length === k) {
        out.push([...cur])
        return
      }
      for (let i = s; i <= n - (k - cur.length); i++) {
        cur.push(i)
        go(i + 1)
        cur.pop()
      }
    }
    go(0)
    return out
  }

  const targets = ["none", "r2", "r3"] as const
  for (const k of [1, 2, 3]) {
    for (const pick of comb(r1Items.length, k)) {
      for (let mask = 0; mask < 3 ** k; mask++) {
        const assign = new Map<number, string>()
        let bits = mask
        for (let j = 0; j < k; j++) {
          assign.set(r1Items[pick[j]!]!.idx, targets[bits % 3]!)
          bits = Math.floor(bits / 3)
        }
        const m = cloneMap(fixed)
        for (const x of flex) {
          const sit = assign.get(x.idx) ?? x.cur
          const g = m.get(sit) ?? emptyBattingSeasonAggYahoo()
          addAgg(g, x.agg)
          m.set(sit, g)
        }
        const score = l1FromMap(m)
        if (score < bestL1) {
          bestL1 = score
          bestAssign = assign
        }
      }
    }
  }

  console.log(`最適 L1=${bestL1} (Δ${baseline - bestL1})\n`)
  if (bestAssign?.size) {
    for (const [idx, to] of bestAssign) {
      const r = paRows[idx]!
      console.log(`${r.paId}\t${r.hybrid}→${to}\t${r.result.slice(0, 20)}`)
    }
  }

  writeFileSync(
    join(root, "_data/diag_kikuchi_reassign_v2.json"),
    JSON.stringify({ baseline, bestL1, moves: [...(bestAssign ?? [])].map(([i, to]) => ({ paId: paRows[i]!.paId, from: paRows[i]!.hybrid, to })) }, null, 2),
  )
}

main()
