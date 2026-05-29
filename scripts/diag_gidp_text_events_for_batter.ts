/**
 * 指定打者について、実況(textPlayByPlay)で「併殺」扱いになった行を一覧化して検証する。
 *
 * 実行:
 *   npx tsx scripts/diag_gidp_text_events_for_batter.ts --year 2026 --batter-id 1600007
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string; batterId: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  let batterId = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    } else if ((args[i] === "--batter-id" || args[i] === "--bid") && args[i + 1]) {
      batterId = String(args[i + 1]).trim()
      i++
    }
  }
  if (!batterId) {
    console.error("[diag_gidp_text] missing --batter-id")
    process.exit(1)
  }
  return { year, batterId }
}

function isGidpLikeText(result: string): boolean {
  const s = String(result ?? "").trim()
  if (!s) return false
  if (/併殺崩れ/.test(s)) return false
  if (/盗塁/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  if (/(けん制|牽制)/.test(s) && /(ダブルプレー|ゲッツー)/.test(s)) return false
  return /併殺|併打|併殺打|ダブルプレー|ゲッツー/.test(s)
}

function normalizeJaNameKey(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.．]/g, "")
}

function buildNameKeyToYahooIdMap(doc: CanonicalGameDocument): Map<string, string> {
  const m = new Map<string, string>()
  const surnameOwner = new Map<string, string | "__conflict__">()
  const ym = doc.game?.yahooPlayersMentioned ?? {}
  for (const [id, name] of Object.entries(ym)) {
    const key = normalizeJaNameKey(name)
    const yid = String(id ?? "").trim()
    if (!key || !yid) continue
    if (!m.has(key)) m.set(key, yid)

    const raw = String(name ?? "").trim().normalize("NFKC")
    const tokens = raw.split(/\s+/).filter(Boolean)
    if (tokens.length >= 1) {
      const surnameKey = normalizeJaNameKey(tokens[0]!)
      if (surnameKey) {
        const cur = surnameOwner.get(surnameKey)
        if (!cur) surnameOwner.set(surnameKey, yid)
        else if (cur !== yid) surnameOwner.set(surnameKey, "__conflict__")
      }
    }
  }
  for (const [k, owner] of surnameOwner.entries()) {
    if (owner && owner !== "__conflict__" && !m.has(k)) m.set(k, owner)
  }
  return m
}

function main(): void {
  const { year, batterId } = parseArgs()
  const docs = loadCanonicalGames(projectRoot)
  const hits: Array<{ gameId: string; line: string; matchedKey?: string }> = []

  for (const doc of docs) {
    const title = String(doc.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    const nameToId = buildNameKeyToYahooIdMap(doc)
    const sections = doc.game?.textPlayByPlay ?? []
    if (!Array.isArray(sections) || sections.length === 0) continue

    function extractBatterNameKeyFromLine(s: string): string | null {
      const t = String(s ?? "").trim().replace(/^\d+\s*[：:]\s*/, "")
      const m = t.match(/\b\d+番\s+([^\s]+)\s+([^\s]+)/u)
      if (!m) return null
      return normalizeJaNameKey(`${m[1]} ${m[2]}`)
    }

    for (const sec of sections) {
      for (const line of sec.lines ?? []) {
        const s0 = String(line ?? "").trim()
        if (!s0) continue
        if (!isGidpLikeText(s0)) continue
        const batterKey = extractBatterNameKeyFromLine(s0)
        if (!batterKey) continue
        const yid = nameToId.get(batterKey)
        if (yid !== batterId) continue
        hits.push({ gameId: doc.gameId, line: s0, matchedKey: batterKey })
      }
    }
  }

  console.log(`[diag_gidp_text] year=${year} batterId=${batterId} hits=${hits.length}`)
  for (const h of hits) {
    console.log(`- gameId=${h.gameId} key=${h.matchedKey ?? ""} line=${h.line}`)
  }
}

main()

