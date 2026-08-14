#!/usr/bin/env node
/**
 * R2 upload 後の公開確認ゲート。
 *
 * - local public/data と R2 直の standings / rankings / top-leaders / top-probables を比較する
 * - weekly current-week / weekly rankings / weekly top-leaders も比較する
 * - 任意指定があれば選手成績 derived も比較する（derived は local ↔ R2）
 * - 本番 /data プロキシが R2 と同じデータを返すか確認する
 *
 * 用法:
 *   node scripts/verify_display_publish_after_upload.mjs --year 2026
 *   node scripts/verify_display_publish_after_upload.mjs --year 2026 --scope fast
 *   node scripts/verify_display_publish_after_upload.mjs --year 2026 --scope full
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
const SCOPE = argValue("--scope", "full").toLowerCase()
const CHECK_PRODUCTION = !process.argv.includes("--no-production")
const SAMPLE_PLAYER_YAHOO_ID = argValue("--sample-player-yahoo-id", "")
const SAMPLE_PLAYER_NPB_ID = argValue("--sample-player-npb-id", "")
const DEFAULT_SAMPLE_DERIVED_CATEGORIES =
  SCOPE === "fast"
    ? "player_season_batting,player_season_batting_period,player_season_batting_count,player_season_pitching_poc"
    : "player_season_batting,player_season_batting_context,player_season_batting_splits,player_season_batting_count,player_season_batting_period"
const SAMPLE_DERIVED_CATEGORIES = argValue(
  "--sample-derived-categories",
  DEFAULT_SAMPLE_DERIVED_CATEGORIES,
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
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
const CHECK_TOP_PROBABLES = SCOPE !== "fast" && !process.argv.includes("--skip-top-probables")

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

async function fetchProductionJson(label, relPath) {
  try {
    return await fetchJson(label, `${SITE_BASE}/${relPath}`)
  } catch (siteError) {
    if (String(process.env.TOPPAGE_VERIFY_PRODUCTION_VERCEL_CURL || "").trim() !== "1") {
      throw siteError
    }
    console.warn(
      `[verify-display-publish] WARN ${label}: direct production fetch failed; falling back to vercel curl`,
    )
    return fetchProductionJsonViaVercelCurl(label, relPath)
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

function topProbablesSignature(json) {
  if (json?.schemaVersion === "top-probables-v1" && Array.isArray(json?.cards)) {
    const cards = json.cards
    const cardSignatures = cards.map((card) => {
      const games = Array.isArray(card?.games) ? card.games : []
      return {
        cardKey: String(card?.cardKey ?? ""),
        seriesStart: String(card?.seriesStart ?? ""),
        seriesEnd: String(card?.seriesEnd ?? ""),
        gameCount: games.length,
        games: games.map((game) => ({
          dateJst: String(game?.dateJst ?? ""),
          gameId: String(game?.gameId ?? ""),
          awayTeamCode: String(game?.awayTeamCode ?? ""),
          homeTeamCode: String(game?.homeTeamCode ?? ""),
          awayPitcher: String(game?.awayProbable?.pitcherNameJa ?? ""),
          homePitcher: String(game?.homeProbable?.pitcherNameJa ?? ""),
          awaySource: String(game?.awayProbable?.source ?? ""),
          homeSource: String(game?.homeProbable?.source ?? ""),
        })),
      }
    })
    return {
      schemaVersion: String(json?.schemaVersion ?? ""),
      seasonYear: String(json?.seasonYear ?? ""),
      generatedAt: String(json?.generatedAt ?? ""),
      asOfDateJst: String(json?.asOfDateJst ?? ""),
      cardCount: cards.length,
      totalGames: cardSignatures.reduce((sum, card) => sum + card.gameCount, 0),
      cards: cardSignatures,
    }
  }

  const row = Array.isArray(json?.games) ? json.games[0] : Array.isArray(json) ? json[0] : null
  return {
    date: String(json?.dateJst ?? json?.date ?? ""),
    gameId: String(row?.gameId ?? ""),
    awayTeam: String(row?.awayTeamShort ?? row?.awayTeam ?? ""),
    homeTeam: String(row?.homeTeamShort ?? row?.homeTeam ?? ""),
    awayPitcher: String(row?.awayProbable?.name ?? row?.awayPitcher?.name ?? row?.awayPitcher ?? ""),
    homePitcher: String(row?.homeProbable?.name ?? row?.homePitcher?.name ?? row?.homePitcher ?? ""),
  }
}

function weeklyCurrentWeekSignature(json) {
  return {
    calendarWeekKey: String(json?.calendarWeekKey ?? ""),
    weekKey: String(json?.weekKey ?? ""),
    isFallbackWeek: Boolean(json?.isFallbackWeek),
    availableWeekKeys: Array.isArray(json?.availableWeekKeys) ? json.availableWeekKeys.map(String) : [],
    generatedAt: String(json?.generatedAt ?? ""),
  }
}

function playerSeasonBattingSignature(json) {
  const row = Array.isArray(json?.rows)
    ? json.rows.find((r) => String(r?.split_type ?? "") === "total") ?? json.rows[0]
    : null
  if (row) {
    return {
      schemaVersion: String(json?.schemaVersion ?? ""),
      seasonYear: String(json?.seasonYear ?? json?.year ?? ""),
      yahooBatterId: String(json?.yahooBatterId ?? json?.playerId ?? ""),
      generatedAt: String(json?.generatedAt ?? ""),
      sourceCanonicalGames: Array.isArray(json?.source?.canonicalGames) ? json.source.canonicalGames.length : 0,
      g: Number(row?.g ?? NaN),
      pa: Number(row?.pa ?? NaN),
      ab: Number(row?.ab ?? NaN),
      h: Number(row?.h ?? NaN),
      hr: Number(row?.hr ?? NaN),
      ops: String(row?.ops ?? ""),
    }
  }

  const stats = json?.stats ?? json?.season ?? json ?? {}
  return {
    playerId: String(json?.playerId ?? json?.yahooPlayerId ?? stats?.playerId ?? ""),
    team: String(json?.team ?? stats?.team ?? ""),
    games: Number(stats?.g ?? stats?.games ?? NaN),
    pa: Number(stats?.pa ?? NaN),
    ab: Number(stats?.ab ?? NaN),
    h: Number(stats?.h ?? NaN),
    hr: Number(stats?.hr ?? NaN),
    avg: Number(stats?.avg ?? NaN),
  }
}

function derivedEnvelopeSignature(json) {
  return {
    schemaVersion: String(json?.schemaVersion ?? ""),
    seasonYear: String(json?.seasonYear ?? json?.year ?? ""),
    yahooBatterId: String(json?.yahooBatterId ?? json?.playerId ?? ""),
    generatedAt: String(json?.generatedAt ?? ""),
    sourceCanonicalGames: Array.isArray(json?.source?.canonicalGames) ? json.source.canonicalGames.length : 0,
  }
}

class VerifyMismatchError extends Error {
  constructor(message, failureClass, details = {}) {
    super(message)
    this.name = "VerifyMismatchError"
    this.failureClass = failureClass
    this.details = details
  }
}

function assertSame(label, a, b, options = {}) {
  const aj = JSON.stringify(a)
  const bj = JSON.stringify(b)
  if (aj !== bj) {
    const expectedLabel = String(options.expectedLabel || "expected")
    const actualLabel = String(options.actualLabel || "actual")
    const failureClass = String(options.failureClass || "verify_mismatch")
    throw new VerifyMismatchError(
      `${label} mismatch\n  expected(${expectedLabel})=${aj}\n  actual(${actualLabel})=${bj}`,
      failureClass,
      {
        label,
        expected: a,
        actual: b,
        expectedLabel,
        actualLabel,
      },
    )
  }
  console.log(`[verify-display-publish] OK ${label}: ${aj}`)
}

function assertLocalMatchesR2(label, localSig, r2Sig) {
  assertSame(label, localSig, r2Sig, {
    expectedLabel: "local",
    actualLabel: "R2",
    failureClass: "local_vs_r2_failed",
  })
}

function assertProductionMatchesR2(label, localSig, r2Sig, productionSig) {
  const localJson = JSON.stringify(localSig)
  const r2Json = JSON.stringify(r2Sig)
  const productionJson = JSON.stringify(productionSig)
  if (r2Json === productionJson) {
    console.log(`[verify-display-publish] OK ${label}: ${r2Json}`)
    return
  }
  const failureClass = localJson === r2Json ? "production_stale_only" : "r2_vs_production_failed"
  assertSame(label, r2Sig, productionSig, {
    expectedLabel: "R2",
    actualLabel: "production",
    failureClass,
  })
}

async function verifyWeeklyCurrentWeek() {
  const rel = `data/rankings/weekly/${YEAR}/current-week.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson("R2 weekly current week", `${R2_BASE}/${rel}`)
  const r2Sig = weeklyCurrentWeekSignature(r2)
  const localSig = weeklyCurrentWeekSignature(local)
  assertLocalMatchesR2("R2 weekly current week", localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson("production weekly current week", rel)
    const prodSig = weeklyCurrentWeekSignature(prod)
    assertProductionMatchesR2("production weekly current week", localSig, r2Sig, prodSig)
  }
  return r2
}

async function verifyStandingsLeague(league) {
  const rel = `data/standings/${YEAR}/${league}.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 standings ${league}`, `${R2_BASE}/${rel}`)
  const localSig = firstStandingSignature(local)
  const r2Sig = firstStandingSignature(r2)
  assertLocalMatchesR2(`R2 standings ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson(`production standings ${league}`, rel)
    const prodSig = firstStandingSignature(prod)
    assertProductionMatchesR2(`production standings ${league}`, localSig, r2Sig, prodSig)
  }
}

async function verifyRankingLeague(league) {
  const rel = `data/rankings/${YEAR}/${league}/OPS.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 rankings OPS ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = firstRankingSignature(r2)
  const localSig = firstRankingSignature(local)
  assertLocalMatchesR2(`R2 rankings OPS ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson(`production rankings OPS ${league}`, rel)
    const prodSig = firstRankingSignature(prod)
    assertProductionMatchesR2(`production rankings OPS ${league}`, localSig, r2Sig, prodSig)
  }
}

async function verifyWeeklyRankingLeague(weekKey, league) {
  const rel = `data/rankings/weekly/${YEAR}/${weekKey}/${league}/OPS.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 weekly rankings OPS ${weekKey} ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = firstRankingSignature(r2)
  const localSig = firstRankingSignature(local)
  assertLocalMatchesR2(`R2 weekly rankings OPS ${weekKey} ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson(`production weekly rankings OPS ${weekKey} ${league}`, rel)
    const prodSig = firstRankingSignature(prod)
    assertProductionMatchesR2(`production weekly rankings OPS ${weekKey} ${league}`, localSig, r2Sig, prodSig)
  }
}

async function verifyTopLeadersLeague(league) {
  const rel = `data/top-leaders/${YEAR}/${league}/batting.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 top-leaders batting ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = topLeadersSignature(r2)
  const localSig = topLeadersSignature(local)
  assertLocalMatchesR2(`R2 top-leaders batting ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson(`production top-leaders batting ${league}`, rel)
    const prodSig = topLeadersSignature(prod)
    assertProductionMatchesR2(`production top-leaders batting ${league}`, localSig, r2Sig, prodSig)
  }
}

async function verifyWeeklyTopLeadersLeague(weekKey, league) {
  const rel = `data/top-leaders/weekly/${YEAR}/${weekKey}/${league}/batting.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson(`R2 weekly top-leaders batting ${weekKey} ${league}`, `${R2_BASE}/${rel}`)
  const r2Sig = topLeadersSignature(r2)
  const localSig = topLeadersSignature(local)
  assertLocalMatchesR2(`R2 weekly top-leaders batting ${weekKey} ${league}`, localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson(`production weekly top-leaders batting ${weekKey} ${league}`, rel)
    const prodSig = topLeadersSignature(prod)
    assertProductionMatchesR2(`production weekly top-leaders batting ${weekKey} ${league}`, localSig, r2Sig, prodSig)
  }
}

async function verifyTopProbables() {
  const rel = `data/top-probables/${YEAR}/current.json`
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(`public/${rel}`)
  const r2 = await fetchJson("R2 top-probables current", `${R2_BASE}/${rel}`)
  const r2Sig = topProbablesSignature(r2)
  const localSig = topProbablesSignature(local)
  assertLocalMatchesR2("R2 top-probables current", localSig, r2Sig)

  if (CHECK_PRODUCTION) {
    const prod = await fetchProductionJson("production top-probables current", rel)
    const prodSig = topProbablesSignature(prod)
    assertProductionMatchesR2("production top-probables current", localSig, r2Sig, prodSig)
  }
}

async function verifyDerivedSampleCategory(category, yahooId, signatureFn = derivedEnvelopeSignature) {
  const isNpbKeyedCategory = category === "player_season_pitching_poc"
  const playerId = isNpbKeyedCategory ? SAMPLE_PLAYER_NPB_ID : yahooId
  if (!playerId) {
    console.warn(`[verify-display-publish] skip sample player stats: no sample id for ${category}`)
    return
  }
  const filePrefix = isNpbKeyedCategory ? "npb" : "yahoo"
  const rel = `data/derived/${category}/${YEAR}/${filePrefix}_${playerId}.json`
  const localRel = `_data/derived/${category}/${YEAR}/${filePrefix}_${playerId}.json`
  if (!fs.existsSync(path.join(ROOT, localRel))) {
    console.warn(`[verify-display-publish] skip sample player stats: local file missing ${localRel}`)
    return
  }
  console.log(`[verify-display-publish] check ${rel}`)
  const local = readJson(localRel)
  const r2 = await fetchJson(`R2 ${category} ${playerId}`, `${R2_BASE}/${rel}`)
  const r2Sig = signatureFn(r2)
  assertSame(`R2 ${category} ${playerId}`, signatureFn(local), r2Sig)
}

function signatureForDerivedCategory(category) {
  if (category === "player_season_batting") return playerSeasonBattingSignature
  return derivedEnvelopeSignature
}

async function main() {
  console.log(`[verify-display-publish] year=${YEAR} scope=${SCOPE}`)
  console.log(`[verify-display-publish] R2=${R2_BASE}`)
  if (CHECK_PRODUCTION) console.log(`[verify-display-publish] production=${SITE_BASE}`)

  const weeklyCurrent = await verifyWeeklyCurrentWeek()
  const weeklyWeekKey = String(weeklyCurrent?.weekKey ?? "")
  if (!weeklyWeekKey) {
    throw new Error(`weekly current week is missing weekKey for ${YEAR}`)
  }

  for (const league of ["CL", "PL"]) {
    await verifyStandingsLeague(league)
    await verifyRankingLeague(league)
    await verifyTopLeadersLeague(league)
    await verifyWeeklyRankingLeague(weeklyWeekKey, league)
    await verifyWeeklyTopLeadersLeague(weeklyWeekKey, league)
  }
  if (CHECK_TOP_PROBABLES) {
    await verifyTopProbables()
  } else {
    console.log("[verify-display-publish] skip top-probables for fast scope")
  }
  if (SAMPLE_PLAYER_YAHOO_ID || SAMPLE_PLAYER_NPB_ID) {
    for (const category of SAMPLE_DERIVED_CATEGORIES) {
      await verifyDerivedSampleCategory(
        category,
        SAMPLE_PLAYER_YAHOO_ID,
        signatureForDerivedCategory(category),
      )
    }
  }

  console.log("[verify-display-publish] OK")
}

main().catch((e) => {
  console.error("[verify-display-publish] failed:", e?.message || e)
  if (e?.failureClass) {
    console.error(`[verify-display-publish] failureClass=${e.failureClass}`)
  }
  console.error(
    `[verify-display-publish] checked paths include: data/rankings/${YEAR}/{CL,PL}/OPS.json, data/rankings/weekly/${YEAR}/current-week.json, data/rankings/weekly/${YEAR}/<weekKey>/{CL,PL}/OPS.json, data/top-leaders/${YEAR}/{CL,PL}/batting.json, data/top-leaders/weekly/${YEAR}/<weekKey>/{CL,PL}/batting.json, data/top-probables/${YEAR}/current.json, data/derived/player_season_batting*`,
  )
  console.error(
    "Hint: rerun the matching R2 upload first. For full scope use: npm run display:r2:upload:full-display-delta:2026. If R2 is OK but production stays stale, deploy the proxy/app.",
  )
  process.exitCode = 1
})
