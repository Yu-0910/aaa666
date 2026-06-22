/**
 * Phase 35: Sporting News 各球団の先発ローテーション予想を取得・パースする。
 *
 * 出力:
 *   _data/external/sportingnews_rotation/{year}/{teamCode}.json
 *
 * 使い方:
 *   npx tsx scripts/phase35_fetch_sportingnews_rotation.ts --year 2026
 *   npm run phase35:fetch:sportingnews-rotation
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import {
  loadSportingNewsRotationUrlsConfig,
  sportingNewsRotationSnapshotPath,
} from "@/lib/sportingNews/loadRotationUrlsConfig"
import { parseSportingNewsRotationHtml } from "@/lib/sportingNews/rotationParse"
import {
  SPORTINGNEWS_ROTATION_SCHEMA_VERSION,
  type SportingNewsRotationSnapshot,
} from "@/lib/sportingNews/types"
import { appendPipelineBulkLog } from "./pipelineBulkLog.mjs"

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const throttleIdx = argv.indexOf("--throttle-ms")
  const retriesIdx = argv.indexOf("--fetch-retries")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  const throttleMsRaw = throttleIdx >= 0 ? (argv[throttleIdx + 1] ?? "").trim() : ""
  const throttleMs = throttleMsRaw ? Math.max(0, parseInt(throttleMsRaw, 10) || 0) : 400
  const retriesRaw = retriesIdx >= 0 ? (argv[retriesIdx + 1] ?? "").trim() : ""
  const fetchRetries = retriesRaw ? Math.max(0, parseInt(retriesRaw, 10) || 0) : 4
  return { year, throttleMs, fetchRetries }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(url: string, fetchRetries: number): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  }
  let lastErr: unknown
  for (let attempt = 0; attempt <= fetchRetries; attempt++) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      if (attempt < fetchRetries) {
        const waitMs = 1000 * Math.pow(2, attempt)
        console.warn(
          `[phase35] fetch failed (${attempt + 1}/${fetchRetries + 1}), retry in ${waitMs}ms: ${url}`,
        )
        await sleep(waitMs)
      }
    }
  }
  throw lastErr
}

function readSnapshotIfExists(filePath: string): SportingNewsRotationSnapshot | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as SportingNewsRotationSnapshot
  } catch {
    return null
  }
}

function writeSnapshot(filePath: string, snapshot: SportingNewsRotationSnapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
}

async function main() {
  const root = getProjectRoot()
  const { year, throttleMs, fetchRetries } = parseArgs(process.argv.slice(2))
  const config = loadSportingNewsRotationUrlsConfig(year, root)
  const fetchedAt = new Date().toISOString()

  let ok = 0
  let kept = 0
  let failed = 0

  for (let i = 0; i < config.teams.length; i++) {
    const team = config.teams[i]!
    const outPath = sportingNewsRotationSnapshotPath(root, year, team.teamCode)
    const prev = readSnapshotIfExists(outPath)

    try {
      console.log(`[phase35] fetch ${team.teamCode} (${team.teamDisplay}): ${team.sourceUrl}`)
      const html = await fetchText(team.sourceUrl, fetchRetries)
      const { rows, warnings } = parseSportingNewsRotationHtml(html, year)

      if (rows.length === 0) {
        throw new Error(
          warnings.join("; ") || "パース結果 0 行（テーブル未検出の可能性）",
        )
      }

      const snapshot: SportingNewsRotationSnapshot = {
        schemaVersion: SPORTINGNEWS_ROTATION_SCHEMA_VERSION,
        seasonYear: year,
        teamCode: team.teamCode,
        teamDisplay: team.teamDisplay,
        sourceUrl: team.sourceUrl,
        fetchedAt,
        rows,
        parseWarnings: warnings,
      }
      writeSnapshot(outPath, snapshot)
      ok++
      console.log(`[phase35] OK ${team.teamCode}: ${rows.length} rows → ${outPath}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failed++
      if (prev) {
        kept++
        console.warn(`[phase35] FAIL ${team.teamCode}: ${msg} — 前回スナップショットを維持`)
      } else {
        console.error(`[phase35] FAIL ${team.teamCode}: ${msg} — 出力なし（初回）`)
      }
      appendPipelineBulkLog(
        root,
        "phase35:fetch:sportingnews-rotation",
        `FAIL team=${team.teamCode} err=${msg} keptPrevious=${prev ? "yes" : "no"}`,
      )
    }

    if (i < config.teams.length - 1 && throttleMs > 0) {
      await sleep(throttleMs)
    }
  }

  appendPipelineBulkLog(
    root,
    "phase35:fetch:sportingnews-rotation",
    `done year=${year} ok=${ok} keptPreviousOnFail=${kept} failed=${failed}`,
  )

  console.log(
    `\n[phase35] done year=${year} ok=${ok}/${config.teams.length} failed=${failed} keptPrevious=${kept}\n`,
  )

  if (ok === 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
