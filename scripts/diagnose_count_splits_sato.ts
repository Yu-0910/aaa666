/**
 * 佐藤輝明 (yahoo_2000051) のカウント別 PA 分布と参照値との差分を出す。
 * 使い方: npx tsx scripts/diagnose_count_splits_sato.ts
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  countBeforeLastPitch,
  pitchCountKeyForPlateAppearance,
  isValidPitchCountKey,
} from "../lib/yahooGame/pitchCountSim"
import { plateAppearanceLastResultText } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import { sortPitchEventsByPitchIndex } from "../lib/yahooGame/sortPitchEventsByPitchIndex"
import { updateBattingAggFromPa, emptyBattingSeasonAggYahoo } from "../lib/yahooGame/canonicalBattingSeasonAgg"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const root = join(__dirname, "..")
const Y = "2000051"

const REF: Record<string, { pa: number; ab: number; h: number; bb: number; so: number }> = {
  "0-0": { pa: 35, ab: 33, h: 16, bb: 0, so: 0 },
  "1-0": { pa: 11, ab: 11, h: 5, bb: 0, so: 0 },
  "2-0": { pa: 5, ab: 4, h: 1, bb: 1, so: 0 },
  "3-0": { pa: 5, ab: 1, h: 1, bb: 4, so: 0 },
  "0-1": { pa: 17, ab: 17, h: 7, bb: 0, so: 0 },
  "1-1": { pa: 22, ab: 22, h: 10, bb: 0, so: 0 },
  "2-1": { pa: 13, ab: 13, h: 9, bb: 0, so: 0 },
  "3-1": { pa: 15, ab: 4, h: 3, bb: 11, so: 0 },
  "0-2": { pa: 12, ab: 12, h: 0, bb: 0, so: 9 },
  "1-2": { pa: 24, ab: 24, h: 6, bb: 0, so: 16 },
  "2-2": { pa: 40, ab: 40, h: 11, bb: 0, so: 19 },
  "3-2": { pa: 26, ab: 15, h: 4, bb: 11, so: 10 },
}

function loadSatoGames(): CanonicalGameDocument[] {
  const countPath = join(root, "_data", "derived", "player_season_batting_count", "2026", `yahoo_${Y}.json`)
  const meta = JSON.parse(readFileSync(countPath, "utf8")) as { source?: { canonicalGames?: string[] } }
  const ids = new Set(meta.source?.canonicalGames ?? [])
  const canonDir = join(root, "_data", "scraped_games", "canonical")
  const out: CanonicalGameDocument[] = []
  for (const gid of ids) {
    const p = join(canonDir, `${gid}.json`)
    if (!existsSync(p)) continue
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1") out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function aggByCount(fn: (pe: Parameters<typeof countBeforeLastPitch>[0]) => string | null) {
  const byCk = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  let noPe = 0
  let noCk = 0
  for (const doc of loadSatoGames()) {
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== Y) continue
      const pe = pa.pitchEvents ?? []
      if (pe.length === 0) {
        noPe++
        continue
      }
      const ck = fn(pe)
      if (!ck || !isValidPitchCountKey(ck)) {
        noCk++
        continue
      }
      const agg = byCk.get(ck) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromPa(agg, doc.gameId, pa)
      byCk.set(ck, agg)
    }
  }
  return { byCk, noPe, noCk }
}

function printDiff(label: string, byCk: Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>) {
  console.log(`\n=== ${label} ===`)
  for (const ck of Object.keys(REF)) {
    const ref = REF[ck]
    const got = byCk.get(ck)
    const pa = got?.pa ?? 0
    const ab = got?.ab ?? 0
    const h = got?.h ?? 0
    const bb = got?.bb ?? 0
    const dPa = pa - ref.pa
    const mark = dPa === 0 && ab === ref.ab && h === ref.h && bb === ref.bb ? "OK" : "DIFF"
    if (mark === "DIFF") {
      console.log(
        `${ck}: PA ${pa}(${dPa >= 0 ? "+" : ""}${dPa}) AB ${ab} H ${h} BB ${bb} | ref PA${ref.pa} AB${ref.ab} H${ref.h} BB${ref.bb}`,
      )
    }
  }
}

function listMismatches(
  fn: (pe: Parameters<typeof countBeforeLastPitch>[0]) => string | null,
  label: string,
) {
  const diffs: { gameId: string; paId: string; oldCk: string; newCk: string; summary: string; pitches: string[] }[] =
    []
  for (const doc of loadSatoGames()) {
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== Y) continue
      const pe = pa.pitchEvents ?? []
      if (pe.length === 0) continue
      const oldCk = countBeforeLastPitch(pe)
      const newCk = fn(pe)
      if (oldCk === newCk) continue
      const sorted = sortPitchEventsByPitchIndex(pe)
      diffs.push({
        gameId: doc.gameId,
        paId: pa.paId,
        oldCk: oldCk ?? "?",
        newCk: newCk ?? "?",
        summary: (pa.resultSummaryJa ?? "").slice(0, 40),
        pitches: sorted.map((e) => (e.resultJa ?? "").trim()).slice(-6),
      })
    }
  }
  console.log(`\n${label}: ${diffs.length} PA where count key changes`)
  for (const d of diffs.slice(0, 25)) {
    console.log(`${d.gameId} ${d.paId} ${d.oldCk} -> ${d.newCk} | ${d.summary}`)
    console.log(`  pitches: ${d.pitches.join(" | ")}`)
  }
}

const games = loadSatoGames()
console.log("games loaded", games.length)

const a = aggByCount(countBeforeLastPitch)
console.log("no pitch events", a.noPe, "no valid count", a.noCk)
printDiff("countBeforeLastPitch", a.byCk)

const b = aggByCount((pe) => {
  // dummy - replaced below
  return countBeforeLastPitch(pe)
})
void b

function aggByPaKey() {
  const byCk = new Map<string, ReturnType<typeof emptyBattingSeasonAggYahoo>>()
  let noPe = 0
  let noCk = 0
  for (const doc of loadSatoGames()) {
    for (const pa of doc.domain.plateAppearances ?? []) {
      if ((pa.yahooBatterId ?? "").trim() !== Y) continue
      const pe = pa.pitchEvents ?? []
      if (pe.length === 0) {
        noPe++
        continue
      }
      const ck = pitchCountKeyForPlateAppearance(pe, plateAppearanceLastResultText(pa))
      if (!ck || !isValidPitchCountKey(ck)) {
        noCk++
        continue
      }
      const agg = byCk.get(ck) ?? emptyBattingSeasonAggYahoo()
      updateBattingAggFromPa(agg, doc.gameId, pa)
      byCk.set(ck, agg)
    }
  }
  return { byCk, noPe, noCk }
}

const c = aggByPaKey()
printDiff("pitchCountKeyForPlateAppearance (walk adjust)", c.byCk)

// 四球・敬遠・故意四の打席でカウントが 3-0 / 3-1 / 3-2 以外のもの
console.log("\n=== walks by assigned count ===")
const walkByCk = new Map<string, number>()
for (const doc of loadSatoGames()) {
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== Y) continue
    const pe = pa.pitchEvents ?? []
    if (pe.length === 0) continue
    const text = (pa.resultSummaryJa ?? "").trim()
    if (!/四球|敬遠|故意四|フォアボール|ボールフォー/.test(text)) continue
    const ck = pitchCountKeyForPlateAppearance(pe, plateAppearanceLastResultText(pa)) ?? "?"
    walkByCk.set(ck, (walkByCk.get(ck) ?? 0) + 1)
  }
}
console.log(Object.fromEntries([...walkByCk.entries()].sort()))

console.log("\n=== 3-0 PAs (adjusted) ===")
for (const doc of loadSatoGames()) {
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== Y) continue
    const pe = pa.pitchEvents ?? []
    if (pe.length === 0) continue
    const ck = pitchCountKeyForPlateAppearance(pe, plateAppearanceLastResultText(pa))
    if (ck !== "3-0") continue
    const sorted = sortPitchEventsByPitchIndex(pe)
    console.log(`${doc.gameId} ${pa.paId} | ${(pa.resultSummaryJa ?? "").slice(0, 30)}`)
    console.log(`  ${sorted.map((e) => (e.resultJa ?? "").trim()).join(" | ")}`)
  }
}

console.log("\n=== walks NOT at 3-0/3-1/3-2 (detail) ===")
for (const doc of loadSatoGames()) {
  for (const pa of doc.domain.plateAppearances ?? []) {
    if ((pa.yahooBatterId ?? "").trim() !== Y) continue
    const pe = pa.pitchEvents ?? []
    if (pe.length === 0) continue
    const text = (pa.resultSummaryJa ?? "").trim()
    if (!/四球|敬遠|故意四|フォアボール|ボールフォー/.test(text)) continue
    const ck = pitchCountKeyForPlateAppearance(pe, plateAppearanceLastResultText(pa)) ?? "?"
    if (ck === "3-0" || ck === "3-1" || ck === "3-2") continue
    const sorted = sortPitchEventsByPitchIndex(pe)
    console.log(`${doc.gameId} ${pa.paId} ck=${ck} | ${text}`)
    console.log(`  ${sorted.map((e) => (e.resultJa ?? "").trim()).join(" | ")}`)
  }
}
