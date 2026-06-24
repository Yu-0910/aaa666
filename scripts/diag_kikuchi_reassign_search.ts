/**
 * 菊池 — 一塁過剰5打席の最適再配分探索（2→なし, 3→三塁）高速版
 * npx tsx scripts/diag_kikuchi_reassign_search.ts
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
const REF = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")).ref as Record<
  string,
  { pa: number; ab: number; h: number; hr: number; so: number; bb: number; hbp: number; sh: number; sf: number }
>

type PaRow = { paId: string; hybrid: string; text: string; chain: string; first: string; token: string; result: string }

const STAT_KEYS = ["pa", "ab", "h", "hr", "so", "bb", "hbp", "sh", "sf"] as const

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

function cloneMap(m: Map<string, BattingSeasonAggYahoo>): Map<string, BattingSeasonAggYahoo> {
  const out = new Map<string, BattingSeasonAggYahoo>()
  for (const [k, v] of m) out.set(k, { ...v })
  return out
}

function subAgg(a: BattingSeasonAggYahoo, b: BattingSeasonAggYahoo): void {
  for (const k of STAT_KEYS) (a[k] as number) -= b[k] as number
}

function addAgg(a: BattingSeasonAggYahoo, b: BattingSeasonAggYahoo): void {
  for (const k of STAT_KEYS) (a[k] as number) += b[k] as number
}

function comb(n: number, k: number): number[][] {
  const out: number[][] = []
  const cur: number[] = []
  function go(start: number): void {
    if (cur.length === k) {
      out.push([...cur])
      return
    }
    for (let i = start; i <= n - (k - cur.length); i++) {
      cur.push(i)
      go(i + 1)
      cur.pop()
    }
  }
  go(0)
  return out
}

function main(): void {
  const { paRows } = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")) as { paRows: PaRow[] }

  const r1Local: { globalIdx: number; agg: BattingSeasonAggYahoo; row: PaRow }[] = []
  const base = new Map<string, BattingSeasonAggYahoo>()
  for (let i = 0; i < paRows.length; i++) {
    const row = paRows[i]!
    const a = paAgg(row.result)
    if (row.hybrid === "r1") {
      r1Local.push({ globalIdx: i, agg: a, row })
    } else {
      const g = base.get(row.hybrid) ?? emptyBattingSeasonAggYahoo()
      addAgg(g, a)
      base.set(row.hybrid, g)
    }
  }

  const baseline = l1FromMap(
    (() => {
      const m = cloneMap(base)
      const r1 = m.get("r1") ?? emptyBattingSeasonAggYahoo()
      for (const x of r1Local) addAgg(r1, x.agg)
      m.set("r1", r1)
      return m
    })(),
  )

  console.log(`一塁打席: ${r1Local.length}件\n現行 L1 = ${baseline}\n`)

  let bestL1 = baseline
  let best: { toNone: number[]; toR3: number[] } | null = null

  const pairs = comb(r1Local.length, 2)
  for (const pair of pairs) {
    const restIdx = r1Local.map((_, i) => i).filter((i) => !pair.includes(i))
    for (const triple of comb(restIdx.length, 3)) {
      const toR3Local = new Set(triple.map((ti) => restIdx[ti]!))
      const m = cloneMap(base)
      const r1 = emptyBattingSeasonAggYahoo()
      for (let li = 0; li < r1Local.length; li++) {
        const x = r1Local[li]!
        if (pair.includes(li)) {
          const g = m.get("none") ?? emptyBattingSeasonAggYahoo()
          addAgg(g, x.agg)
          m.set("none", g)
        } else if (toR3Local.has(li)) {
          const g = m.get("r3") ?? emptyBattingSeasonAggYahoo()
          addAgg(g, x.agg)
          m.set("r3", g)
        } else {
          addAgg(r1, x.agg)
        }
      }
      m.set("r1", r1)
      const score = l1FromMap(m)
      if (score < bestL1) {
        bestL1 = score
        best = {
          toNone: pair.map((i) => r1Local[i]!.globalIdx),
          toR3: triple.map((i) => r1Local[restIdx[i]!]!.globalIdx),
        }
      }
    }
  }

  if (!best) {
    console.log("改善する再配分なし")
    return
  }

  console.log(`最適 L1 = ${bestL1} (Δ${baseline - bestL1})\n`)
  console.log("=== →なし (2件) ===")
  for (const i of best.toNone) {
    const r = paRows[i]!
    console.log(`${r.paId}\t${r.token}\t${r.result}\ttext=${r.text}\tchain=${r.chain}\tfirst=${r.first}`)
  }
  console.log("\n=== →三塁 (3件) ===")
  for (const i of best.toR3) {
    const r = paRows[i]!
    console.log(`${r.paId}\t${r.token}\t${r.result}\ttext=${r.text}\tchain=${r.chain}\tfirst=${r.first}`)
  }

  const moved = [...best.toNone, ...best.toR3].map((i) => paRows[i]!)
  console.log("\n=== 移動5件の共通パターン ===")
  for (const r of moved) {
    console.log(
      `  chain=${r.chain} first=${r.first} text=${r.text} token=${r.token.slice(0, 12)} result=${r.result.slice(0, 16)}`,
    )
  }

  writeFileSync(
    join(root, "_data/diag_kikuchi_reassign_best.json"),
    JSON.stringify(
      { baseline, bestL1, toNone: best.toNone.map((i) => paRows[i]), toR3: best.toR3.map((i) => paRows[i]) },
      null,
      2,
    ),
  )
}

main()
