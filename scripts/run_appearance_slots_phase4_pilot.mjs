/**
 * Phase 4: レイエス（1860140）のみ appearance_slots 集計で Phase11 を再生成し、診断と比較する。
 *
 *   npm run appearance-slots:phase4:pilot
 *   npm run appearance-slots:phase4:pilot -- --skip-backup
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PILOT_YAHOO_ID = "1860140"
const YEAR = "2026"

const skipBackup = process.argv.includes("--skip-backup")

function run(cmd, args, extraEnv = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}\n`)
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function readPhase11H(yahooId) {
  const p = path.join(root, "_data", "derived", "player_season_batting", YEAR, `yahoo_${yahooId}.json`)
  if (!fs.existsSync(p)) return null
  const doc = JSON.parse(fs.readFileSync(p, "utf8"))
  const row = (doc.rows ?? []).find((r) => r.split_type === "total")
  return {
    h: row?.h ?? null,
    ab: row?.ab ?? null,
    pa: row?.pa ?? null,
    battingSeasonAggSource: doc.battingSeasonAggSource ?? null,
    plateResultAppearanceOnly: doc.plateResultAppearanceOnly ?? null,
  }
}

function main() {
  console.log("[appearance-slots:phase4:pilot] plan: docs/plan_ranking_profile_appearance_slots_only_phases.md")
  console.log(`[appearance-slots:phase4:pilot] player=レイエス yahoo_id=${PILOT_YAHOO_ID}`)

  if (!skipBackup) {
    run("npm", ["run", "appearance-slots:phase2:backup"])
  } else {
    console.log("[appearance-slots:phase4:pilot] --skip-backup")
  }

  run("npx", ["tsx", "scripts/phase11_build_season_stats_from_canonical.ts", "--year", YEAR, "--only-yahoo-ids", PILOT_YAHOO_ID], {
    TOPPAGE_BATTING_SEASON_AGG: "appearance_slots",
  })

  console.log("\n--- diag: appearance slots season total ---\n")
  run("npx", ["tsx", "scripts/diag_batter_appearance_slots_hits_by_game_date.ts", "--yahoo-id", PILOT_YAHOO_ID, "--year", YEAR, "--season-total"])

  const p11 = readPhase11H(PILOT_YAHOO_ID)
  console.log("\n--- comparison ---")
  console.log(JSON.stringify(p11, null, 2))
  console.log(
    "\n[appearance-slots:phase4:pilot] Go if Phase11 h matches diag h_appearance_slots. Then run appearance-slots:phase5:rebuild-2026",
  )
}

main()
