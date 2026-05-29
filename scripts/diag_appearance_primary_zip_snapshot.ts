/**
 * Phase 3 準備: 指定試合（または先頭 N 試合）について、出場成績 zip の適用状況を一覧する。
 *
 *   npm run diag:appearance-primary-zip -- --game-ids 2021038624,2021038735
 *   npm run diag:appearance-primary-zip
 *
 * 入力は `loadCanonicalGamesMergedForDerivedPipeline` と同一（Phase10 マージ済みメモリ doc）。
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getProjectRoot } from "../lib/projectRoot"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import {
  buildAppearanceZipResultOverrides,
  diagnoseBattingAppearanceSlotsVsPlateAppearances,
} from "../lib/yahooGame/appearanceStatsTrailingCells"
import { isAppearancePrimaryZipEnabled } from "../lib/yahooGame/appearancePrimaryFeatureFlag"

const DEFAULT_MAX_GAMES = 20

function parseGameIdsArg(argv: string[]): string[] | null {
  const joined = argv.join(" ")
  const m = /--game-ids\s+([^\s]+)/.exec(joined)
  if (!m?.[1]) return null
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function listCanonicalGameIds(root: string, max: number): string[] {
  const dir = join(root, "_data", "scraped_games", "canonical")
  const names = readdirSync(dir).filter((n) => /^\d+\.json$/u.test(n))
  names.sort()
  return names.slice(0, max).map((n) => n.replace(/\.json$/u, ""))
}

function loadMergedDoc(root: string, gameId: string): CanonicalGameDocument | null {
  const p = join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
  try {
    const raw = readFileSync(p, "utf-8")
    const doc = JSON.parse(raw) as CanonicalGameDocument
    return mergePhase10RestoredIntoDocIfPresent(doc)
  } catch {
    return null
  }
}

function main(): void {
  const root = getProjectRoot()
  const argv = process.argv.slice(2)
  let gameIds = parseGameIdsArg(argv)
  if (!gameIds || gameIds.length === 0) {
    gameIds = listCanonicalGameIds(root, DEFAULT_MAX_GAMES)
    console.log(
      `[diag:appearance-primary-zip] --game-ids 省略のため先頭 ${DEFAULT_MAX_GAMES} 試合を対象にします。`,
    )
  }

  console.log(`[diag:appearance-primary-zip] TOPPAGE_APPEARANCE_PRIMARY zip 有効: ${isAppearancePrimaryZipEnabled()}`)
  console.log("gameId\tbattersWithSlots\tzipSize\tdiagRows\tokFalse")

  for (const gameId of gameIds) {
    const doc = loadMergedDoc(root, gameId)
    if (!doc) {
      console.log(`${gameId}\t(read failed)`)
      continue
    }
    const batting = doc.domain?.battingLines ?? []
    const battersWithSlots = batting.filter(
      (b) => Array.isArray(b.appearancePaSlotsJa) && b.appearancePaSlotsJa.some((c) => String(c ?? "").trim() !== ""),
    ).length
    const zip = buildAppearanceZipResultOverrides(doc)
    const diag = diagnoseBattingAppearanceSlotsVsPlateAppearances(doc)
    const okFalse = diag.filter((r) => !r.ok).length
    console.log(`${gameId}\t${battersWithSlots}\t${zip.size}\t${diag.length}\t${okFalse}`)
  }
}

main()
