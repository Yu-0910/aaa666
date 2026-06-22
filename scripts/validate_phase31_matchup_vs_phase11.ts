/**
 * Phase 31 / 計画書 Phase 4: 対戦成績（Phase 30）と Phase 11 通算の整合検証。
 *
 * 1. 野手: 全相手の打数合計 ≤ Phase 11 通算打数（同一 PA 集合の部分和）
 * 2. 双方向: 打者 A×投手 B の打数 = 投手 B×打者 A の打数
 *
 *   npx tsx scripts/validate_phase31_matchup_vs_phase11.ts --year 2026
 *   npm run validate:phase31-matchup-vs-phase11:fail
 */

import fs from "node:fs"
import path from "node:path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadPlayerMatchupFromRepo } from "@/lib/playerMatchupLoad"
import type { PlayerMatchupDerived } from "@/lib/playerMatchupTypes"
import { resolveYahooPilotIdForStats } from "@/lib/yahooNpbBatterIdMap"

type Phase11Row = { split_type?: string; ab?: number | string }

function parseArgs(): { year: string; fail: boolean; npb: string | null; limit: number } {
  const args = process.argv.slice(2)
  let year = "2026"
  let fail = false
  let npb: string | null = null
  let limit = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    } else if (args[i] === "--fail") {
      fail = true
    } else if (args[i] === "--npb" && args[i + 1]) {
      npb = args[i + 1]!.trim()
      i++
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.max(1, parseInt(args[i + 1]!, 10) || 0)
      i++
    }
  }
  return { year, fail, npb, limit }
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0
  const n = Number(String(v).trim())
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function sumOpponentAb(payload: PlayerMatchupDerived): number {
  let s = 0
  for (const team of payload.teams) {
    for (const row of team.opponents) {
      s += row.ab
    }
  }
  return s
}

function loadPhase11TotalAb(root: string, year: string, yahooId: string): number | null {
  const p = path.join(root, "_data", "derived", "player_season_batting", year, `yahoo_${yahooId}.json`)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { rows?: Phase11Row[] }
    const total = (j.rows ?? []).find((r) => String(r.split_type ?? "") === "total")
    return total ? num(total.ab) : null
  } catch {
    return null
  }
}

function listNpbJsonFiles(dir: string, onlyNpb: string | null): string[] {
  if (!fs.existsSync(dir)) return []
  let files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("npb_") && f.endsWith(".json"))
    .sort()
  if (onlyNpb) {
    files = files.filter((f) => f === `npb_${onlyNpb.replace(/[^\d]/g, "")}.json`)
  }
  return files
}

function npbFromFilename(filename: string): string {
  return filename.replace(/^npb_/, "").replace(/\.json$/, "")
}

function main(): void {
  const { year, fail, npb, limit } = parseArgs()
  const root = getProjectRoot()
  const battingDir = path.join(root, "_data", "derived", "player_matchup_batting", year)
  const pitchingDir = path.join(root, "_data", "derived", "player_matchup_pitching", year)

  if (!fs.existsSync(battingDir) || !fs.existsSync(pitchingDir)) {
    console.error(
      "[validate_phase31_matchup_vs_phase11] 派生なし。先に npm run phase30:build:player-matchup を実行してください。",
    )
    process.exit(fail ? 1 : 2)
  }

  let battingFiles = listNpbJsonFiles(battingDir, npb)
  if (limit > 0) battingFiles = battingFiles.slice(0, limit)

  let abOverTotal = 0
  let bidirectionalMismatch = 0
  let skippedNoPhase11 = 0
  let checkedBatters = 0
  let pairsChecked = 0

  const abOverSamples: string[] = []
  const pairMismatchSamples: string[] = []

  for (const f of battingFiles) {
    const batterNpb = npbFromFilename(f)
    const batting = loadPlayerMatchupFromRepo(year, batterNpb, "batter")
    if (!batting) continue

    const sumAb = sumOpponentAb(batting)
    const yahooId = resolveYahooPilotIdForStats(batterNpb)
    if (yahooId) {
      const totalAb = loadPhase11TotalAb(root, year, yahooId)
      if (totalAb == null) {
        skippedNoPhase11 += 1
      } else {
        checkedBatters += 1
        if (sumAb > totalAb) {
          abOverTotal += 1
          if (abOverSamples.length < 12) {
            abOverSamples.push(`${batterNpb}: matchupAb=${sumAb} > phase11Ab=${totalAb}`)
          }
        }
      }
    } else {
      skippedNoPhase11 += 1
    }

    for (const team of batting.teams) {
      for (const opp of team.opponents) {
        const pitcherNpb = String(opp.opponentNpbId ?? "").trim()
        if (!pitcherNpb) continue
        pairsChecked += 1

        const pitching = loadPlayerMatchupFromRepo(year, pitcherNpb, "pitcher")
        if (!pitching) {
          bidirectionalMismatch += 1
          if (pairMismatchSamples.length < 12) {
            pairMismatchSamples.push(`${batterNpb}×${pitcherNpb}: pitching file missing`)
          }
          continue
        }

        let reverseAb: number | null = null
        for (const pt of pitching.teams) {
          const row = pt.opponents.find((o) => String(o.opponentNpbId).trim() === batterNpb)
          if (row) {
            reverseAb = row.ab
            break
          }
        }

        if (reverseAb == null || reverseAb !== opp.ab) {
          bidirectionalMismatch += 1
          if (pairMismatchSamples.length < 12) {
            pairMismatchSamples.push(
              `${batterNpb}×${pitcherNpb}: batterSide=${opp.ab} pitcherSide=${reverseAb ?? "—"}`,
            )
          }
        }
      }
    }
  }

  const ok = abOverTotal === 0 && bidirectionalMismatch === 0

  if (abOverSamples.length > 0) {
    console.error("[validate_phase31_matchup_vs_phase11] AB > Phase11 total:")
    for (const s of abOverSamples) console.error("  ", s)
  }
  if (pairMismatchSamples.length > 0) {
    console.error("[validate_phase31_matchup_vs_phase11] bidirectional mismatch:")
    for (const s of pairMismatchSamples) console.error("  ", s)
  }

  if (ok) {
    console.log(
      `[validate_phase31_matchup_vs_phase11] OK year=${year} batters=${battingFiles.length} ` +
        `phase11Checked=${checkedBatters} skippedNoPhase11=${skippedNoPhase11} pairs=${pairsChecked}`,
    )
    return
  }

  console.error(
    `[validate_phase31_matchup_vs_phase11] FAIL year=${year} abOverTotal=${abOverTotal} ` +
      `bidirectionalMismatch=${bidirectionalMismatch} pairs=${pairsChecked}`,
  )
  if (fail) process.exit(1)
}

main()
