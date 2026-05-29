/**
 * Phase 4/6: PoC JSON（NPB 単位・basic）と Phase 19 ランキング（Yahoo 単位）のコア整数を突合する。
 * 同一 NPB に複数 Yahoo がある場合はランキング行を合算して PoC basic と比較する。
 *
 *   npx tsx scripts/validate_profile_vs_ranking_pitching.ts [--year 2026]
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    }
  }
  return { year }
}

type RankingRow = {
  playerId?: string
  ip?: number
  bf?: number
  ha?: number
  hra?: number
  so?: number
  bb?: number
  np?: number
}

function loadRankingByYahoo(year: string): Map<string, RankingRow> {
  const m = new Map<string, RankingRow>()
  const base = join(projectRoot, "public", "data", "rankings", "pitching", year)
  for (const lg of ["CL", "PL"] as const) {
    const eraPath = join(base, lg, "防御率.json")
    if (!existsSync(eraPath)) continue
    const rows = JSON.parse(readFileSync(eraPath, "utf8")) as unknown
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const r = row as RankingRow
      const pid = String(r.playerId ?? "").trim()
      if (!/^\d+$/.test(pid)) continue
      m.set(pid, r)
    }
  }
  return m
}

type PocBasic = {
  ipOuts?: number
  bf?: number
  h?: number
  hr?: number
  so?: number
  bb?: number
  pitches?: number
}

function sumRows(ids: string[], byYahoo: Map<string, RankingRow>): {
  ipOuts: number
  bf: number
  h: number
  hr: number
  so: number
  bb: number
  np: number
  missing: string[]
} {
  let ipDecSum = 0
  let bf = 0
  let h = 0
  let hr = 0
  let so = 0
  let bb = 0
  let np = 0
  const missing: string[] = []
  for (const id of ids) {
    const row = byYahoo.get(id)
    if (!row) {
      missing.push(id)
      continue
    }
    const ip = typeof row.ip === "number" && Number.isFinite(row.ip) ? row.ip : 0
    ipDecSum += ip
    bf += row.bf ?? 0
    h += row.ha ?? 0
    hr += row.hra ?? 0
    so += row.so ?? 0
    bb += row.bb ?? 0
    np += row.np ?? 0
  }
  const ipOuts = Math.round(ipDecSum * 3)
  return { ipOuts, bf, h, hr, so, bb, np, missing }
}

function main(): void {
  const { year } = parseArgs()
  const pocDir = join(projectRoot, "_data", "derived", "player_season_pitching_poc", year)
  if (!existsSync(pocDir)) {
    console.error("[validate_profile_vs_ranking_pitching] ディレクトリなし:", pocDir)
    process.exit(1)
  }

  const byYahoo = loadRankingByYahoo(year)
  if (byYahoo.size === 0) {
    console.error("[validate_profile_vs_ranking_pitching] ランキング JSON がありません（防御率）")
    process.exit(1)
  }

  const files = readdirSync(pocDir).filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
  const errors: string[] = []
  let checked = 0

  for (const f of files) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(pocDir, f), "utf8"))
    } catch {
      continue
    }
    const o = raw as {
      yahooPitcherIds?: unknown
      basic?: PocBasic
    }
    const ids = o.yahooPitcherIds
    if (!Array.isArray(ids) || ids.length === 0) continue
    const yids = ids.map((x) => String(x ?? "").trim()).filter((x) => /^\d+$/.test(x))
    if (yids.length === 0) continue

    const b = o.basic
    if (!b) continue

    const sum = sumRows(yids, byYahoo)
    if (sum.missing.length > 0) {
      errors.push(`${f}: ランキングに無い Yahoo ID: ${sum.missing.join(", ")}`)
      continue
    }

    checked++
    const checks: Array<[string, number, number]> = [
      ["ipOuts", b.ipOuts ?? -1, sum.ipOuts],
      ["bf", b.bf ?? -1, sum.bf],
      ["h", b.h ?? -1, sum.h],
      ["hr", b.hr ?? -1, sum.hr],
      ["so", b.so ?? -1, sum.so],
      ["bb", b.bb ?? -1, sum.bb],
      ["pitches", b.pitches ?? -1, sum.np],
    ]

    for (const [label, pocVal, rankVal] of checks) {
      if (pocVal < 0) continue
      if (label === "ipOuts") {
        if (Math.abs(pocVal - rankVal) > 2) {
          errors.push(`${f}: ${label} PoC=${pocVal} rankingSum=${rankVal}`)
        }
      } else if (pocVal !== rankVal) {
        errors.push(`${f}: ${label} PoC=${pocVal} rankingSum=${rankVal}`)
      }
    }
  }

  if (errors.length > 0) {
    console.error("[validate_profile_vs_ranking_pitching] 不一致:", errors.length)
    for (const e of errors.slice(0, 40)) console.error(" ", e)
    if (errors.length > 40) console.error(`  ... 他 ${errors.length - 40} 件`)
    process.exit(1)
  }

  console.log(
    `[validate_profile_vs_ranking_pitching] OK (${year}, ${checked} NPB ファイルを突合、ランキング Yahoo ${byYahoo.size} 件)`,
  )
}

main()
