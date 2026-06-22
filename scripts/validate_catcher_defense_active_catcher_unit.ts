/**
 * 捕手守備基本: 実際の守備捕手への帰属（phase24）のスモークテスト。
 * npx tsx scripts/validate_catcher_defense_active_catcher_unit.ts --fail
 */

import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { mergePhase10RestoredIntoDocIfPresent } from "@/lib/seasonStatsPilot"
import { aggregateCatcherDefenseBasicByNpbId } from "@/lib/yahooGame/activeCatcherFromCanonical"

const SAKAKURA_NPB = "11915134"
const MOCHIMARU_NPB = "81885151"
const GAME_20210417_DENA = "2021038728"
const GAME_MOCHIMARU_PB = "2021038842"

function fail(msg: string): never {
  console.error(`[validate-catcher-defense-active] FAIL: ${msg}`)
  process.exit(1)
}

function main() {
  const failOnError = process.argv.includes("--fail")
  const root = getProjectRoot()
  const p = path.join(root, "_data", "scraped_games", "canonical", `${GAME_20210417_DENA}.json`)
  if (!fs.existsSync(p)) {
    const msg = `missing ${p}`
    if (failOnError) fail(msg)
    console.warn(`[validate-catcher-defense-active] SKIP: ${msg}`)
    process.exit(0)
  }

  const doc = mergePhase10RestoredIntoDocIfPresent(JSON.parse(fs.readFileSync(p, "utf8")))
  const byNpb = aggregateCatcherDefenseBasicByNpbId(doc)
  const sakakura = byNpb.get(SAKAKURA_NPB)
  const mochimaru = byNpb.get(MOCHIMARU_NPB)

  const errors: string[] = []
  if ((sakakura?.cs ?? 0) !== 0) {
    errors.push(`坂倉 cs expected 0 (substituted before 8回表 CS), got ${sakakura?.cs}`)
  }
  if ((mochimaru?.cs ?? 0) < 1) {
    errors.push(`持丸 cs expected >=1 on ${GAME_20210417_DENA}, got ${mochimaru?.cs ?? 0}`)
  }

  const mochimaruDerived = path.join(
    root,
    "_data",
    "derived",
    "player_catcher_defense_basic",
    "2026",
    `npb_${MOCHIMARU_NPB}.json`,
  )
  if (fs.existsSync(mochimaruDerived)) {
    const j = JSON.parse(fs.readFileSync(mochimaruDerived, "utf8")) as {
      sb?: number
      cs?: number
      csPct?: number | null
    }
    const csPct = j.csPct ?? null
    if (csPct != null && Math.abs(csPct - 12.9) > 0.15) {
      errors.push(
        `持丸 season CS% expected ~12.9% (NPB), got ${csPct.toFixed(1)}% (SB=${j.sb} CS=${j.cs})`,
      )
    }
  }

  const pbPath = path.join(root, "_data", "scraped_games", "canonical", `${GAME_MOCHIMARU_PB}.json`)
  if (fs.existsSync(pbPath)) {
    const pbDoc = mergePhase10RestoredIntoDocIfPresent(JSON.parse(fs.readFileSync(pbPath, "utf8")))
    const pbByNpb = aggregateCatcherDefenseBasicByNpbId(pbDoc)
    const mochimaruPb = pbByNpb.get(MOCHIMARU_NPB)
    if ((mochimaruPb?.pb ?? 0) < 1) {
      errors.push(
        `持丸 pb expected >=1 on ${GAME_MOCHIMARU_PB} (実況パスボール), got ${mochimaruPb?.pb ?? 0}`,
      )
    }
  }

  if (errors.length) {
    if (failOnError) fail(errors.join("; "))
    console.warn("[validate-catcher-defense-active] WARN:", errors.join("; "))
    process.exit(0)
  }

  console.log("[validate-catcher-defense-active] OK")
}

main()
