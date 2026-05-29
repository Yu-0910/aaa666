/**
 * 一回限り診断: 2026-05-14 3試合。mergePhase10 後の N/M と文言突合・zip・okFalse。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { dedupePlateAppearancesByInningHalfOrder } from "../lib/yahooGame/dedupePlateAppearances"
import {
  buildAppearanceZipResultOverrides,
  diagnoseBattingAppearanceSlotsVsPlateAppearances,
} from "../lib/yahooGame/appearanceStatsTrailingCells"

const GAMES = ["2021038857", "2021038858", "2021038859"]
const ROOT = join(__dirname, "..")

function norm(s: unknown): string {
  return String(s ?? "").trim()
}

function nonemptySlots(slots: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(slots)) return []
  return slots.map((s) => norm(s)).filter((s) => s !== "")
}

for (const gameId of GAMES) {
  const p = join(ROOT, "_data/scraped_games/canonical", `${gameId}.json`)
  const raw = readFileSync(p, "utf-8")
  let doc = JSON.parse(raw) as CanonicalGameDocument
  doc = mergePhase10RestoredIntoDocIfPresent(doc)
  const gid = norm(doc.gameId) || gameId

  const zip = buildAppearanceZipResultOverrides(doc)
  const diag = diagnoseBattingAppearanceSlotsVsPlateAppearances(doc)
  const okFalseRows = diag.filter((r) => !r.ok)

  const allPas = dedupePlateAppearancesByInningHalfOrder(doc.domain?.plateAppearances ?? [], gid)

  console.log(`\n========== ${gid}（mergePhase10 後・正） ==========`)
  console.log(`zip 件数（paId 上書き）: ${zip.size}`)
  console.log(`N≠M（ok=false）打者数: ${okFalseRows.length}`)

  const nmMismatch: string[] = []
  const textMismatch: string[] = []

  for (const line of doc.domain?.battingLines ?? []) {
    const bid = norm(line.yahooPlayerId)
    if (!bid) continue
    const slots = nonemptySlots(line.appearancePaSlotsJa)
    const n = slots.length
    const myPas = allPas.filter((pa) => norm(pa.yahooBatterId) === bid)
    const m = myPas.length
    if (n === 0 && m === 0) continue

    if (n !== m) {
      const logs = myPas.map((pa) => norm(pa.resultSummaryJa))
      nmMismatch.push(
        [
          `【N≠M】${norm(line.playerName)} (${bid})  N=${n}  M=${m}`,
          `  出場（順）: ${slots.join(" | ") || "(空)"}`,
          `  ログ（順）: ${logs.join(" | ") || "(空)"}`,
        ].join("\n"),
      )
      continue
    }

    for (let i = 0; i < n; i++) {
      const ap = slots[i]
      const lg = norm(myPas[i]?.resultSummaryJa)
      if (ap !== lg) {
        textMismatch.push(
          `【文言】${norm(line.playerName)} (${bid})  打席${i + 1}: 出場「${ap}」≠ ログ「${lg}」`,
        )
      }
    }
  }

  if (nmMismatch.length === 0) console.log("N≠M の打者: なし")
  else {
    console.log("--- N≠M（全件）---")
    for (const s of nmMismatch) console.log(s)
  }

  if (textMismatch.length === 0) console.log("N===M で文言不一致の打席: なし")
  else {
    console.log("--- N===M かつ文言不一致（全打席・順序は dedupe 後 plateAppearances）---")
    for (const s of textMismatch) console.log(s)
  }
}

console.log("\n=== merge 報告終了 ===\n")
