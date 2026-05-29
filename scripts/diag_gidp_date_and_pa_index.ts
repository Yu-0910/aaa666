/**
 * 指定打者について、Yahoo /text DOM由来の併殺（GIDP）イベントが
 * 「いつ（試合日）」「その試合で何打席目」かを出力する。
 *
 * 実行:
 *   npx tsx scripts/diag_gidp_date_and_pa_index.ts --year 2026 --batter-ids 1500128,1950278
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; batterIds: string[] } {
  const args = process.argv.slice(2)
  let year = "2026"
  let batterIds: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if ((args[i] === "--batter-ids" || args[i] === "--bids") && args[i + 1]) {
      batterIds = String(args[i + 1])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  if (batterIds.length === 0) {
    console.error("[diag_gidp_date] missing --batter-ids")
    process.exit(1)
  }
  return { year, batterIds }
}

function extractDateJaFromTitle(title: string): string {
  const s = String(title ?? "")
  const m = s.match(/(\d{4}年\d{1,2}月\d{1,2}日)/)
  return m ? m[1] : ""
}

function stripTags(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isGidpSummaryText(tail: string): boolean {
  const s = String(tail ?? "").trim()
  if (!s) return false
  if (/併殺崩れ/.test(s)) return false
  if (/盗塁/.test(s)) return false
  if (/三振/.test(s)) return false
  if (/併殺打|併打|併殺/.test(s)) return true
  if (/(ダブルプレー|ゲッツー)/.test(s) && /\d-\d-\d/.test(s)) return true
  return false
}

type Hit = {
  gameId: string
  dateJa: string
  batterId: string
  batterName?: string
  batterOrder?: string
  inningHalf?: string
  paIndexInGame: number
  summary: string
}

function scanYahooTextHtmlForGidp(args: {
  gameId: string
  html: string
  targetBatterIds: Set<string>
  dateJa: string
}): Hit[] {
  const { gameId, html, targetBatterIds, dateJa } = args
  const out: Hit[] = []

  const tokenRe =
    /<h1 class="bb-liveText__inning">([^<]+)<\/h1>|<p class="bb-liveText__batter">([\s\S]*?)<\/p>|<p class="bb-liveText__summary[^"]*"[^>]*>([\s\S]*?)<\/p>/g
  const batterInsideRe =
    /<span class="bb-liveText__order">([^<]+)<\/span>[\s\S]*?<a class="bb-liveText__player"[^>]*href="\/npb\/player\/(\d+)\/top"[^>]*>([^<]+)<\/a>/

  let inningHalf: string | undefined
  let lastBatterId: string | undefined
  let lastBatterName: string | undefined
  let lastBatterOrder: string | undefined

  const paCountByBatter = new Map<string, number>()

  function inningHalfFromHeading(heading: string): string | undefined {
    const s = String(heading ?? "").trim()
    const m = s.match(/^(\d+)回(表|裏)$/)
    if (!m) return undefined
    return `${m[1]}回${m[2]}`
  }

  for (let mm = tokenRe.exec(html); mm; mm = tokenRe.exec(html)) {
    const heading = mm[1]
    const batterInner = mm[2]
    const summaryInner = mm[3]

    if (heading) {
      const ih = inningHalfFromHeading(heading)
      if (ih) inningHalf = ih
      continue
    }

    if (batterInner) {
      const m = batterInner.match(batterInsideRe)
      if (!m) {
        lastBatterId = undefined
        lastBatterName = undefined
        lastBatterOrder = undefined
        continue
      }
      lastBatterOrder = String(m[1] ?? "").trim() || undefined
      lastBatterId = String(m[2] ?? "").trim() || undefined
      lastBatterName = String(m[3] ?? "").trim() || undefined
      if (lastBatterId) {
        paCountByBatter.set(lastBatterId, (paCountByBatter.get(lastBatterId) ?? 0) + 1)
      }
      continue
    }

    if (summaryInner) {
      if (!lastBatterId) continue
      if (!targetBatterIds.has(lastBatterId)) continue
      const tail = stripTags(summaryInner)
      if (!isGidpSummaryText(tail)) continue
      const paIndexInGame = paCountByBatter.get(lastBatterId) ?? 0
      out.push({
        gameId,
        dateJa,
        batterId: lastBatterId,
        batterName: lastBatterName,
        batterOrder: lastBatterOrder,
        inningHalf,
        paIndexInGame,
        summary: tail,
      })
    }
  }

  return out
}

function main(): void {
  const { year, batterIds } = parseArgs()
  const target = new Set(batterIds)
  const canonDir = join(projectRoot, "_data", "scraped_games", "canonical")
  const rawTextDir = join(projectRoot, "_data", "scraped_games", "raw_yahoo_text")
  const hits: Hit[] = []

  const files = readdirSync(canonDir).filter((f) => /^\d+\.json$/.test(f))
  for (const f of files) {
    const gameId = f.replace(/\.json$/, "")
    const p = join(canonDir, f)
    const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
    const title = String(doc?.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    // この試合で対象打者のGIDPイベントがあるか（domain.batterEvents）
    const ev = (doc.domain as { batterEvents?: Array<{ kind?: string; yahooBatterId?: string }> })?.batterEvents
    const hasAny =
      Array.isArray(ev) &&
      ev.some((e) => e?.kind === "GIDP" && target.has(String(e?.yahooBatterId ?? "").trim()))
    if (!hasAny) continue

    const dateJa = extractDateJaFromTitle(title)
    const rawPath = join(rawTextDir, `${gameId}.html`)
    if (!existsSync(rawPath)) {
      // raw が無い場合は確定できないのでスキップ（必要なら fetch 追加）
      continue
    }
    const html = readFileSync(rawPath, "utf8")
    hits.push(...scanYahooTextHtmlForGidp({ gameId, html, targetBatterIds: target, dateJa }))
  }

  hits.sort((a, b) => (a.dateJa + a.gameId + a.batterId).localeCompare(b.dateJa + b.gameId + b.batterId))

  console.log(`[diag_gidp_date] year=${year} batters=${batterIds.join(",")} hits=${hits.length}`)
  for (const h of hits) {
    console.log(
      `- batterId=${h.batterId} ${h.batterName ?? ""} date=${h.dateJa} gameId=${h.gameId} pa=${h.paIndexInGame} order=${h.batterOrder ?? ""} inning=${h.inningHalf ?? ""} summary=${h.summary}`.trim(),
    )
  }
}

main()

