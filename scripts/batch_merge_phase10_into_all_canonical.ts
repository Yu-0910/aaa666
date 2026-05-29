/**
 * canonical ディレクトリ内の全試合について、対応する `derived/{gameId}_phase10_restored.json` があればマージする。
 *
 *   npx tsx scripts/batch_merge_phase10_into_all_canonical.ts
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { mergePhase10IntoCanonical, type Phase10PitchRow } from "../lib/yahooGame/mergePhase10FromPitchRows"
import { ingestCanonicalGame } from "../lib/yahooGame/persistCanonical"
import { runnerEventsFromYahooTextHtml } from "../lib/yahooGame/runnerEventsFromYahooTextHtml"
import { batterEventsFromYahooTextHtml } from "../lib/yahooGame/batterEventsFromYahooTextHtml"
import { runnerEventsFromSportsnaviScoreSnapshots } from "../lib/yahooGame/runnerEventsFromSportsnaviScore"
import { mergeRunnerEventsByPriority } from "../lib/yahooGame/mergeRunnerEventsByPriority"
import { buildPickoffCatchMissInvestigations } from "../lib/yahooGame/pickoffCatchMissFromScore"
import {
  extendEventsFingerprintForScoreRunnerMerge,
  loadSportsnaviScoreSnapshots,
} from "../lib/yahooGame/sportsnaviScoreSnapshotIO"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

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
  // 取得結果は保存して次回以降の再取得を抑える（best-effort）
  writeFileSync(p, html, "utf8")
  return html
}

async function mergeOne(gameId: string): Promise<{ ok: boolean; pa: number; err?: string; runnerEvents?: number }> {
  const canonicalPath = join(projectRoot, "_data", "scraped_games", "canonical", `${gameId}.json`)
  const phase10Path = join(projectRoot, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
  if (!existsSync(canonicalPath)) return { ok: false, pa: 0, err: "no canonical" }

  const base = JSON.parse(readFileSync(canonicalPath, "utf8")) as CanonicalGameDocument
  if (base?.schemaVersion !== "yahoo-game-canonical-v1" || String(base.gameId) !== String(gameId)) {
    return { ok: false, pa: 0, err: "invalid canonical" }
  }

  // phase10 があれば打席ログもマージ。無い場合でも /text 由来のイベントは付与する。
  const merged = (() => {
    if (!existsSync(phase10Path)) return base
    const phase10Raw = JSON.parse(readFileSync(phase10Path, "utf8")) as Phase10File
    const rows = Array.isArray(phase10Raw.pitchRows) ? phase10Raw.pitchRows : []
    const missing = Array.isArray(phase10Raw.missingOrPartial) ? phase10Raw.missingOrPartial : []
    return mergePhase10IntoCanonical(base, rows, missing)
  })()

  // 走者イベント: 一球 score 記録文のみ（本番方針）
  let runnerEventsCount = 0
  try {
    const snapshots = loadSportsnaviScoreSnapshots(projectRoot, gameId)
    const yahooTextHtml = await getYahooTextHtmlCached(gameId)
    const batterEventsFromYahooDom = batterEventsFromYahooTextHtml({ gameId, html: yahooTextHtml })
    const re = runnerEventsForCanonicalFromScoreSnapshots({ gameId, doc: merged, snapshots })
    merged.domain.runnerEvents = re ?? []
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
    runnerEventsCount = merged.domain.runnerEvents?.length ?? 0
  } catch (err) {
    console.warn(`[batch phase4:merge] ${gameId} runner/pickoff merge skipped:`, err)
  }

  ingestCanonicalGame(projectRoot, merged)
  return { ok: true, pa: merged.domain.plateAppearances.length, runnerEvents: runnerEventsCount }
}

async function main(): Promise<void> {
  const onlyGameIds = new Set(
    process.argv
      .slice(2)
      .flatMap((a) => (a.startsWith("--game-id=") ? [a.slice("--game-id=".length)] : []))
      .map((s) => String(s ?? "").trim())
      .filter(Boolean),
  )
  const canonDir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(canonDir)) {
    console.error("[batch phase4:merge] no dir:", canonDir)
    process.exit(1)
  }
  const files = readdirSync(canonDir).filter((f) => f.endsWith(".json"))
  let ok = 0
  let skipped = 0
  let totalPa = 0
  let totalRunnerEvents = 0
  const missingPhase10: string[] = []

  for (const f of files) {
    const m = f.match(/^(\d+)\.json$/)
    if (!m) continue
    const gameId = m[1]!
    if (onlyGameIds.size > 0 && !onlyGameIds.has(gameId)) continue
    const r = await mergeOne(gameId)
    if (r.ok) {
      ok++
      totalPa += r.pa
      totalRunnerEvents += r.runnerEvents ?? 0
    } else if (r.err === "no phase10") {
      missingPhase10.push(gameId)
      skipped++
    } else {
      skipped++
    }
  }

  console.log(
    `[batch phase4:merge] merged ${ok}/${files.length} games (plateAppearances rows total in last writes: ${totalPa}, runnerEvents parsed: ${totalRunnerEvents})`,
  )
  if (missingPhase10.length > 0) {
    console.warn(`[batch phase4:merge] no phase10 file for ${missingPhase10.length} games (skipped)`)
  }
}

main()
