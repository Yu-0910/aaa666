/**
 * フェーズ4（本命）: 通算（phase11）の P0 と、Phase 15（個人ページ用 splits ファイル）の
 * vs_hand R+L+unknown 合計が一致するか検証する。
 *
 * Phase 25 以降:
 *   - vs_hand のΔ補完は `loadVsHandRowsFromCanonicalWithDebug` に統合され、その結果は
 *     `_data/derived/player_season_batting_splits/{year}/yahoo_*.json` に reconciliation 付きで出力される。
 *   - 旧ファイル B (`player_season_batting_vs_hand/`) は廃止（参照しない）。
 *
 * P0: PA, AB, BB, HBP, SH, SF（このプロジェクトの PA 定義に合わせる）
 *
 * 使い方:
 *   npx tsx scripts/validate_vs_hand_totals_vs_phase11.ts --year 2026
 *   npx tsx scripts/validate_vs_hand_totals_vs_phase11.ts --year 2026 --fail-on-negative-recon
 */

import fs from "node:fs"
import path from "node:path"

type Row = {
  split_type?: string
  split_value?: string
  pa?: string | number
  ab?: string | number
  bb?: string | number
  hbp?: string | number
  sh?: string | number
  sf?: string | number
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0
  const s = String(v).trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function parseArgs(): { year: string; failOnNegativeRecon: boolean; onlyYahooIds: string[] | null } {
  const args = process.argv.slice(2)
  let year = "2026"
  let failOnNegativeRecon = false
  let onlyYahooIds: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--fail-on-negative-recon") {
      failOnNegativeRecon = true
    } else if (args[i] === "--only-yahoo-ids" && args[i + 1]) {
      onlyYahooIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return { year, failOnNegativeRecon, onlyYahooIds }
}

function sumVsHandP0(rows: Row[]): { pa: number; ab: number; bb: number; hbp: number; sh: number; sf: number } {
  const vs = rows.filter((r) => String(r.split_type ?? "") === "vs_hand")
  const acc = { pa: 0, ab: 0, bb: 0, hbp: 0, sh: 0, sf: 0 }
  for (const r of vs) {
    acc.pa += num(r.pa)
    acc.ab += num(r.ab)
    acc.bb += num(r.bb)
    acc.hbp += num(r.hbp)
    acc.sh += num(r.sh)
    acc.sf += num(r.sf)
  }
  return acc
}

function main(): void {
  const { year, failOnNegativeRecon, onlyYahooIds } = parseArgs()
  const root = process.cwd()
  const phase11Dir = path.join(root, "_data", "derived", "player_season_batting", year)
  const splitsDir = path.join(root, "_data", "derived", "player_season_batting_splits", year)

  if (!fs.existsSync(phase11Dir)) {
    console.error(`[validate vs_hand vs phase11] phase11 dir missing: ${phase11Dir}`)
    process.exit(2)
  }
  if (!fs.existsSync(splitsDir)) {
    console.error(`[validate vs_hand vs phase11] phase15 splits dir missing: ${splitsDir}`)
    console.error(`  Run: npm run phase15:build:batting-splits`)
    process.exit(2)
  }

  const onlyYahooIdSet =
    onlyYahooIds && onlyYahooIds.length > 0 ? new Set(onlyYahooIds.map(String)) : null
  const phase11Files = fs
    .readdirSync(phase11Dir)
    .filter((f) => f.endsWith(".json") && f.startsWith("yahoo_"))
    .filter((f) => {
      if (!onlyYahooIdSet) return true
      const id = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
      return onlyYahooIdSet.has(id)
    })
  let mismatches = 0
  let missingSplits = 0
  let negativeReconPlayers = 0

  for (const f of phase11Files) {
    const id = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
    const p11Path = path.join(phase11Dir, f)
    const splitsPath = path.join(splitsDir, f)

    let p11: { rows?: Row[] }
    try {
      p11 = JSON.parse(fs.readFileSync(p11Path, "utf8")) as { rows?: Row[] }
    } catch {
      console.error(`[validate] JSON parse failed: ${p11Path}`)
      mismatches++
      continue
    }

    const total = (Array.isArray(p11.rows) ? p11.rows : []).find((r) => String(r.split_type ?? "") === "total")
    if (!total) {
      console.error(`[validate] no total row: ${f}`)
      mismatches++
      continue
    }

    if (!fs.existsSync(splitsPath)) {
      missingSplits++
      console.error(`[validate] missing phase15 splits file for phase11 player: ${f}`)
      continue
    }

    let splitsDoc: { rows?: Row[]; reconciliation?: { negativeDeltaGames?: number } }
    try {
      splitsDoc = JSON.parse(fs.readFileSync(splitsPath, "utf8")) as typeof splitsDoc
    } catch {
      console.error(`[validate] JSON parse failed: ${splitsPath}`)
      mismatches++
      continue
    }

    const neg = Number(splitsDoc.reconciliation?.negativeDeltaGames ?? 0)
    if (neg > 0) negativeReconPlayers++

    const want = {
      pa: num(total.pa),
      ab: num(total.ab),
      bb: num(total.bb),
      hbp: num(total.hbp),
      sh: num(total.sh),
      sf: num(total.sf),
    }
    const got = sumVsHandP0(Array.isArray(splitsDoc.rows) ? splitsDoc.rows : [])

    const ok =
      want.pa === got.pa &&
      want.ab === got.ab &&
      want.bb === got.bb &&
      want.hbp === got.hbp &&
      want.sh === got.sh &&
      want.sf === got.sf

    if (!ok) {
      mismatches++
      console.error(
        [
          `[validate] P0 mismatch yahoo_${id}`,
          `  phase11 total: PA=${want.pa} AB=${want.ab} BB=${want.bb} HBP=${want.hbp} SH=${want.sh} SF=${want.sf}`,
          `  vs_hand sum:   PA=${got.pa} AB=${got.ab} BB=${got.bb} HBP=${got.hbp} SH=${got.sh} SF=${got.sf}`,
          neg > 0 ? `  (reconciliation.negativeDeltaGames=${neg})` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
    }
  }

  // splits 側にだけある余剰ファイルは「対左右が出るのに通算が無い打者」=異常。
  // ※ ただし phase15 splits は plateAppearances にしか出ない打者（代打のみ等）も含むため、
  //   存在差は警告レベルで報告する（mismatches に加えない）。
  const extraSplits = fs
    .readdirSync(splitsDir)
    .filter((f) => f.endsWith(".json") && f.startsWith("yahoo_"))
    .filter((f) => {
      if (!onlyYahooIdSet) return true
      const id = f.replace(/^yahoo_/, "").replace(/\.json$/, "")
      return onlyYahooIdSet.has(id)
    })
    .filter((f) => !fs.existsSync(path.join(phase11Dir, f)))

  if (extraSplits.length > 0) {
    console.warn(
      `[validate] phase15 splits files without phase11 counterpart (${extraSplits.length}, info only):`,
    )
    for (const x of extraSplits.slice(0, 20)) console.warn(`  ${x}`)
    if (extraSplits.length > 20) console.warn(`  ... and ${extraSplits.length - 20} more`)
  }

  const exitBad =
    mismatches > 0 ||
    missingSplits > 0 ||
    (failOnNegativeRecon && negativeReconPlayers > 0)

  if (failOnNegativeRecon && negativeReconPlayers > 0) {
    console.error(
      `[validate] --fail-on-negative-recon: ${negativeReconPlayers} players have reconciliation.negativeDeltaGames > 0`,
    )
  }

  // Phase 26/27 以降、`negativeDeltaGames > 0` は「過剰計上を吸収した試合がある」ことを意味する
  // 正常な経路。デフォルトでは exit 1 の判定材料にしない（`--fail-on-negative-recon` でのみ）。
  if (exitBad) {
    console.error(
      `[validate] NG: mismatches=${mismatches} missingSplits=${missingSplits}` +
        (failOnNegativeRecon ? ` negativeReconPlayers=${negativeReconPlayers}` : ` (info: negativeReconPlayers=${negativeReconPlayers})`) +
        ` (phase11 files=${phase11Files.length})`,
    )
    process.exit(1)
  }

  console.log(
    `[validate] OK: phase11 vs phase15 splits P0 match for ${phase11Files.length} players (info: negativeDeltaGames>0=${negativeReconPlayers}, --fail-on-negative-recon to enforce)`,
  )
  process.exit(0)
}

main()
