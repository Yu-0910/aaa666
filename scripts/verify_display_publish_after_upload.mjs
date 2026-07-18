#!/usr/bin/env node
/**
 * R2 upload 後の公開確認ゲート。
 *
 * - local public/data と R2 直の standings / rankings / top-leaders を比較する
 * - 本番 /data プロキシが R2 と同じ standings / rankings / top-leaders を返すか確認する
 *
 * 用法:
 *   node scripts/verify_display_publish_after_upload.mjs --year 2026
 *   node scripts/verify_display_publish_after_upload.mjs --year 2026 --no-production
 */

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const DEFAULT_R2_BASE = "https://pub-41ff9f32fcf748529b7036f73f9e04e5.r2.dev"
const DEFAULT_SITE_BASE = "https://short-stop.jp"

function argValue(name, fallback = "") {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.split("=").slice(1).join("=").trim()
  const i = process.argv.indexOf(name)
  if (i >= 0) return String(process.argv[i + 1] ?? "").trim()
  return fallback
}

const YEAR = argValue("--year", "2026")
const CHECK_PRODUCTION = !process.argv.includes("--no-production")
const VERCEL_CLI =
  process.env.TOPPAGE_VERCEL_CLI || (process.platform === "win32" ? "vercel.cmd" : "vercel")
const R2_BASE = (
  process.env.RANKINGS_BASE_URL ||
  process.env.NEXT_PUBLIC_RANKINGS_BASE_URL ||
  DEFAULT_R2_BASE
).replace(/\/+$/, "")
const SITE_BASE = (
  process.env.DISPLAY_R2_SITE_BASE_URL ||
  process.env.PHASE0_SITE_BASE_URL ||
  DEFAULT_SITE_BASE
).replace(/\/+$/, "")

function vercelCliArgs(subcommandArgs) {
  return [...subcommandArgs]
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"))
}

function shellQuote(arg) {
  return `"${String(arg).replace(/"/g, "\\\"")}"`
}

function extractFirstJsonPayload(text) {
  const src = String(text || "")
  const start = src.search(/[\[{]/)
  if (start < 0) throw new Error("JSON payload not found in vercel curl output")

  let depth = 0
  let inString = false
  let escaped = false
  let opener = ""

  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") {
      inString = true
      continue
    }
    if (!opener && (ch === "{" || ch === "[")) opener = ch
    if (ch === "{" || ch === "[") depth++
    else if (ch === "}" || ch === "]") {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }

  throw new Error("Incomplete JSON payload in vercel curl output")
}

async function fetchJson(label, url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    const snippet = body.replace(/\s+/g, " ").slice(0, 240)
    throw new Error(`${label} fetch failed: HTTP ${res.status} ${res.statusText} url=${url}${snippet ? ` body=${snippet}` : ""}`)
  }
  return await res.json()
}

function fetchProductionJsonViaVercelCurl(label, relPath) {
  const cliArgs = vercelCliArgs(["curl", `/${relPath}`])
  try {
    const command = [VERCEL_CLI, ...cliArgs].map(shellQuote).join(" ")
    const stdout = execSync(command, {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 180000,
    })
    return JSON.parse(extractFirstJsonPayload(stdout))
  } catch (error) {
    const detail = error?.stdout ? String(error.stdout).trim().slice(0, 240) : ""
    throw new Error(
      `${label} via vercel curl failed${detail ? ` body=${detail}` : ""}`,
    )
  }
}

function firstStandingSignature(json) {
  const row = Array.isArray(json?.rows) ? json.rows[0] : null
  return {
    generatedAt: String(json?.generatedAt ?? ""),
    teamName: String(row?.teamName ?? row?.team ?? ""),
    g: Number(row?.g ?? NaN),
    w: Number(row?.w ?? NaN),
    l: Number(row?.l ?? NaN),
    t: Number(row?.t ?? NaN),
  }
}

function normalizeRankingRows(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.rows)) return json.rows
  if (Array.isArray(json?.rankings)) return json.rankings
  return []
}

function firstRankingSignature(json) {
  const row = normalizeRankingRows(json)[0] ?? {}
  return {
    name: String(row.player ?? row.name ?? row.playerName ?? ""),
    ops: Number(row.ops ?? row.OPS ?? row.value ?? NaN),
    hr: Number(row.hr ?? row.HR ?? NaN),
  }
}

function topLeadersSignature(json) {
  const ops = Array.isArray(json?.leaders?.OPS) ? json.leaders.OPS[0] : null
  return {
    name: String(ops?.name ?? ""),
    value: Number(ops?.value ?? NaN),
    playerId: String(ops?.playerId ?? ""),
  }
}

function assertSame(label, a, b) {
  const aj = JSON.stringify(a)
  const bj = JSON.stringify(b)
  if (aj !== bj) {
    throw new Error(`${label} mismatch\n  expected(R2/local)=${aj}\n  actual(production/R2)=${bj}`)
  }
  console.log(`[verify-display-publish] OK ${label}: ${aj}`)
}

async function verifyStandingsLeague(league) {
  const rel = `data/standings/${YEAR}/${league}.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 standings ${league}`, `${R2_BASE}/${rel}`)
  const localSig = firstStandingSignature(local)
  const r2Sig = firstStandingSignature(r2)
  assertSame(`R2 standings ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = fetchProductionJsonViaVercelCurl(`production standings ${league}`, rel)
    const prodSig = firstStandingSignature(prod)
    assertSame(`production standings ${league}`, r2Sig, prodSig)
  }
}

async function verifyRankingLeague(league) {
  const rel = `data/rankings/${YEAR}/${league}/OPS.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 rankings OPS ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = firstRankingSignature(r2)
  assertSame(`R2 rankings OPS ${league}`, firstRankingSignature(local), r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = fetchProductionJsonViaVercelCurl(`production rankings OPS ${league}`, rel)
    const prodSig = firstRankingSignature(prod)
    assertSame(`production rankings OPS ${league}`, r2Sig, prodSig)
  }
}

async function verifyTopLeadersLeague(league) {
  const rel = `data/top-leaders/${YEAR}/${league}/batting.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 top-leaders batting ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = topLeadersSignature(r2)
  assertSame(`R2 top-leaders batting ${league}`, topLeadersSignature(local), r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = fetchProductionJsonViaVercelCurl(`production top-leaders batting ${league}`, rel)
    const prodSig = topLeadersSignature(prod)
    assertSame(`production top-leaders batting ${league}`, r2Sig, prodSig)
  }
}

async function main() {
  console.log(`[verify-display-publish] year=${YEAR}`)
  console.log(`[verify-display-publish] R2=${R2_BASE}`)
  if (CHECK_PRODUCTION) console.log(`[verify-display-publish] production=${SITE_BASE} (verified via vercel curl)`)

  for (const league of ["CL", "PL"]) {
    await verifyStandingsLeague(league)
    await verifyRankingLeague(league)
    await verifyTopLeadersLeague(league)
  }

  console.log("[verify-display-publish] OK")
}

main().catch((e) => {
  console.error("[verify-display-publish] failed:", e?.message || e)
  console.error(
    `[verify-display-publish] checked paths include: data/rankings/${YEAR}/{CL,PL}/OPS.json and data/top-leaders/${YEAR}/{CL,PL}/batting.json`,
  )
  console.error(
    "Hint: first rerun the R2 upload with: npm run display:publish:fast:2026. If R2 is OK but production stays stale, then deploy the proxy/app.",
  )
  process.exitCode = 1
})
