/**
 * 併殺打（GIDP）の "plateAppearances 由来" と "実況(textPlayByPlay)由来" を突合し、
 * 実況の方が多い（=PA 側で落ちている可能性が高い）打者を一覧化する。
 *
 * 実行:
 *   npx tsx scripts/diag_gidp_text_vs_pa.ts --year 2026
 */

import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import type { CanonicalGameDocument, PlateAppearance } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = String(args[i + 1]).trim()
      i++
    }
  }
  return { year }
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

function normalizeLineForDedup(s: string): string {
  let t = String(s ?? "").trim().replace(/^\d+\s*[：:]\s*/, "")
  t = t.replace(/\s+\d+:\d\d\s+【[\s\S]*$/u, "")
  return normalizeJaNameKey(t)
}

function extractBatterNameKeyFromLine(s: string): string | null {
  const t = String(s ?? "").trim().replace(/^\d+\s*[：:]\s*/, "")
  const m = t.match(/\b\d+番\s+([^\s]+)\s+([^\s]+)/u)
  if (!m) return null
  return normalizeJaNameKey(`${m[1]} ${m[2]}`)
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

function gidpFromTextPlayByPlay(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  const sections = doc.game?.textPlayByPlay ?? []
  if (!Array.isArray(sections) || sections.length === 0) return out

  const nameToId = buildNameKeyToYahooIdMap(doc)
  const seen = new Set<string>()

  for (const sec of sections) {
    for (const line of sec.lines ?? []) {
      const s0 = String(line ?? "").trim()
      if (!s0) continue
      if (!isGidpLikeText(s0)) continue

      const batterKey = extractBatterNameKeyFromLine(s0)
      if (!batterKey) continue
      const yid = nameToId.get(batterKey)
      if (!yid) continue

      const k = `${doc.gameId}\t${yid}\t${normalizeLineForDedup(s0)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.set(yid, (out.get(yid) ?? 0) + 1)
    }
  }

  return out
}

function lastPitchResult(pa: PlateAppearance): string {
  const pe = pa.pitchEvents ?? []
  const last = pe.length > 0 ? pe[pe.length - 1] : null
  return (String(pa.resultSummaryJa ?? "").trim() || String(last?.resultJa ?? "").trim() || "").trim()
}

function gidpFromPlateAppearances(doc: CanonicalGameDocument): Map<string, number> {
  const out = new Map<string, number>()
  for (const pa of doc.domain?.plateAppearances ?? []) {
    const bid = String(pa.yahooBatterId ?? "").trim()
    if (!bid) continue
    const r = lastPitchResult(pa)
    if (!isGidpLikeText(r)) continue
    out.set(bid, (out.get(bid) ?? 0) + 1)
  }
  return out
}

function main(): void {
  const { year } = parseArgs()
  const docs = loadCanonicalGames(projectRoot)

  const deltaByBatter = new Map<string, number>()
  const nameHintByBatter = new Map<string, string>()

  for (const doc of docs) {
    const title = String(doc.game?.meta?.documentTitle ?? "")
    if (year && !title.includes(`${year}年`)) continue

    const byText = gidpFromTextPlayByPlay(doc)
    const byPa = gidpFromPlateAppearances(doc)

    for (const [bid, gidpText] of byText.entries()) {
      const gidpPa = byPa.get(bid) ?? 0
      const delta = gidpText - gidpPa
      if (delta <= 0) continue
      deltaByBatter.set(bid, (deltaByBatter.get(bid) ?? 0) + delta)
      if (!nameHintByBatter.has(bid)) {
        const n = (doc.game?.yahooPlayersMentioned ?? {})[bid]
        if (typeof n === "string" && n.trim()) nameHintByBatter.set(bid, n.trim())
      }
    }
  }

  const rows = [...deltaByBatter.entries()]
    .map(([bid, delta]) => {
      const roster = findRosterPlayerByPublicId(bid)
      const jaHint = nameHintByBatter.get(bid) ?? ""
      return {
        bid,
        delta,
        name: (roster?.name_ja ?? jaHint ?? "").trim(),
        team: (roster?.team ?? "").trim(),
      }
    })
    .sort((a, b) => b.delta - a.delta || a.bid.localeCompare(b.bid))

  console.log(`[diag_gidp_text_vs_pa] year=${year} affectedBatters=${rows.length}`)
  for (const r of rows) {
    console.log(`- yahooId=${r.bid} delta=${r.delta} name=${r.name || "(unknown)"} team=${r.team || ""}`)
  }
}

main()

