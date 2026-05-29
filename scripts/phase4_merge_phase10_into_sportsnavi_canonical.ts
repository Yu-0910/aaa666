/**
 * Phase 4: Phase10 restored pitch rows を「既存の canonical（スポナビ由来）」にマージして上書きする。
 *
 * - 入力 canonical: `_data/scraped_games/canonical/{gameId}.json`
 * - 入力 phase10: `_data/scraped_games/derived/{gameId}_phase10_restored.json`
 * - 出力 canonical: `_data/scraped_games/canonical/{gameId}.json`（ingest による upsert）
 *
 * 実行:
 *   npx tsx scripts/phase4_merge_phase10_into_sportsnavi_canonical.ts --game-id 2021038624
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { mergePhase10IntoCanonical, type Phase10PitchRow } from "../lib/yahooGame/mergePhase10FromPitchRows"
import { ingestCanonicalGame } from "../lib/yahooGame/persistCanonical"
import { batterEventsFromYahooTextHtml } from "../lib/yahooGame/batterEventsFromYahooTextHtml"
import { runnerEventsForCanonicalFromScoreSnapshots } from "../lib/yahooGame/runnerEventsScoreOnlyForCanonical"
import { buildPickoffCatchMissInvestigations } from "../lib/yahooGame/pickoffCatchMissFromScore"
import {
  extendEventsFingerprintForScoreRunnerMerge,
  loadSportsnaviScoreSnapshots,
} from "../lib/yahooGame/sportsnaviScoreSnapshotIO"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { gameId: string } {
  const args = process.argv.slice(2)
  let gameId = "2021038624"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--game-id" && args[i + 1]) {
      gameId = args[i + 1]
      i++
    }
  }
  return { gameId }
}

type Phase10File = {
  schemaVersion?: string
  gameId?: string
  pitchRows?: Phase10PitchRow[]
  missingOrPartial?: string[]
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

async function getYahooTextHtmlCached(gameId: string): Promise<string> {
  const dir = join(projectRoot, "_data", "scraped_games", "raw_yahoo_text")
  ensureDir(dir)
  const p = join(dir, `${gameId}.html`)
  if (existsSync(p)) return readFileSync(p, "utf8")

  const url = `https://baseball.yahoo.co.jp/npb/game/${gameId}/text`
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" } })
  const html = await res.text()
  writeFileSync(p, html, "utf8")
  return html
}

function mergeRunnerEventsPreferYahooText(
  existing: CanonicalGameDocument["domain"]["runnerEvents"] | undefined,
  fromYahooText: CanonicalGameDocument["domain"]["runnerEvents"] | undefined,
): CanonicalGameDocument["domain"]["runnerEvents"] | undefined {
  const a = Array.isArray(existing) ? existing : []
  const b = Array.isArray(fromYahooText) ? fromYahooText : []
  if (a.length === 0 && b.length === 0) return undefined

  const seen = new Set<string>()
  const out: NonNullable<CanonicalGameDocument["domain"]["runnerEvents"]> = []

  for (const e of b) {
    const k = `${e.kind}|${e.inningHalf ?? ""}|${e.yahooRunnerId}|${e.sourceLine ?? ""}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  for (const e of a) {
    const k = `${e.kind}|${e.inningHalf ?? ""}|${e.yahooRunnerId}|${e.sourceLine ?? ""}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out.length > 0 ? out : undefined
}

async function main(): Promise<void> {
  const { gameId } = parseArgs()
  const canonicalPath = join(projectRoot, "_data", "scraped_games", "canonical", `${gameId}.json`)
  const phase10Path = join(projectRoot, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)

  if (!existsSync(canonicalPath)) {
    console.error(`[phase4:merge] missing canonical: ${canonicalPath}`)
    process.exit(1)
  }
  if (!existsSync(phase10Path)) {
    console.error(`[phase4:merge] missing phase10: ${phase10Path}`)
    console.error("  先に: python scripts/run_yahoo_phase10_restore.py --game-id", gameId, "--text-from-raw")
    process.exit(1)
  }

  const base = JSON.parse(readFileSync(canonicalPath, "utf8")) as CanonicalGameDocument
  if (base?.schemaVersion !== "yahoo-game-canonical-v1" || String(base.gameId) !== String(gameId)) {
    console.error(`[phase4:merge] invalid canonical schema/gameId: ${canonicalPath}`)
    process.exit(1)
  }

  const phase10Raw = JSON.parse(readFileSync(phase10Path, "utf8")) as Phase10File
  const rows = Array.isArray(phase10Raw.pitchRows) ? phase10Raw.pitchRows : []
  const missing = Array.isArray(phase10Raw.missingOrPartial) ? phase10Raw.missingOrPartial : []

  const merged = mergePhase10IntoCanonical(base, rows, missing)

  // 走者イベント（盗塁死等）: 本番は一球 score 記録文のみ → domain.runnerEvents（sourceTier: score）
  // けん制＋捕球ミス行は一球速報記録文と突合結果を game.pickoffCatchMissInvestigations に格納
  try {
    const snapshots = loadSportsnaviScoreSnapshots(projectRoot, gameId)
    const re = runnerEventsForCanonicalFromScoreSnapshots({ gameId, doc: merged, snapshots })
    merged.domain.runnerEvents = re ?? []
    const yahooTextHtml = await getYahooTextHtmlCached(gameId)
    const batterEventsFromYahooDom = batterEventsFromYahooTextHtml({ gameId, html: yahooTextHtml })
    if (batterEventsFromYahooDom.length > 0) {
      const prev = merged.domain.batterEvents ?? []
      const seen = new Set(prev.map((e) => `${e.kind}\t${e.yahooBatterId}\t${e.inningHalf ?? ""}\t${e.sourceLine ?? ""}`))
      for (const e of batterEventsFromYahooDom) {
        const k = `${e.kind}\t${e.yahooBatterId}\t${e.inningHalf ?? ""}\t${e.sourceLine ?? ""}`
        if (seen.has(k)) continue
        seen.add(k)
        prev.push(e)
      }
      merged.domain.batterEvents = prev
    }
    const investigations = buildPickoffCatchMissInvestigations({ doc: merged, snapshots })
    merged.game = { ...merged.game, pickoffCatchMissInvestigations: investigations }
    extendEventsFingerprintForScoreRunnerMerge(merged)
  } catch (err) {
    console.warn("[phase4:merge] runner/pickoff merge skipped:", err)
  }

  const { action, path } = ingestCanonicalGame(projectRoot, merged)
  console.log(`ingest: ${action} → ${path}`)
  console.log(
    `  eventsFp=${(merged.eventsFingerprint ?? "").slice(0, 16)}… plateAppearances=${merged.domain.plateAppearances.length} pitchEvents=${merged.domain.pitchEvents.length}`
  )
}

main()

