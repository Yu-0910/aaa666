#!/usr/bin/env node

import { spawnSync } from "node:child_process"

function parseArgs(argv) {
  const out = { year: "2026", from: "", to: "" }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--year" && argv[i + 1]) {
      out.year = String(argv[i + 1]).trim()
      i += 1
    } else if (arg === "--from" && argv[i + 1]) {
      out.from = String(argv[i + 1]).trim()
      i += 1
    } else if (arg === "--to" && argv[i + 1]) {
      out.to = String(argv[i + 1]).trim()
      i += 1
    }
  }
  return out
}

function run(label, args) {
  console.log(`\n[phase3:derived:2026] ${label}`)
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
  const result = spawnSync(npmCmd, args, { stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const { from, to } = parseArgs(process.argv.slice(2))
const phase11Args = ["run", "phase11:build:batting"]
const phase13Args = ["run", "phase13:build:context"]
const phase14Args = ["run", "phase14:build:pitch"]
const phase15Args = ["run", "phase15:build:batting-splits"]
const phase16Args = ["run", "phase16:build:batting-count"]
const phase17Args = ["run", "phase17:build:period"]
const phase20Args = ["run", "phase20:build:pitcher-zones"]
const phase22Args = ["run", "phase22:build:catcher-appearances"]
const phase23Args = ["run", "phase23:build:catcher-pitcher-splits"]
const phase24Args = ["run", "phase24:build:catcher-defense-basic"]
const phase30Args = ["run", "phase30:build:player-matchup"]
const phase33Args = ["run", "phase33:build:batter-vs-team-count-pitch-types"]
const phase25PitchTypesArgs = ["run", "phase25:build:pitcher-season-pitch-types"]
const phase26Args = ["run", "phase26:build:catcher-pa-round-pitch-types"]
if (from || to) {
  phase11Args.push("--")
  phase13Args.push("--")
  phase14Args.push("--")
  phase15Args.push("--")
  phase16Args.push("--")
  phase17Args.push("--")
  phase20Args.push("--")
  phase22Args.push("--")
  phase23Args.push("--")
  phase24Args.push("--")
  phase30Args.push("--")
  phase33Args.push("--")
  phase25PitchTypesArgs.push("--")
  phase26Args.push("--")
  if (from) phase11Args.push("--from", from)
  if (from) phase13Args.push("--from", from)
  if (from) phase14Args.push("--from", from)
  if (from) phase15Args.push("--from", from)
  if (from) phase16Args.push("--from", from)
  if (from) phase17Args.push("--from", from)
  if (from) phase20Args.push("--from", from)
  if (from) phase22Args.push("--from", from)
  if (from) phase23Args.push("--from", from)
  if (from) phase24Args.push("--from", from)
  if (from) phase30Args.push("--from", from)
  if (from) phase33Args.push("--from", from)
  if (from) phase25PitchTypesArgs.push("--from", from)
  if (from) phase26Args.push("--from", from)
  if (to) phase11Args.push("--to", to)
  if (to) phase13Args.push("--to", to)
  if (to) phase14Args.push("--to", to)
  if (to) phase15Args.push("--to", to)
  if (to) phase16Args.push("--to", to)
  if (to) phase17Args.push("--to", to)
  if (to) phase20Args.push("--to", to)
  if (to) phase22Args.push("--to", to)
  if (to) phase23Args.push("--to", to)
  if (to) phase24Args.push("--to", to)
  if (to) phase30Args.push("--to", to)
  if (to) phase33Args.push("--to", to)
  if (to) phase25PitchTypesArgs.push("--to", to)
  if (to) phase26Args.push("--to", to)
}

run("enrich:text-play-headlines", ["run", "enrich:text-play-headlines"])
run("phase:pitcher-poc1", ["run", "phase:pitcher-poc1"])
run("phase6:build:pitcher-catcher-splits", ["run", "phase6:build:pitcher-catcher-splits"])
run("phase11:build:batting", phase11Args)
run("phase13:build:context", phase13Args)
run("phase14:build:pitch", phase14Args)
run("phase15:build:batting-splits", phase15Args)
run("phase16:build:batting-count", phase16Args)
run("phase17:build:period", phase17Args)
run("phase7:build:pitcher-period", ["run", "phase7:build:pitcher-period"])
run("phase25:build:pitcher-season-pitch-types", phase25PitchTypesArgs)
run("phase22:build:catcher-appearances", phase22Args)
run("phase23:build:catcher-pitcher-splits", phase23Args)
run("phase24:build:catcher-defense-basic", phase24Args)
run("phase25:build:catcher-starting-summary", ["run", "phase25:build:catcher-starting-summary"])
run("phase26:build:catcher-pa-round-pitch-types", phase26Args)
run("phase20:build:pitcher-zones", phase20Args)
run("phase30:build:player-matchup", phase30Args)
run("phase33:build:batter-vs-team-count-pitch-types", phase33Args)
run("build:yahoo-npb-full-index", ["run", "build:yahoo-npb-full-index"])
