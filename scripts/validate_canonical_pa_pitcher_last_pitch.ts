/**
 * canonical: 一球ログに投手 ID があるのに `pa.yahooPitcherId` が空の打席を検出する（手直し・マージ欠けの目安）。
 *
 * 注意: `pa.yahooPitcherId` は Phase10 では先頭球の投手を載せる運用に戻している。
 * 対左右は `yahooPitcherIdForVsHandFromPa` が `pitchEvents` の末尾から拾う。
 *
 * 実行:
 *   npx tsx scripts/validate_canonical_pa_pitcher_last_pitch.ts --year 2026
 *   npx tsx scripts/validate_canonical_pa_pitcher_last_pitch.ts --year 2026 --fail
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, "..")

type Pa = {
  paId?: string
  yahooPitcherId?: string
  pitchEvents?: Array<{ yahooPitcherId?: string }>
}

type CanonicalDoc = {
  gameId: string
  game?: { missingOrPartial?: string[]; meta?: { documentTitle?: string } }
  domain?: { plateAppearances?: Pa[] }
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let year = "2026"
  let fail = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = String(args[++i]).trim()
    else if (args[i] === "--fail") fail = true
  }
  return { year, fail }
}

function isCancelled(doc: CanonicalDoc): boolean {
  const miss = doc.game?.missingOrPartial ?? []
  return miss.some((s) => String(s).includes("game cancelled"))
}

function readJson(p: string): CanonicalDoc | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CanonicalDoc
  } catch {
    return null
  }
}

function lastRawPitcherId(pe: Array<{ yahooPitcherId?: string }>): string {
  for (let i = pe.length - 1; i >= 0; i--) {
    const id = String(pe[i]?.yahooPitcherId ?? "").trim()
    if (id) return id
  }
  return ""
}

function main() {
  const { year, fail } = parseArgs(process.argv)
  const dir = path.join(projectRoot, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) {
    console.error("[validate_canonical_pa_pitcher_last_pitch] missing dir:", dir)
    process.exit(1)
  }

  type Violation = { gameId: string; paId: string; lastPid: string }
  const violations: Violation[] = []
  let checkedPas = 0

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))

  for (const f of files) {
    const gameId = f.replace(/\.json$/, "")
    const p = path.join(dir, f)
    const doc = readJson(p)
    if (!doc) continue

    const title = doc.game?.meta?.documentTitle ?? ""
    if (year && !title.includes(`${year}年`)) continue
    if (isCancelled(doc)) continue

    const pas = doc.domain?.plateAppearances ?? []
    for (const pa of pas) {
      const pe = pa.pitchEvents
      if (!Array.isArray(pe) || pe.length === 0) continue
      checkedPas++
      const paLevel = String(pa.yahooPitcherId ?? "").trim()
      const lastPid = lastRawPitcherId(pe)
      if (lastPid && !paLevel) {
        violations.push({ gameId, paId: String(pa.paId ?? ""), lastPid })
      }
    }
  }

  console.log(
    `[validate_canonical_pa_pitcher_last_pitch] year=${year} checkedPA(withEvents)=${checkedPas} missingPaPitcherId=${violations.length}`,
  )

  const maxShow = 25
  for (let i = 0; i < Math.min(violations.length, maxShow); i++) {
    const v = violations[i]!
    console.log(
      `  MISSING ${v.gameId} pa=${v.paId} (events have pitcher=${v.lastPid} but pa.yahooPitcherId empty)`,
    )
  }
  if (violations.length > maxShow) {
    console.log(`  … and ${violations.length - maxShow} more`)
  }

  if (violations.length > 0 && fail) {
    console.error(
      "[validate_canonical_pa_pitcher_last_pitch] FAIL: 一球ログに投手 ID があるのに pa.yahooPitcherId が空の打席があります。",
    )
    process.exit(2)
  }
}

main()
