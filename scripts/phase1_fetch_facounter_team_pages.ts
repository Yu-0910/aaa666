/**
 * Phase 1: facounter 各球団ページ HTML を取得しローカル保存する。
 *
 * 出力:
 *   _data/scraped_external/facounter/{year}/{slug}.html
 *   _data/scraped_external/facounter/{year}/manifest.json
 *
 * 使い方:
 *   npx tsx scripts/phase1_fetch_facounter_team_pages.ts --year 2026
 *   npx tsx scripts/phase1_fetch_facounter_team_pages.ts --year 2026 --force
 */

import fs from "fs"
import path from "path"
import { FACOUNTER_TEAM_PAGES_2026, type FacounterTeamPageDef } from "@/lib/facounterTeamPages"
import { getProjectRoot } from "@/lib/projectRoot"

type ManifestV1 = {
  schemaVersion: "facounter-team-pages-manifest-v1"
  seasonYear: string
  fetchedAt: string
  sourceBaseUrl: string
  teams: Array<{
    slug: string
    url: string
    rosterTeamFullName: string
    league: "CL" | "PL"
    file: string
    bytes: number
    ok: boolean
    error?: string
  }>
}

function parseArgs(argv: string[]) {
  const yearIdx = argv.indexOf("--year")
  const throttleIdx = argv.indexOf("--throttle-ms")
  const retriesIdx = argv.indexOf("--fetch-retries")
  const year = yearIdx >= 0 ? (argv[yearIdx + 1] ?? "").trim() : "2026"
  const throttleMsRaw = throttleIdx >= 0 ? (argv[throttleIdx + 1] ?? "").trim() : ""
  const throttleMs = throttleMsRaw ? Math.max(0, parseInt(throttleMsRaw, 10) || 0) : 1200
  const retriesRaw = retriesIdx >= 0 ? (argv[retriesIdx + 1] ?? "").trim() : ""
  const fetchRetries = retriesRaw ? Math.max(1, parseInt(retriesRaw, 10) || 1) : 3
  const force = argv.includes("--force")
  return { year, throttleMs, fetchRetries, force }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  url: string,
  retries: number
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  let lastErr = ""
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "TopPage-FA-Estimate-Bot/1.0 (personal stats; phase1 fetch)",
        },
        cache: "no-store",
      })
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${res.statusText}`
      } else {
        const html = await res.text()
        if (html.length < 500) {
          lastErr = "response too short"
        } else if (!/国内FA/.test(html) && !/国内ＦＡ/.test(html)) {
          lastErr = "missing 国内FA column marker"
        } else {
          return { ok: true, html }
        }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
    if (attempt < retries) await sleep(800 * attempt)
  }
  return { ok: false, error: lastErr || "fetch failed" }
}

async function fetchTeam(
  def: FacounterTeamPageDef,
  outPath: string,
  opts: { force: boolean; fetchRetries: number }
): Promise<ManifestV1["teams"][number]> {
  const relFile = path.basename(outPath)
  if (!opts.force && fs.existsSync(outPath)) {
    const st = fs.statSync(outPath)
    if (st.size > 500) {
      return {
        slug: def.slug,
        url: def.url,
        rosterTeamFullName: def.rosterTeamFullName,
        league: def.league,
        file: relFile,
        bytes: st.size,
        ok: true,
      }
    }
  }

  const got = await fetchWithRetry(def.url, opts.fetchRetries)
  if (!got.ok) {
    return {
      slug: def.slug,
      url: def.url,
      rosterTeamFullName: def.rosterTeamFullName,
      league: def.league,
      file: relFile,
      bytes: 0,
      ok: false,
      error: got.error,
    }
  }

  fs.writeFileSync(outPath, got.html, "utf8")
  return {
    slug: def.slug,
    url: def.url,
    rosterTeamFullName: def.rosterTeamFullName,
    league: def.league,
    file: relFile,
    bytes: Buffer.byteLength(got.html, "utf8"),
    ok: true,
  }
}

async function main() {
  const { year, throttleMs, fetchRetries, force } = parseArgs(process.argv.slice(2))
  const root = getProjectRoot()
  const outDir = path.join(root, "_data", "scraped_external", "facounter", year)
  fs.mkdirSync(outDir, { recursive: true })

  const teams: ManifestV1["teams"] = []
  let okCount = 0
  let failCount = 0

  console.log(`[phase1_fetch_facounter] year=${year} teams=${FACOUNTER_TEAM_PAGES_2026.length} force=${force}`)

  for (const def of FACOUNTER_TEAM_PAGES_2026) {
    const outPath = path.join(outDir, `${def.slug}.html`)
    const row = await fetchTeam(def, outPath, { force, fetchRetries })
    teams.push(row)
    if (row.ok) {
      okCount++
      console.log(`  OK ${def.slug} ${def.rosterTeamFullName} (${row.bytes} bytes)`)
    } else {
      failCount++
      console.error(`  FAIL ${def.slug} ${def.rosterTeamFullName}: ${row.error}`)
    }
    if (throttleMs > 0) await sleep(throttleMs)
  }

  const manifest: ManifestV1 = {
    schemaVersion: "facounter-team-pages-manifest-v1",
    seasonYear: year,
    fetchedAt: new Date().toISOString(),
    sourceBaseUrl: "https://facounter.net/count/",
    teams,
  }
  const manifestPath = path.join(outDir, "manifest.json")
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8")

  console.log(
    `[phase1_fetch_facounter] done ok=${okCount} fail=${failCount} → ${outDir}`
  )
  if (failCount > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error("[phase1_fetch_facounter]", e)
  process.exitCode = 1
})
