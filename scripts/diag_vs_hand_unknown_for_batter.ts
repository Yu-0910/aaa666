/**
 * 1 選手の「対不明」打席・試合を特定（調査用）。
 *
 * npx tsx scripts/diag_vs_hand_unknown_for_batter.ts --yahoo 1950286
 */
import { existsSync, readdirSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  loadVsHandRowsFromCanonicalWithDebug,
  mergePhase10RestoredIntoDocIfPresent,
} from "../lib/seasonStatsPilot"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function loadCanonicalGames(): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function main(): void {
  process.chdir(projectRoot)
  const yahoo = process.argv.includes("--yahoo")
    ? String(process.argv[process.argv.indexOf("--yahoo") + 1] ?? "").trim()
    : ""
  if (!/^\d+$/.test(yahoo)) {
    console.error("usage: npx tsx scripts/diag_vs_hand_unknown_for_batter.ts --yahoo <yahooBatterId>")
    process.exit(2)
  }

  const docs = loadCanonicalGames()
  const mergedDocsByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) {
    const gid = String(d.gameId ?? "").trim()
    if (gid) mergedDocsByGameId.set(gid, mergePhase10RestoredIntoDocIfPresent(d))
  }

  const d = loadVsHandRowsFromCanonicalWithDebug(yahoo, {
    preloadedCanonicalDocs: docs,
    mergedDocsByGameId,
    collectVsUnknownAbSamples: true,
  })

  const unknownRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "unknown")
  const rRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "R")
  const lRow = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "L")

  const samples = (d.vsUnknownAbSamples ?? []).map((s) => {
    const doc = mergedDocsByGameId.get(s.gameId)
    const title = String(doc?.game?.meta?.documentTitle ?? "").trim() || null
    return { ...s, documentTitle: title }
  })

  const gameIdsFromSamples = [...new Set(samples.map((s) => s.gameId))].sort()
  const mismatchGames = d.perGameMismatchSamples.map((m) => {
    const doc = mergedDocsByGameId.get(m.gameId)
    const title = String(doc?.game?.meta?.documentTitle ?? "").trim() || null
    return { ...m, documentTitle: title }
  })

  console.log(
    JSON.stringify(
      {
        yahoo,
        vsHandRows: {
          R: rRow ? { g: rRow.g, pa: rRow.pa, ab: rRow.ab, h: rRow.h, hr: rRow.hr } : null,
          L: lRow ? { g: lRow.g, pa: lRow.pa, ab: lRow.ab, h: lRow.h, hr: lRow.hr } : null,
          unknown: unknownRow
            ? { g: unknownRow.g, pa: unknownRow.pa, ab: unknownRow.ab, h: unknownRow.h, hr: unknownRow.hr }
            : null,
        },
        reconciliation: d.reconciliation,
        gameIdsFromVsUnknownAbSamples: gameIdsFromSamples,
        vsUnknownAbSamples: samples,
        perGameMismatchSamples: mismatchGames,
        unknownPitchers: d.unknownPitchers,
        missingPitcherIdPas: d.missingPitcherIdPas,
        missingPitcherIdSamples: d.missingPitcherIdSamples,
        hint:
          "reconciliation.backfilledGames>0 かつ cellResolvedR/L が 0 のとき、対不明の多くは「1試合で出場成績と PA 経路がズレ、Phase25 が不明へ寄せた」可能性が高い。perGameMismatchSamples の gameId を diag_vs_hand_one_game で追う。",
      },
      null,
      2,
    ),
  )
}

main()
