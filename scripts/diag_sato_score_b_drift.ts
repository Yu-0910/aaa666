/**
 * 佐藤: 【B】score入口 vs テキスト実況の塁不一致を分析
 * npx tsx scripts/diag_sato_score_b_drift.ts
 */
import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  basesBeforeFromSportsnaviPlayLine,
  extractSportsnaviSituationTokenFromPlayLine,
} from "../lib/yahooGame/basesFromSportsnaviPlayLine"
import {
  basesFromScoreHtmlBaseClass,
  firstSnapshotHtmlForPaPrefix,
  lastSnapshotHtmlForPaPrefix,
  scoreIndexPrefixForPaId,
} from "../lib/yahooGame/basesFromSportsnaviScoreSnapshot"
import { classifySituationAtPaStart } from "../lib/yahooGame/paSituationSim"
import { parsePaId } from "../lib/yahooGame/paIdFormat"
import { buildPaIdToSportsnaviPlayLineMap } from "../lib/yahooGame/supplementPlateAppearancesFromTextPlayByPlay"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const YAHOO = "2000051"
const SCORE_ROOT = join(root, "_data", "scraped_games", "raw_sportsnavi_score")

const SIT_LABEL: Record<string, string> = {
  none: "無し",
  r1: "1塁",
  r2: "2塁",
  r3: "3塁",
  r12: "1-2塁",
  r13: "1-3塁",
  r23: "2-3塁",
  loaded: "満塁",
}

function loadSatoDocs(): CanonicalGameDocument[] {
  const dir = join(root, "_data", "scraped_games", "canonical")
  const out: CanonicalGameDocument[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue
    const p = join(dir, f)
    const raw = readFileSync(p, "utf8")
    if (!raw.includes(`"yahooBatterId": "${YAHOO}"`)) continue
    out.push(JSON.parse(raw) as CanonicalGameDocument)
  }
  return out
}

function loadSnapshotsForPrefixes(
  gameId: string,
  prefixes: Set<string>,
): Array<{ scoreIndex: string; html: string }> {
  const dir = join(SCORE_ROOT, gameId)
  if (!existsSync(dir)) return []
  const byPrefix = new Map<string, { first: string; last: string }>()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".html")) continue
    const idx = name.slice(0, -5)
    if (idx.length !== 7 || !/^\d+$/.test(idx)) continue
    const prefix = idx.slice(0, 5)
    if (!prefixes.has(prefix)) continue
    const cur = byPrefix.get(prefix) ?? { first: idx, last: idx }
    if (idx < cur.first) cur.first = idx
    if (idx > cur.last) cur.last = idx
    byPrefix.set(prefix, cur)
  }
  const out: Array<{ scoreIndex: string; html: string }> = []
  for (const [, v] of byPrefix) {
    for (const idx of new Set([v.first, v.last])) {
      out.push({
        scoreIndex: idx,
        html: readFileSync(join(dir, `${idx}.html`), "utf8"),
      })
    }
  }
  return out
}

function baseClassFromHtml(html: string): string | null {
  const m = html.match(/id="base"\s+class="b(\d)(\d)(\d)"/)
  return m ? `b${m[1]}${m[2]}${m[3]}` : null
}

function main(): void {
  const docs = loadSatoDocs()
  let total = 0
  let agree = 0
  const drift = new Map<string, number>()
  const samples: Array<{
    paId: string
    gameId: string
    textToken: string | null
    textSit: string
    scoreSit: string
    firstClass: string | null
    lastClass: string | null
    firstSpan: string
    result: string
  }> = []

  for (const doc of docs) {
    const satoPas = (doc.domain.plateAppearances ?? []).filter(
      (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
    )
    if (satoPas.length === 0) continue

    const playLines = buildPaIdToSportsnaviPlayLineMap(doc)
    const prefixes = new Set<string>()
    for (const pa of satoPas) {
      const p = scoreIndexPrefixForPaId(pa.paId)
      if (p) prefixes.add(p)
    }
    const snapshots = loadSnapshotsForPrefixes(doc.gameId, prefixes)

    for (const pa of satoPas) {
      const playLine = playLines.get(pa.paId)
      const textBases = basesBeforeFromSportsnaviPlayLine(playLine)
      if (!textBases) continue

      const prefix = scoreIndexPrefixForPaId(pa.paId)
      if (!prefix) continue
      const firstHtml = firstSnapshotHtmlForPaPrefix(prefix, snapshots)
      const lastHtml = lastSnapshotHtmlForPaPrefix(prefix, snapshots)
      if (!firstHtml) continue

      const scoreBases = basesFromScoreHtmlBaseClass(firstHtml)
      if (!scoreBases) continue

      total++
      const textSit = classifySituationAtPaStart(textBases).detail
      const scoreSit = classifySituationAtPaStart(scoreBases).detail

      const firstSpan =
        firstHtml.match(/<div id="result">\s*<span>([^<]*)<\/span>/i)?.[1]?.trim() ?? ""

      if (textSit === scoreSit) {
        agree++
      } else {
        const key = `${textSit}=>${scoreSit}`
        drift.set(key, (drift.get(key) ?? 0) + 1)
        if (samples.length < 20) {
          samples.push({
            paId: pa.paId,
            gameId: doc.gameId,
            textToken: extractSportsnaviSituationTokenFromPlayLine(playLine ?? "") ?? null,
            textSit,
            scoreSit,
            firstClass: baseClassFromHtml(firstHtml),
            lastClass: lastHtml ? baseClassFromHtml(lastHtml) : null,
            firstSpan: firstSpan.slice(0, 50),
            result: (pa.resultSummaryJa ?? "").trim(),
          })
        }
      }
    }
  }

  console.log(`佐藤 PA（実況+score両方解析可）: ${total}`)
  console.log(`一致: ${agree} | 不一致: ${total - agree}\n`)
  console.log("ずれパターン（実況→score入口）:")
  for (const [k, c] of [...drift.entries()].sort((a, b) => b[1] - a[1])) {
    const parts = k.split("=>")
    const t = parts[0] ?? ""
    const s = parts[1] ?? ""
    console.log(`  ${SIT_LABEL[t] ?? t} → ${SIT_LABEL[s] ?? s}: ${c}`)
  }

  console.log("\n不一致サンプル:")
  for (const s of samples) {
    console.log(
      `  ${s.paId} | 実況=${s.textToken}(${s.textSit}) score=${s.firstClass}(${s.scoreSit}) ` +
        `first結果=${s.firstSpan} 打席結果=${s.result} last=${s.lastClass}`,
    )
  }

  // first vs last on mismatches only
  let firstEqLast = 0
  let firstNeLast = 0
  for (const doc of docs) {
    const satoPas = (doc.domain.plateAppearances ?? []).filter(
      (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
    )
    if (!satoPas.length) continue
    const prefixes = new Set<string>()
    for (const pa of satoPas) {
      const p = scoreIndexPrefixForPaId(pa.paId)
      if (p) prefixes.add(p)
    }
    const snapshots = loadSnapshotsForPrefixes(doc.gameId, prefixes)
    for (const pa of satoPas) {
      const prefix = scoreIndexPrefixForPaId(pa.paId)
      if (!prefix) continue
      const f = firstSnapshotHtmlForPaPrefix(prefix, snapshots)
      const l = lastSnapshotHtmlForPaPrefix(prefix, snapshots)
      if (!f || !l) continue
      const fc = baseClassFromHtml(f)
      const lc = baseClassFromHtml(l)
      if (fc === lc) firstEqLast++
      else firstNeLast++
    }
  }
  console.log(`\n同一打席: 入口class=終了class ${firstEqLast} / 違う ${firstNeLast}`)

  if (firstNeLast > 0) {
    console.log("\n入口≠終了の打席（佐藤・最大10件）:")
    let shown = 0
    for (const doc of docs) {
      const satoPas = (doc.domain.plateAppearances ?? []).filter(
        (pa) => (pa.yahooBatterId ?? "").trim() === YAHOO,
      )
      const prefixes = new Set<string>()
      for (const pa of satoPas) {
        const p = scoreIndexPrefixForPaId(pa.paId)
        if (p) prefixes.add(p)
      }
      const snapshots = loadSnapshotsForPrefixes(doc.gameId, prefixes)
      const playLines = buildPaIdToSportsnaviPlayLineMap(doc)
      for (const pa of satoPas) {
        const prefix = scoreIndexPrefixForPaId(pa.paId)
        if (!prefix) continue
        const f = firstSnapshotHtmlForPaPrefix(prefix, snapshots)
        const l = lastSnapshotHtmlForPaPrefix(prefix, snapshots)
        if (!f || !l) continue
        const fc = baseClassFromHtml(f)
        const lc = baseClassFromHtml(l)
        if (fc === lc) continue
        const playLine = playLines.get(pa.paId)
        const token = extractSportsnaviSituationTokenFromPlayLine(playLine ?? "")
        console.log(
          `  ${pa.paId} 実況=${token} 入口=${fc} 終了=${lc} 結果=${(pa.resultSummaryJa ?? "").slice(0, 20)}`,
        )
        shown++
        if (shown >= 10) return
      }
    }
  }
}

main()
