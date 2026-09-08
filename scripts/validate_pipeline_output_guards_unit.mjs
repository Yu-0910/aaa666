import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { test } from "node:test"
import { assertPipelineRequiredFiles, assertTopProbablesFresh } from "./pipeline_output_guards.mjs"

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toppage-output-guards-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, "public/data/top-probables/2026/current.json")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const write = (overrides = {}) => fs.writeFileSync(file, JSON.stringify({
    schemaVersion: "top-probables-v1", seasonYear: "2026", asOfDateJst: "2026-09-06",
    generatedAt: "2026-09-05T17:26:28.848Z", cards: [], ...overrides,
  }))
  return { root, file, write }
}

test("preflight catches missing validator before work starts", t => {
  const { root } = fixture(t)
  assert.throws(() => assertPipelineRequiredFiles(root), /validate_standings_window_freshness/)
  for (const name of ["validate_standings_window_freshness.ts", "phase36_build_top_probables.ts", "display_r2_upload.mjs", "verify_display_publish_after_upload.mjs"]) {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true })
    fs.writeFileSync(path.join(root, "scripts", name), "")
  }
  assert.doesNotThrow(() => assertPipelineRequiredFiles(root))
})

test("freshness rejects missing, malformed, old-date and invalid timestamp outputs", t => {
  const { root, file, write } = fixture(t)
  const check = () => assertTopProbablesFresh(root, "2026", "2026-09-06")
  assert.throws(check)
  fs.writeFileSync(file, "{")
  assert.throws(check)
  write({ asOfDateJst: "2026-09-05" })
  assert.throws(check, /stale/)
  write({ generatedAt: "invalid" })
  assert.throws(check, /invalid/)
  write()
  assert.doesNotThrow(check) // No-games dates legitimately have empty cards.
})

const pipeline = fs.readFileSync(new URL("./run_daily_npb_pipeline_v2.mjs", import.meta.url), "utf8")
const stageSource = pipeline.slice(pipeline.indexOf("function runAncillaryFutureScheduleAndProbablesStage("), pipeline.indexOf("function runPhase13ValidationWithRetry("))
function stage(root, { delta = true, build = () => {} } = {}) {
  let builds = 0
  const ctx = {
    root, assertTopProbablesFresh,
    topProbablesAsOfDateForWindow: () => "2026-09-06",
    shouldRunDeltaPhase: () => delta,
    runScheduleAheadBestEffort() {}, logDeltaSkip() {}, runTopProbablesInputRefresh() {},
    topProbablesBuildCommand: () => "phase36",
    run() { builds++; build() },
  }
  vm.createContext(ctx)
  vm.runInContext(stageSource, ctx)
  return { run: () => ctx.runAncillaryFutureScheduleAndProbablesStage({ year: "2026", dryRun: false }), builds: () => builds }
}

test("failed generation cannot proceed to publish with yesterday's file", t => {
  const { root, write } = fixture(t)
  write({ asOfDateJst: "2026-09-05" })
  const runner = stage(root, { build() { throw new Error("UNKNOWN write failure") } })
  assert.throws(runner.run, /UNKNOWN write failure/)
})

test("zero exit without fresh output is rejected", t => {
  const { root, write } = fixture(t)
  write({ asOfDateJst: "2026-09-05" })
  assert.throws(stage(root).run, /stale/)
})

test("delta skip rebuilds stale output but retains valid output", t => {
  const { root, write } = fixture(t)
  write({ asOfDateJst: "2026-09-05" })
  const runner = stage(root, { delta: false, build: write })
  runner.run()
  assert.equal(runner.builds(), 1)
  runner.run()
  assert.equal(runner.builds(), 1)
})

test("standings execution errors do not trigger repair, stale-output status does", () => {
  const watcher = fs.readFileSync(new URL("./watch_daily_pipeline_v2.mjs", import.meta.url), "utf8")
  const source = watcher.slice(watcher.indexOf("function ensureStandingsFreshAfterFinalize("), watcher.indexOf("function runPipelineV2("))
  for (const status of [1, 2]) {
    let repairs = 0
    const ctx = {
      root: "fixture", validateStandingsWindowFreshness() { throw { status } },
      log() {}, appendPipelineBulkLog() {}, pushWatchSummaryEvent() {}, writeWatchSummary() {},
      repairStandingsWindow() { repairs++ },
    }
    vm.createContext(ctx)
    vm.runInContext(source, ctx)
    const run = () => ctx.ensureStandingsFreshAfterFinalize({}, "2026-09-05", {}, "test")
    if (status === 1) assert.throws(run)
    else run()
    assert.equal(repairs, status === 2 ? 1 : 0)
  }
})
