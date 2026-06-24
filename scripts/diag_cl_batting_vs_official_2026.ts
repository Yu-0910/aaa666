/** npx tsx scripts/diag_cl_batting_vs_official_2026.ts */
import { readFileSync } from "fs"
import { join } from "path"
import { teamShortFromCode } from "@/lib/standings/teamCodes"

const OFFICIAL: Record<
  string,
  { g: number; runs: number; h: number; hr: number; d2: number; avg: number; ops: number; risp: number }
> = {
  巨人: { g: 64, runs: 202, h: 478, hr: 51, d2: 79, avg: 0.228, ops: 0.628, risp: 0.24 },
  阪神: { g: 62, runs: 230, h: 503, hr: 45, d2: 87, avg: 0.248, ops: 0.685, risp: 0.275 },
  ヤクルト: { g: 64, runs: 206, h: 499, hr: 39, d2: 84, avg: 0.235, ops: 0.63, risp: 0.253 },
  DeNA: { g: 64, runs: 232, h: 521, hr: 37, d2: 94, avg: 0.245, ops: 0.651, risp: 0.287 },
  広島: { g: 61, runs: 175, h: 433, hr: 38, d2: 68, avg: 0.215, ops: 0.591, risp: 0.228 },
  中日: { g: 64, runs: 214, h: 492, hr: 46, d2: 77, avg: 0.234, ops: 0.647, risp: 0.246 },
}

const json = JSON.parse(readFileSync(join(process.cwd(), "_data/derived/team_standings/2026/CL.json"), "utf8"))
console.log("generatedAt:", json.generatedAt)
console.log()

let issues = 0
for (const row of json.rows) {
  const t = teamShortFromCode(row.team)
  const o = OFFICIAL[t === "横浜" ? "DeNA" : t]
  if (!o) continue
  const checks: [string, number | null | undefined, number, number][] = [
    ["試合", row.g, o.g, 0],
    ["得点", row.runs, o.runs, 0],
    ["安打", row.h, o.h, 0],
    ["本塁打", row.hr, o.hr, 0],
    ["二塁打", row.doubles, o.d2, 0],
    ["打率", row.avg, o.avg, 3],
    ["OPS", row.ops, o.ops, 3],
    ["得点圏", row.risp_avg, o.risp, 3],
  ]
  console.log(`【${t}】`)
  for (const [label, cur, exp, dec] of checks) {
    if (cur == null) continue
    const d = dec === 0 ? cur - exp : (cur as number) - exp
    const ok = dec === 0 ? d === 0 : Math.abs(d) <= 0.002
    if (!ok) issues++
    const mark = ok ? "OK" : "NG"
    console.log(
      `  ${label.padEnd(6)} ${dec === 0 ? cur : (cur as number).toFixed(dec)} vs ${dec === 0 ? exp : exp.toFixed(dec)} ${mark}${ok ? "" : ` (Δ${d >= 0 ? "+" : ""}${dec === 0 ? d : d.toFixed(dec)})`}`,
    )
  }
  console.log()
}
console.log(`課題数: ${issues}`)
