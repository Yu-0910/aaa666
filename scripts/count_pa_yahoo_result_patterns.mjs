/**
 * canonical の plateAppearances を走査し、Yahoo 一球由来の
 * resultSummaryJa / resultJa のパターン件数を数える（一回限りの調査用）。
 *
 * 使い方: node scripts/count_pa_yahoo_result_patterns.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const canonDir = path.join(root, "_data", "scraped_games", "canonical")

function walkPas(doc) {
  const pas = doc?.domain?.plateAppearances
  return Array.isArray(pas) ? pas : []
}

function lastResultJa(pa) {
  const pe = pa?.pitchEvents
  if (!Array.isArray(pe) || pe.length === 0) return ""
  const last = pe[pe.length - 1]
  return String(last?.resultJa ?? "").trim()
}

function main() {
  const files = fs
    .readdirSync(canonDir)
    .filter((f) => f.endsWith(".json"))
    .sort()

  let totalPas = 0
  let pasWithPitches = 0
  let nonEmptySummary = 0

  const c = {
    /** resultSummaryJa に '[' を含む（括弧付き Yahoo 表記） */
    bracketInSummary: 0,
    /** resultSummaryJa が 'ボール' のみ（§6 で言及） */
    summaryExactlyBall: 0,
    /** resultSummaryJa が 'ボール[' で始まる（桑原型の近傍） */
    summaryStartsBallBracket: 0,
    /** resultSummaryJa に ランエンド を含む */
    summaryHasRanend: 0,
    /** resultSummaryJa に 敬遠 or 故意四球（合成含む） */
    summaryWalkSpecial: 0,
    /** 最終球 resultJa に '[' を含む */
    lastPitchBracket: 0,
    /** いずれかの球 resultJa に '[' を含む */
    anyPitchBracket: 0,
    /** 上記いずれか1つでも該当（打席のユニオン） */
    unionYahooDecorated: 0,
  }

  /** union 用: 少なくとも1球ある打席で、括弧・ボールのみ・ランエンド・敬遠系のいずれか */
  function isUnion(pa, summary, lastJa) {
    if (!Array.isArray(pa.pitchEvents) || pa.pitchEvents.length === 0) return false
    if (summary.includes("[")) return true
    if (summary === "ボール") return true
    if (summary.startsWith("ボール[")) return true
    if (summary.includes("ランエンド")) return true
    if (summary.includes("敬遠") || summary.includes("故意四球")) return true
    if (lastJa.includes("[")) return true
    for (const p of pa.pitchEvents) {
      if (String(p?.resultJa ?? "").includes("[")) return true
    }
    return false
  }

  for (const f of files) {
    const p = path.join(canonDir, f)
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(p, "utf8"))
    } catch {
      continue
    }
    for (const pa of walkPas(doc)) {
      totalPas += 1
      const pe = pa.pitchEvents
      if (Array.isArray(pe) && pe.length > 0) pasWithPitches += 1

      const summary = String(pa.resultSummaryJa ?? "").trim()
      if (summary) nonEmptySummary += 1

      const lastJa = lastResultJa(pa)

      if (summary.includes("[")) c.bracketInSummary += 1
      if (summary === "ボール") c.summaryExactlyBall += 1
      if (summary.startsWith("ボール[")) c.summaryStartsBallBracket += 1
      if (summary.includes("ランエンド")) c.summaryHasRanend += 1
      if (summary.includes("敬遠") || summary.includes("故意四球")) c.summaryWalkSpecial += 1
      if (lastJa.includes("[")) c.lastPitchBracket += 1

      let anyB = false
      if (Array.isArray(pe)) {
        for (const ev of pe) {
          if (String(ev?.resultJa ?? "").includes("[")) {
            anyB = true
            break
          }
        }
      }
      if (anyB) c.anyPitchBracket += 1

      if (isUnion(pa, summary, lastJa)) c.unionYahooDecorated += 1
    }
  }

  console.log(JSON.stringify({ games: files.length, ...c, totalPas, pasWithPitches, nonEmptySummary }, null, 2))
}

main()
