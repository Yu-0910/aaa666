/**
 * canonical の plateAppearances のうち pitchEvents が無い打席を列挙し、
 * Phase10 derived（*_phase10_restored.json）の missingOrPartial と突き合わせる。
 *
 * 「二死・走者アウトで3アウト・打者打席結果なし」は仕様上の欠損（修復対象外）として別集計する。
 *
 * 実行:
 *   npx tsx scripts/diag_missing_pitch_events_2026.mjs
 *   npx tsx scripts/diag_missing_pitch_events_2026.mjs --json
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// lib/yahooGame/paIdFormat.ts / pitchByPitchRunnerOutNoAb.ts と整合（node .mjs から TS import 回避）

const PAID_RE = /^(\d+)-(\d+)-(表|裏)-(\d+)$/

function parsePaId(paId) {
  const m = String(paId ?? "").trim().match(PAID_RE)
  if (!m) return null
  return {
    gameId: m[1],
    inning: Number(m[2]),
    half: m[3],
    paSeqInHalf: Number(m[4]),
  }
}

function paSeqInHalfToScoreIndex(paId) {
  const p = parsePaId(paId)
  if (!p) return null
  const tb = p.half === "表" ? "1" : "2"
  return `${String(p.inning).padStart(2, "0")}${tb}${String(p.paSeqInHalf).padStart(2, "0")}00`
}
function isRunnerOutEndsHalfNoAbFromPlayText(text) {
  const s = String(text ?? "").replace(/\s+/g, "")
  if (!s) return false
  if (/ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠/.test(s)) {
    return false
  }
  if (!/3アウト|３アウト/.test(s)) return false
  if (!/二死|2死/.test(s)) return false
  return (
    /盗塁失敗/.test(s) ||
    /タッチアウト/.test(s) ||
    /盗塁を試みるもアウト/.test(s) ||
    /誘い出され盗塁失敗/.test(s) ||
    (/けん制/.test(s) && /盗塁/.test(s))
  )
}

function normalizePlayLine(s) {
  return String(s ?? "").replace(/\s+/g, "")
}

function batterResultInPlayText(text) {
  const s = normalizePlayLine(text)
  return /ホームラン|本塁打|ランホームラン|[23]ラン|安打|単打|二塁打|三塁打|三振|ゴロ|飛|凡打|犠打|犠飛|四球|死球|申告敬遠/.test(s)
}

function playLinesForPaFromCanonical(doc, inning, topBottom, paSeqInHalf, yahooBatterId) {
  const heading = `${Number(inning)}回${topBottom}`
  const seq = Number(paSeqInHalf)
  const roster = doc.game?.yahooPlayersMentioned ?? {}
  const batterName = yahooBatterId ? normalizePlayLine(roster[yahooBatterId] ?? "") : ""
  const out = []
  const seen = new Set()
  const push = (s) => {
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  for (const sec of doc.game?.textPlayByPlay ?? []) {
    if (sec.sectionTitle !== heading) continue
    for (const line of sec.lines ?? []) {
      const s = String(line)
      const norm = normalizePlayLine(s)
      if (batterName && norm.includes(batterName)) push(s)
      const m = s.match(/^(\d+)[：:]/)
      if (m && Number(m[1]) === seq) push(s)
    }
  }
  return out
}

function isExpectedNoPitchEventsPa(doc, pa, phase10Reason) {
  if (phase10Reason?.includes("runner_out_ends_half_no_ab")) return true
  const parsed = parsePaId(pa.paId)
  if (!parsed) return false
  const lines = playLinesForPaFromCanonical(
    doc,
    parsed.inning,
    parsed.half,
    parsed.paSeqInHalf,
    pa.yahooBatterId,
  )
  if (lines.some((l) => batterResultInPlayText(l))) return false
  if (lines.some((l) => isRunnerOutEndsHalfNoAbFromPlayText(l))) return true
  const summary = String(pa.resultSummaryJa ?? "")
  if (summary && batterResultInPlayText(summary)) return false
  return isRunnerOutEndsHalfNoAbFromPlayText(summary)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function parseArgs(argv) {
  let year = "2026"
  let jsonOnly = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--year" && argv[i + 1]) year = String(argv[++i]).trim() || year
    if (a?.startsWith("--year=")) year = a.slice("--year=".length).trim() || year
    if (a === "--json") jsonOnly = true
  }
  return { year, jsonOnly }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function isCancelled(doc) {
  const miss = doc.game?.missingOrPartial ?? []
  return miss.some((s) => String(s).includes("game cancelled")) || miss.some((s) => String(s).includes("cancelled"))
}

function paIndexFromPaId(paId) {
  return paSeqInHalfToScoreIndex(paId)
}

function phase10DerivedPath(gameId) {
  return path.join(root, "_data", "scraped_games", "derived", `${gameId}_phase10_restored.json`)
}

function canonicalPath(gameId) {
  return path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
}

function main() {
  const { year, jsonOnly } = parseArgs(process.argv.slice(2))
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJson(idxPath)
  const gameIds = (idx.gameIds ?? []).map((x) => String(x).trim()).filter(Boolean)

  /** @type {Array<Record<string, unknown>>} */
  const rows = []

  for (const gid of gameIds) {
    const cp = canonicalPath(gid)
    if (!fs.existsSync(cp)) continue
    const canon = readJson(cp)
    if (isCancelled(canon)) continue

    const dpath = phase10DerivedPath(gid)
    const derivedExists = fs.existsSync(dpath)
    const derived = derivedExists ? readJson(dpath) : null
    const pitchRows = Array.isArray(derived?.pitchRows) ? derived.pitchRows : []
    const derivedPitchRows = pitchRows.length
    const miss = Array.isArray(derived?.missingOrPartial) ? derived.missingOrPartial : []
    const missByIndex = new Map()
    for (const m of miss) {
      const s = String(m)
      const mm = s.match(/^score:(\d{7}):(.+)$/)
      if (!mm) continue
      const ix = mm[1]
      const reason = mm[2]
      const arr = missByIndex.get(ix) ?? []
      arr.push(reason)
      missByIndex.set(ix, arr)
    }

    const pas = canon.domain?.plateAppearances ?? []
    for (const pa of pas) {
      const pe = pa.pitchEvents ?? []
      if (Array.isArray(pe) && pe.length > 0) continue

      const paId = String(pa.paId ?? "").trim()
      const paIndex = paIndexFromPaId(paId)
      const reasons = paIndex ? (missByIndex.get(paIndex) ?? []) : []
      const phase10Reason = reasons[0] ?? "unknown"
      const expectedRunnerOutNoAb = isExpectedNoPitchEventsPa(canon, pa, phase10Reason)

      let derivedHasRowsForPa = false
      if (paIndex) {
        const inn = Number(paIndex.slice(0, 2))
        const tb = paIndex[2] === "1" ? "表" : "裏"
        const bo = Number(paIndex.slice(3, 5))
        derivedHasRowsForPa = pitchRows.some(
          (r) => String(r?.inning ?? "") === String(inn) && String(r?.top_bottom ?? "") === tb && String(r?.bat_order ?? "") === String(bo),
        )
      }

      rows.push({
        gameId: gid,
        paId,
        paIndex,
        summary: String(pa.resultSummaryJa ?? "").trim(),
        derivedExists,
        derivedPitchRows,
        derivedHasRowsForPa,
        phase10Reason,
        phase10RunnerOutFlag: reasons.some((r) => String(r).includes("runner_out_ends_half_no_ab")),
        expectedRunnerOutNoAb,
        actionable: !expectedRunnerOutNoAb,
      })
    }
  }

  const actionable = rows.filter((r) => r.actionable)
  const expected = rows.filter((r) => r.expectedRunnerOutNoAb)

  const report = {
    year,
    missingPaCount: rows.length,
    actionableMissingPaCount: actionable.length,
    expectedRunnerOutNoAbCount: expected.length,
    missingGames: new Set(rows.map((r) => r.gameId)).size,
    actionableGames: new Set(actionable.map((r) => r.gameId)).size,
    byReason: actionable.reduce((acc, r) => {
      acc[r.phase10Reason] = (acc[r.phase10Reason] ?? 0) + 1
      return acc
    }, {}),
    rows,
    actionableRows: actionable,
    expectedRunnerOutRows: expected,
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log("")
  console.log("[diag missing pitchEvents]")
  console.log(`  year=${year}`)
  console.log(`  missing_pas=${rows.length} (修復対象=${actionable.length}, 仕様上=${expected.length})`)
  console.log(`  games=${report.missingGames} (修復対象試合=${report.actionableGames})`)
  console.log(`  actionable_reasons=${JSON.stringify(report.byReason)}`)
  console.log("")

  if (expected.length) {
    console.log("  ─ 仕様上（二死・走者アウトで3アウト・打者結果なし）─")
    for (const r of expected) {
      console.log(`      ${r.gameId}\t${r.paId}\t${r.phase10Reason}`)
    }
    console.log("")
  }

  if (actionable.length) {
    console.log("  ─ 修復対象 ─")
    const byGame = new Map()
    for (const r of actionable) {
      const arr = byGame.get(r.gameId) ?? []
      arr.push(r)
      byGame.set(r.gameId, arr)
    }
    for (const gid of [...byGame.keys()].sort()) {
      const list = byGame.get(gid) ?? []
      console.log(`  - ${gid} missing=${list.length}`)
      for (const r of list) {
        const has = r.derivedHasRowsForPa ? "derivedRows=Y" : "derivedRows=N"
        console.log(
          `      ${r.paId}\tindex=${r.paIndex ?? "?"}\t${r.phase10Reason}\t${has}\tsummary=${r.summary || "-"}`,
        )
      }
    }
    console.log("")
  }
}

main()
