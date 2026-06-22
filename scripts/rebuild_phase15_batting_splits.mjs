/**
 * Phase15 状況別打撃スプリットの一括再生成（スポナビ準拠ロジック）。
 *
 * 塁分類: resultBallClass / 打点: resultBallRbi / 結果: 出場成績 appearance_only
 *
 *   node scripts/rebuild_phase15_batting_splits.mjs
 *   node scripts/rebuild_phase15_batting_splits.mjs --year 2026
 *
 * 前提: canonical + raw_sportsnavi_score（一球速報 HTML）が揃っていること。
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function parseYear() {
  const i = process.argv.indexOf("--year")
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return "2026"
}

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n[phase15:rebuild] ${label}\n> ${cmd} ${args.join(" ")}\n`)
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      TOPPAGE_PLATE_RESULT_SOURCE: "appearance_only",
      ...extraEnv,
    },
  })
  if (r.status !== 0) {
    console.error(`[phase15:rebuild] failed: ${label}`)
    process.exit(r.status ?? 1)
  }
}

function main() {
  const year = parseYear()
  console.log(
    `[phase15:rebuild] year=${year} | base_sit=resultBallClass | rbi=resultBallRbi | result=appearance_only`,
  )
  run("Phase15 batting splits", "npx", [
    "tsx",
    "scripts/phase15_build_pa_round_and_situation_from_canonical.ts",
    "--year",
    year,
  ])
  console.log(`\n[phase15:rebuild] done → _data/derived/player_season_batting_splits/${year}/`)
}

main()
