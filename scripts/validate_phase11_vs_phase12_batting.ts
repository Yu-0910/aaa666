/**
 * 個人ページ（Phase 11 派生 JSON）と野手ランキング（Phase 12）の通算整数が一致するか検証する。
 * 不一致は「canonical 更新後に Phase 12 だけ回した／Phase 11 だけ古い」などの生成順ズレを示す。
 *
 *   npx tsx scripts/validate_phase11_vs_phase12_batting.ts [--year 2026]
 */

import { existsSync, readFileSync, readdirSync } from "fs"
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

type RankRow = {
  playerId?: string
  pa?: number
  ab?: number
  hits?: number
  hr?: number
}

function loadRankingBattingMap(year: string): Map<string, RankRow> {
  const m = new Map<string, RankRow>()
  const base = join(projectRoot, "public", "data", "rankings", year)
  for (const lg of ["CL", "PL"] as const) {
    const p = join(base, lg, "打率.json")
    if (!existsSync(p)) continue
    const rows = JSON.parse(readFileSync(p, "utf8")) as unknown
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const r = row as RankRow
      const id = String(r.playerId ?? "").trim()
      if (!/^\d+$/.test(id)) continue
      m.set(id, r)
    }
  }
  return m
}

function loadPhase11Total(yahooId: string, year: string): {
  pa: number
  ab: number
  h: number
  hr: number
} | null {
  const path = join(projectRoot, "_data", "derived", "player_season_batting", year, `yahoo_${yahooId}.json`)
  if (!existsSync(path)) return null
  try {
    const j = JSON.parse(readFileSync(path, "utf8")) as {
      rows?: Array<{ split_type?: string; split_value?: string; pa?: number; ab?: number; h?: number; hr?: number }>
    }
    const t = (j.rows ?? []).find((r) => r.split_type === "total" && r.split_value === "total")
    if (!t) return null
    return {
      pa: Number(t.pa ?? 0),
      ab: Number(t.ab ?? 0),
      h: Number(t.h ?? 0),
      hr: Number(t.hr ?? 0),
    }
  } catch {
    return null
  }
}

function main(): void {
  const { year } = parseArgs()
  const derivedDir = join(projectRoot, "_data", "derived", "player_season_batting", year)
  if (!existsSync(derivedDir)) {
    console.error("[validate_phase11_vs_phase12_batting] なし:", derivedDir)
    process.exit(1)
  }

  const ranking = loadRankingBattingMap(year)
  if (ranking.size === 0) {
    console.error("[validate_phase11_vs_phase12_batting] ランキング打率.json なし (year=" + year + ")")
    process.exit(1)
  }

  const files = readdirSync(derivedDir).filter((f) => f.startsWith("yahoo_") && f.endsWith(".json"))
  const mismatches: string[] = []
  let compared = 0

  for (const f of files) {
    const m = f.match(/^yahoo_(\d+)\.json$/)
    const yid = m ? m[1] : ""
    if (!yid) continue
    const p11 = loadPhase11Total(yid, year)
    if (!p11) continue
    const rk = ranking.get(yid)
    if (!rk) continue
    compared++
    const pa = rk.pa ?? 0
    const ab = rk.ab ?? 0
    const h = rk.hits ?? 0
    const hr = rk.hr ?? 0
    if (p11.pa !== pa || p11.ab !== ab || p11.h !== h || p11.hr !== hr) {
      mismatches.push(
        `yahoo_${yid}: Phase11 pa/ab/h/hr=${p11.pa}/${p11.ab}/${p11.h}/${p11.hr} vs ランキング ${pa}/${ab}/${h}/${hr}`,
      )
    }
  }

  if (mismatches.length > 0) {
    console.error(
      "[validate_phase11_vs_phase12_batting] 不一致 " + mismatches.length + " 件（Phase 11 派生と Phase 12 が別時刻の canonical スナップショットの可能性）",
    )
    for (const line of mismatches.slice(0, 30)) console.error(" ", line)
    if (mismatches.length > 30) console.error("  ... 他 " + (mismatches.length - 30) + " 件")
    console.error(
      "  対処: 同一 canonical に対し `npm run phase11:build:batting` のあと `npm run phase12:build:rankings`（または `npm run rankings:rebuild`）を実行。",
    )
    process.exit(1)
  }

  console.log(
    `[validate_phase11_vs_phase12_batting] OK (${year}, ${compared} 選手を Phase11↔ランキングで突合)`,
  )
}

main()
