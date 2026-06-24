/**
 * 菊池 — none/r1/r3 プール全体の意味制約付き再配分（各PAは text/chain/token が行と一致するときのみ配置可）
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
const FLEX = ["none", "r1", "r3"] as const
type Sit = (typeof FLEX)[number]

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

function allowedRows(row: PaRow): Sit[] {
  const out = new Set<Sit>()
  for (const s of [row.text, row.chain] as Sit[]) {
    if (FLEX.includes(s)) out.add(s)
  }
  if (/走者なし/.test(row.token)) out.add("none")
  if (/一塁/.test(row.token) && !/一二|一三|二三|満/.test(row.token)) out.add("r1")
  if (/三塁/.test(row.token) && !/一三|二三|満/.test(row.token)) out.add("r3")
  return [...out]
}

function main(): void {
  const { paRows } = JSON.parse(readFileSync(join(root, "_data/diag_kikuchi_per_pa.json"), "utf8")) as { paRows: PaRow[] }

  type Item = { row: PaRow; agg: BattingSeasonAggYahoo; allowed: Sit[]; current: Sit }
  const flex: Item[] = []
  const fixed = new Map<string, BattingSeasonAggYahoo>()

  for (const row of paRows) {
    const a = paAgg(row.result)
    if (FLEX.includes(row.hybrid as Sit)) {
      flex.push({ row, agg: a, allowed: allowedRows(row), current: row.hybrid as Sit })
    } else {
      const g = fixed.get(row.hybrid) ?? emptyBattingSeasonAggYahoo()
      addAgg(g, a)
      fixed.set(row.hybrid, g)
    }
  }

  console.log(`flex pool: ${flex.length} (none/r1/r3)\n`)
  const multi = flex.filter((x) => x.allowed.length > 1)
  console.log(`複数行候補: ${multi.length}件`)
  for (const x of multi.slice(0, 15)) {
    console.log(`  ${x.row.paId} cur=${x.current} allow=[${x.allowed.join(",")}] text=${x.text} chain=${x.chain} ${x.row.token.slice(0, 10)}`)
  }
  if (multi.length > 15) console.log(`  ... +${multi.length - 15}`)

  // 現行
  const curMap = new Map(fixed)
  for (const x of flex) {
    const g = curMap.get(x.current) ?? emptyBattingSeasonAggYahoo()
    addAgg(g, x.agg)
    curMap.set(x.current, g)
  }
  console.log(`\n現行 L1 = ${l1FromMap(curMap)}`)

  // 貪欲: 各 flex PA を allowed の中で L1 改善最大の行へ（1パス）
  let bestMap = curMap
  let bestL1 = l1FromMap(curMap)
  const assignment = flex.map((x) => x.current)

  // 簡易ビーム: 複数候補のみ brute（最大20件なら 3^20 巨大）。複数候補のみ DFS
  const amb = flex.map((x, i) => ({ i, allowed: x.allowed })).filter((x) => x.allowed.length > 1)
  console.log(`\n曖昧 ${amb.length} 件を DFS...`)

  function evalAssign(asg: Sit[]): number {
    const m = new Map(fixed)
    for (let i = 0; i < flex.length; i++) {
      const sit = asg[i]!
      const g = m.get(sit) ?? emptyBattingSeasonAggYahoo()
      addAgg(g, flex[i]!.agg)
      m.set(sit, g)
    }
    return l1FromMap(m)
  }

  function dfs(idx: number, asg: Sit[]): void {
    if (idx === amb.length) {
      const full = flex.map((x) => x.current)
      for (let j = 0; j < amb.length; j++) full[amb[j]!.i] = asg[j]!
      const score = evalAssign(full)
      if (score < bestL1) {
        bestL1 = score
        bestMap = new Map()
        for (const [k, v] of fixed) bestMap.set(k, { ...v })
        for (let i = 0; i < flex.length; i++) {
          const sit = full[i]!
          const g = bestMap.get(sit) ?? emptyBattingSeasonAggYahoo()
          addAgg(g, flex[i]!.agg)
          bestMap.set(sit, g)
        }
        assignment.splice(0, assignment.length, ...full)
      }
      return
    }
    const { i, allowed } = amb[idx]!
    for (const a of allowed) {
      asg.push(a)
      dfs(idx + 1, asg)
      asg.pop()
    }
  }

  dfs(0, [])
  console.log(`DFS 最適 L1 = ${bestL1} (Δ${l1FromMap(curMap) - bestL1})\n`)

  const changes = flex.filter((x, i) => assignment[i] !== x.current)
  console.log(`変更 ${changes.length} 件:`)
  for (const x of changes) {
    const i = flex.indexOf(x)
    console.log(
      `  ${x.row.paId}\t${x.current}→${assignment[i]}\tallow=[${x.allowed.join(",")}]\t${x.row.token}\t${x.row.result.slice(0, 20)}`,
    )
  }

  writeFileSync(
    join(root, "_data/diag_kikuchi_semantic_dfs.json"),
    JSON.stringify({ bestL1, changes: changes.map((x) => ({ paId: x.row.paId, from: x.current, to: assignment[flex.indexOf(x)], row: x.row })) }, null, 2),
  )
}

main()
