/**
 * canonical の `domain.runnerEvents` に、一球 score の raw スナップショットだけからイベントを載せる（Phase10 不要）。
 * 盗塁死（CS）の正など、本番で score のみとする項目向け。
 *
 * 前提:
 *   python scripts/fetch_sportsnavi_score_raw_snapshot.py --year 2026 …
 *   → `_data/scraped_games/raw_sportsnavi_score/{gameId}/*.html`
 *
 *   npx tsx scripts/merge_score_runner_events_into_canonical.ts --year 2026
 *   npx tsx scripts/merge_score_runner_events_into_canonical.ts --game-id 2021038859
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { ingestCanonicalGame } from "../lib/yahooGame/persistCanonical"
import { runnerEventsForCanonicalFromScoreSnapshots } from "../lib/yahooGame/runnerEventsScoreOnlyForCanonical"
import { buildPickoffCatchMissInvestigations } from "../lib/yahooGame/pickoffCatchMissFromScore"
import {
  extendEventsFingerprintForScoreRunnerMerge,
  loadSportsnaviScoreSnapshots,
} from "../lib/yahooGame/sportsnaviScoreSnapshotIO"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown
}

function parseArgs(argv: string[]): {
  year: string
  gameId?: string
} {
  let year = "2026"
  let gameId: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--year") year = String(argv[i + 1] ?? "").trim() || year
    if (argv[i] === "--game-id") gameId = String(argv[i + 1] ?? "").trim() || undefined
    if (argv[i]?.startsWith("--game-id=")) gameId = argv[i].slice("--game-id=".length).trim() || undefined
  }
  return { year, gameId }
}

async function mergeOne(gameId: string): Promise<{ ok: boolean; snapshots: number; events: number; err?: string }> {
  const canonicalPath = join(projectRoot, "_data", "scraped_games", "canonical", `${gameId}.json`)
  if (!existsSync(canonicalPath)) return { ok: false, snapshots: 0, events: 0, err: "no canonical" }
  const base = JSON.parse(readFileSync(canonicalPath, "utf8")) as CanonicalGameDocument
  if (base?.schemaVersion !== "yahoo-game-canonical-v1" || String(base.gameId) !== String(gameId)) {
    return { ok: false, snapshots: 0, events: 0, err: "invalid canonical" }
  }
  const snapshots = loadSportsnaviScoreSnapshots(projectRoot, gameId)
  if (snapshots.length === 0) {
    return { ok: false, snapshots: 0, events: 0, err: "no score snapshots" }
  }
  const doc = base
  const re = runnerEventsForCanonicalFromScoreSnapshots({ gameId, doc, snapshots })
  // 空でも上書きし、旧 tier（rawTextSteal 等）の残骸を落とす
  doc.domain = { ...doc.domain, runnerEvents: re ?? [] }
  const investigations = buildPickoffCatchMissInvestigations({ doc, snapshots })
  doc.game = { ...doc.game, pickoffCatchMissInvestigations: investigations }
  extendEventsFingerprintForScoreRunnerMerge(doc)
  ingestCanonicalGame(projectRoot, doc)
  const n = doc.domain.runnerEvents?.length ?? 0
  return { ok: true, snapshots: snapshots.length, events: n }
}

async function main(): Promise<void> {
  const { year, gameId: single } = parseArgs(process.argv.slice(2))
  if (single) {
    const r = await mergeOne(single)
    if (!r.ok) {
      console.error(`[merge:score-runner] ${single} failed: ${r.err ?? "unknown"}`)
      process.exit(1)
    }
    console.log(`[merge:score-runner] ${single} ok snapshots=${r.snapshots} runnerEvents=${r.events}`)
    return
  }
  const indexPath = join(projectRoot, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  if (!existsSync(indexPath)) {
    console.error("[merge:score-runner] missing index:", indexPath)
    process.exit(1)
  }
  const idx = readJson(indexPath) as { gameIds?: string[] }
  const gameIds = Array.isArray(idx.gameIds) ? idx.gameIds.map((x) => String(x).trim()).filter(Boolean) : []
    let ok = 0
    let noSnap = 0
    let fail = 0
    for (let i = 0; i < gameIds.length; i++) {
      const gid = gameIds[i]!
      const r = await mergeOne(gid)
      if (r.ok) ok++
      else if (r.err === "no score snapshots") noSnap++
      else fail++
      console.log(
        `[merge:score-runner] ${i + 1}/${gameIds.length} ${gid} ${r.ok ? `ok snapshots=${r.snapshots} events=${r.events}` : `skip (${r.err ?? "unknown"})`}`,
      )
    }
  console.log(
    `[merge:score-runner] year=${year} targets=${gameIds.length} ok=${ok} noSnapshots=${noSnap} otherFail=${fail}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
