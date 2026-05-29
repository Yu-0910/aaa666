/**
 * スポナビ実況（textPlayByPlay）から結果が推定できるのに、canonical の打席に resultSummaryJa が無い（または中間表記のみ）件を検出する。
 *
 * 背景: Phase10 マージ後も `inferResultSummaryJaFromSportsnaviPlayLineText` が未対応の表記だと欠損が残る。
 * 新表記を拾う → 同関数を拡張 → `npm run backfill:canonical:plate-appearances-from-text` で埋め直す。
 *
 *   npx tsx scripts/validate_canonical_pa_text_result_coverage.ts --year 2026
 *   npx tsx scripts/validate_canonical_pa_text_result_coverage.ts --year 2026 --fail
 *   npx tsx scripts/validate_canonical_pa_text_result_coverage.ts --game-id 2021038768
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildPaIdToSportsnaviPlayLineMap,
  inferResultSummaryJaFromSportsnaviPlayLineText,
  plateAppearanceNeedsTextResultPatch,
} from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, "..")

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let year = "2026"
  let fail = false
  let gameId: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = String(args[++i]).trim()
    else if (args[i] === "--fail") fail = true
    else if (args[i] === "--game-id" && args[i + 1]) gameId = String(args[++i]).trim()
  }
  return { year, fail, gameId }
}

function readDoc(p: string): CanonicalGameDocument | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CanonicalGameDocument
  } catch {
    return null
  }
}

function main() {
  const { year, fail, gameId } = parseArgs(process.argv)
  const dir = path.join(projectRoot, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) {
    console.error("[validate_canonical_pa_text_result_coverage] missing dir:", dir)
    process.exit(1)
  }

  const files = gameId
    ? [`${gameId}.json`]
    : fs.readdirSync(dir).filter((f) => f.endsWith(".json"))

  type Row = {
    gameId: string
    paId: string
    yahooBatterId?: string
    inferred: string
    playLineSnippet: string
  }
  const gaps: Row[] = []

  for (const f of files) {
    const p = path.join(dir, f)
    if (!fs.existsSync(p)) continue
    const doc = readDoc(p)
    if (!doc?.gameId || doc.schemaVersion !== "yahoo-game-canonical-v1") continue

    const title = doc.game?.meta?.documentTitle ?? ""
    if (!gameId && year && !title.includes(`${year}年`)) continue

    const pas = doc.domain?.plateAppearances ?? []
    if (pas.length === 0) continue
    const lineMap = buildPaIdToSportsnaviPlayLineMap(doc)
    if (lineMap.size === 0) continue

    for (const pa of pas as PlateAppearance[]) {
      const pid = String(pa.paId ?? "").trim()
      if (!pid) continue
      const line = lineMap.get(pid)
      if (!plateAppearanceNeedsTextResultPatch(pa, line)) continue
      const inferred = inferResultSummaryJaFromSportsnaviPlayLineText(line!) ?? ""
      const snippet = (line ?? "").length > 120 ? `${(line ?? "").slice(0, 117)}...` : (line ?? "")
      gaps.push({
        gameId: doc.gameId,
        paId: pid,
        yahooBatterId: pa.yahooBatterId ? String(pa.yahooBatterId) : undefined,
        inferred,
        playLineSnippet: snippet,
      })
    }
  }

  const outPath = path.join(
    projectRoot,
    "_data",
    "derived",
    `validate_canonical_pa_text_result_coverage_${gameId ?? year}.json`,
  )
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: "validate-canonical-pa-text-result-coverage-v0",
        year: gameId ? null : year,
        gameId,
        gapCount: gaps.length,
        gaps,
      },
      null,
      2,
    ),
    "utf8",
  )

  if (gaps.length > 0) {
    console.error(
      `[validate_canonical_pa_text_result_coverage] ${gaps.length} plate appearance(s): text infers result but summary still missing/intermediate.`,
    )
    console.error(`  Report: ${outPath}`)
    for (const g of gaps.slice(0, 25)) {
      console.error(
        `  - ${g.gameId} ${g.paId}${g.yahooBatterId ? ` batter=${g.yahooBatterId}` : ""} → infer "${g.inferred}"`,
      )
    }
    if (gaps.length > 25) console.error(`  ... and ${gaps.length - 25} more`)
    console.error("  対処: inferResultSummaryJaFromSportsnaviPlayLineText を拡張 → npm run backfill:canonical:plate-appearances-from-text")
    if (fail) process.exit(2)
    process.exit(0)
  }

  console.log(
    `[validate_canonical_pa_text_result_coverage] ok (${files.length} file(s) scanned, filter=${gameId ?? `title includes ${year}年`})`,
  )
}

main()
