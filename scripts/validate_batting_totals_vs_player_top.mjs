/**
 * Validate our derived 2026 batting "total" row against Sportsnavi player "top" summary table.
 *
 * Why:
 * - When totals on our pages are "internally consistent" (rankings == derived) but still wrong,
 *   the quickest ground-truth check is Sportsnavi's player page summary.
 *
 * Usage:
 *   node scripts/validate_batting_totals_vs_player_top.mjs --year 2026 --league PL --limit 50
 *   node scripts/validate_batting_totals_vs_player_top.mjs --year 2026 --limit 0
 */

import fs from "node:fs"
import path from "node:path"

function parseArgs(argv) {
  const out = { year: "2026", limit: 50, league: "" }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) out.year = String(argv[++i]).trim()
    else if (a === "--limit" && argv[i + 1]) out.limit = Math.max(0, parseInt(String(argv[++i]).trim(), 10) || 0)
    else if (a === "--league" && argv[i + 1]) out.league = String(argv[++i]).trim()
  }
  return out
}

function stripTags(s) {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function extractSummaryTds(html) {
  const m = html.match(/bb-playerStatsTable--summary[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
  if (!m) return null
  const tbody = m[1]
  const tds = [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]))
  if (tds.length < 20) return null
  return tds
}

async function fetchPlayerTop(playerId) {
  const url = `https://baseball.yahoo.co.jp/npb/player/${encodeURIComponent(playerId)}/top`
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
  })
  const html = await res.text()
  return { ok: res.ok, status: res.status, url, html }
}

function readDerivedTotalRow(root, year, playerId) {
  const p = path.join(root, "_data", "derived", "player_season_batting", year, `yahoo_${playerId}.json`)
  if (!fs.existsSync(p)) return null
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  const rows = Array.isArray(j.rows) ? j.rows : []
  return rows.find((r) => r?.split_type === "total" && r?.split_value === "total") ?? null
}

function normalizeNum(x) {
  const s = String(x ?? "").trim()
  if (!s) return null
  if (s === "-" || s === "—") return null
  if (/^\.\d+$/.test(s)) return Number(`0${s}`)
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return null
}

function diffOne(playerId, derived, topTds) {
  // Sportsnavi summary table columns (24 tds confirmed):
  // 0 AVG, 1 G, 2 PA, 3 AB, 4 H, 5 2B, 6 3B, 7 HR, 8 TB, 9 RBI, 10 R, 11 SO,
  // 12 BB, 13 HBP, 14 SH, 15 SF, 16 SB, 17 CS, 18 GIDP, 19 OBP, 20 SLG, 21 OPS, 22 RISP, 23 E
  const expected = {
    avg: topTds[0],
    g: normalizeNum(topTds[1]),
    pa: normalizeNum(topTds[2]),
    ab: normalizeNum(topTds[3]),
    h: normalizeNum(topTds[4]),
    h2: normalizeNum(topTds[5]),
    h3: normalizeNum(topTds[6]),
    hr: normalizeNum(topTds[7]),
    tb: normalizeNum(topTds[8]),
    rbi: normalizeNum(topTds[9]),
    r: normalizeNum(topTds[10]),
    so: normalizeNum(topTds[11]),
    bb: normalizeNum(topTds[12]),
    hbp: normalizeNum(topTds[13]),
    sh: normalizeNum(topTds[14]),
    sf: normalizeNum(topTds[15]),
    sb: normalizeNum(topTds[16]),
    cs: normalizeNum(topTds[17]),
    gidp: normalizeNum(topTds[18]),
    obp: topTds[19],
    slg: topTds[20],
    ops: topTds[21],
    risp: topTds[22],
    e: normalizeNum(topTds[23]),
  }

  const got = {
    avg: derived?.avg ?? null,
    g: derived?.g ?? null,
    pa: derived?.pa ?? null,
    ab: derived?.ab ?? null,
    h: derived?.h ?? null,
    h2: derived?.h2 ?? null,
    h3: derived?.h3 ?? null,
    hr: derived?.hr ?? null,
    tb: derived?.tb ?? null,
    rbi: derived?.rbi ?? null,
    r: derived?.r ?? null,
    so: derived?.so ?? null,
    bb: derived?.bb ?? null,
    hbp: derived?.hbp ?? null,
    sh: derived?.sh ?? null,
    sf: derived?.sf ?? null,
    sb: derived?.sb ?? null,
    cs: derived?.cs ?? null,
    gidp: derived?.gidp ?? null,
    obp: derived?.obp ?? null,
    slg: derived?.slg ?? null,
    ops: derived?.ops ?? null,
    risp: derived?.risp_avg ?? null,
    e: derived?.e ?? null,
  }

  /** @type {Record<string, {expected: unknown, got: unknown}>} */
  const diffs = {}
  for (const k of Object.keys(expected)) {
    if (String(expected[k]) !== String(got[k])) diffs[k] = { expected: expected[k], got: got[k] }
  }

  return { playerId, diffs, expected, got }
}

async function main() {
  const { year, limit, league } = parseArgs(process.argv)
  const root = process.cwd()

  const rankingPath = path.join(root, "public", "data", "rankings", year, league || "PL", "打率_all.json")
  if (!fs.existsSync(rankingPath)) {
    console.error("[validate_batting_totals_vs_player_top] missing rankings file:", rankingPath)
    process.exit(1)
  }
  const ranking = JSON.parse(fs.readFileSync(rankingPath, "utf8"))
  const ids = Array.isArray(ranking) ? ranking.map((r) => String(r.playerId ?? "").trim()).filter(Boolean) : []
  const targets = limit > 0 ? ids.slice(0, limit) : ids

  const mismatches = []
  let ok = 0
  for (const playerId of targets) {
    const derived = readDerivedTotalRow(root, year, playerId)
    if (!derived) continue
    const r = await fetchPlayerTop(playerId)
    if (!r.ok) continue
    const tds = extractSummaryTds(r.html)
    if (!tds) continue
    const d = diffOne(playerId, derived, tds)
    const keys = Object.keys(d.diffs)
    if (keys.length > 0) mismatches.push({ playerId, name: derived?.player_name ?? "", diffKeys: keys, diffs: d.diffs })
    else ok += 1
    // be polite to the site
    await new Promise((res) => setTimeout(res, 250))
  }

  console.log(
    JSON.stringify(
      {
        year,
        league: league || "PL",
        checked: targets.length,
        ok,
        mismatches: mismatches.length,
        sample: mismatches.slice(0, 30),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error("[validate_batting_totals_vs_player_top] failed:", e)
  process.exit(1)
})

