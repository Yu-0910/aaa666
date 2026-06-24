/**
 * 菊池 — 意味制約付き再配分探索（token/chain/text が行と整合する場合のみ移動可）
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

type PaRow = { paId: string; hybrid: string; text: string; chain: string; token: string; result: string }

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

function canMoveTo(row: PaRow, target: "none" | "r3"): boolean {
  if (target === "none") {
    return row.text === "none" || row.chain === "none" || /走者なし/.test(row.token)
  }
  return row.text === "r3" || row.chain === "r3" || (/三塁/.test(row.token) && !/一三|二三|満/.test(row.token))
}

function main(): void {
  const { paRows } = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")) as { paRows: PaRow[] }

  const r1Local: { globalIdx: number; agg: BattingSeasonAggYahoo; row: PaRow }[] = []
  const base = new Map<string, BattingSeasonAggYahoo>()
  for (let i = 0; i < paRows.length; i++) {
    const row = paRows[i]!
    const a = paAgg(row.result)
    if (row.hybrid === "r1") r1Local.push({ globalIdx: i, agg: a, row })
    else {
      const g = base.get(row.hybrid) ?? emptyBattingSeasonAggYahoo()
      addAgg(g, a)
      base.set(row.hybrid, g)
    }
  }

  const toNoneOk = r1Local.map((x, i) => (canMoveTo(x.row, "none") ? i : -1)).filter((i) => i >= 0)
  const toR3Ok = r1Local.map((x, i) => (canMoveTo(x.row, "r3") ? i : -1)).filter((i) => i >= 0)

  console.log(`一塁 ${r1Local.length}件 — →なし可 ${toNoneOk.length}件, →三塁可 ${toR3Ok.length}件\n`)

  const baseline = l1FromMap(
    (() => {
      const m = cloneMap(base)
      const r1 = m.get("r1") ?? emptyBattingSeasonAggYahoo()
      for (const x of r1Local) addAgg(r1, x.agg)
      m.set("r1", r1)
      return m
    })(),
  )
  console.log(`現行 L1 = ${baseline}\n`)

  let bestL1 = baseline
  let best: { toNone: number[]; toR3: number[] } | null = null

  for (const pair of comb(toNoneOk.length, Math.min(2, toNoneOk.length))) {
    for (const triple of comb(toR3Ok.length, Math.min(3, toR3Ok.length))) {
      const toNoneLocal = new Set(pair.map((i) => toNoneOk[i]!))
      const toR3Local = new Set(triple.map((i) => toR3Ok[i]!))
      if (toNoneLocal.size + toR3Local.size !== 5) continue
      for (const x of toNoneLocal) if (toR3Local.has(x)) continue

      const m = cloneMap(base)
      const r1 = emptyBattingSeasonAggYahoo()
      for (let li = 0; li < r1Local.length; li++) {
        const x = r1Local[li]!
        if (toNoneLocal.has(li)) {
          const g = m.get("none") ?? emptyBattingSeasonAggYahoo()
          addAgg(g, x.agg)
          m.set("none", g)
        } else if (toR3Local.has(li)) {
          const g = m.get("r3") ?? emptyBattingSeasonAggYahoo()
          addAgg(g, x.agg)
          m.set("r3", g)
        } else addAgg(r1, x.agg)
      }
      m.set("r1", r1)
      const score = l1FromMap(m)
      if (score < bestL1) {
        bestL1 = score
        best = {
          toNone: [...toNoneLocal].map((i) => r1Local[i]!.globalIdx),
          toR3: [...toR3Local].map((i) => r1Local[i]!.globalIdx),
        }
      }
    }
  }

  if (!best) {
    console.log("意味制約下で PA 数整合する5件移動は見つからず")
    return
  }

  console.log(`制約付き最適 L1 = ${bestL1} (Δ${baseline - bestL1})\n`)
  for (const label of ["→なし", "→三塁"] as const) {
    const arr = label === "→なし" ? best.toNone : best.toR3
    console.log(`=== ${label} ===`)
    for (const i of arr) {
      const r = paRows[i]!
      console.log(`${r.paId}\t${r.token}\t${r.result}\ttext=${r.text}\tchain=${r.chain}`)
    }
    console.log()
  }

  writeFileSync(join(root, "_data/diag_kikuchi_reassign_semantic.json"), JSON.stringify({ baseline, bestL1, best }, null, 2))
}

main()
