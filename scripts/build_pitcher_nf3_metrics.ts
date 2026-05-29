/**
 * canonical 試合から nf3 の「援護点」「NHB」算出に必要な中間データを抽出する。
 *
 * 入力:
 *   - _data/scraped_games/canonical/*.json
 *   - _data/npb_roster_2026.csv（Yahoo ID → npb_player_id）
 *
 * 出力:
 *   - _data/derived/pitcher_nf3_metrics/{year}/per_game.json   … 試合別の行データ
 *   - _data/derived/pitcher_nf3_metrics/{year}/aggregate_by_npb.json … NPB 別シーズン合算
 *
 * 定義メモ（docs/pitching_personal_page_metrics_impl_plan.md）:
 *   - NHB: 救援登板のうち安打・与四死球（死球含む）をいずれも許さなかった回数
 *   - 援護点: 先発がマウンドにいた区間の味方得点（本スクリプトは打席順から「最後のマウンド打席」までで近似）
 *
 * 使い方:
 *   npx tsx scripts/build_pitcher_nf3_metrics.ts --year 2026
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  extractNf3PitchingLineRows,
  extractRunSupportForStarters,
} from "../lib/yahooGame/nf3PitcherMetricsFromCanonical"
import { loadCanonicalGames } from "../lib/yahooGame/loadCanonicalGames"
import { nf3IprFromReliefIpRuns } from "../lib/nf3LeaguePitchingFallback"
import { parseRosterCsv } from "../lib/yahooGame/rosterCsv"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function parseArgs(): { year: string } {
  const args = process.argv.slice(2)
  let year = "2026"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = args[i + 1]!
      i++
    }
  }
  return { year }
}

type Agg = {
  reliefAppearances: number
  nhbCount: number
  /** 救援行のみの ipOuts 合算（IPR 分子） */
  reliefIpOutsSum: number
  /** 救援行のみの失点合算（IPR 分母） */
  reliefRunsSum: number
  starterGames: number
  runSupportPointsSum: number
  /** 先発行の ipOuts 合算（援護率の分母に使用） */
  starterIpOutsSum: number
}

function main(): void {
  const { year } = parseArgs()
  const rosterPath = join(projectRoot, "_data", "npb_roster_2026.csv")
  if (!existsSync(rosterPath)) {
    console.error("[build_pitcher_nf3_metrics] missing roster:", rosterPath)
    process.exit(1)
  }
  const roster = parseRosterCsv(readFileSync(rosterPath, "utf8"))
  const docs = loadCanonicalGames(projectRoot)
  if (docs.length === 0) {
    console.error("[build_pitcher_nf3_metrics] no canonical games under _data/scraped_games/canonical/")
    process.exit(1)
  }

  const outDir = join(projectRoot, "_data", "derived", "pitcher_nf3_metrics", year)
  mkdirSync(outDir, { recursive: true })

  const perGame: Array<{
    gameId: string
    pitchingLines: ReturnType<typeof extractNf3PitchingLineRows>
    starterRunSupport: ReturnType<typeof extractRunSupportForStarters>
  }> = []

  const byNpb = new Map<string, Agg>()

  function bump(npb: string, fn: (a: Agg) => void): void {
    let a = byNpb.get(npb)
    if (!a) {
      a = {
        reliefAppearances: 0,
        nhbCount: 0,
        reliefIpOutsSum: 0,
        reliefRunsSum: 0,
        starterGames: 0,
        runSupportPointsSum: 0,
        starterIpOutsSum: 0,
      }
      byNpb.set(npb, a)
    }
    fn(a!)
  }

  for (const doc of docs) {
    const gameId = doc.gameId
    const plRows = extractNf3PitchingLineRows(doc, roster, gameId)
    const rsRows = extractRunSupportForStarters(doc, roster, gameId)
    perGame.push({ gameId, pitchingLines: plRows, starterRunSupport: rsRows })

    for (const r of plRows) {
      if (!r.npbPlayerId) continue
      if (r.isReliefStint) {
        bump(r.npbPlayerId, (a) => {
          a.reliefAppearances += 1
          a.reliefIpOutsSum += r.ipOuts
          a.reliefRunsSum += r.r
          if (r.nhbEligible) a.nhbCount += 1
        })
      }
    }
    for (const r of rsRows) {
      if (!r.npbPlayerId || r.runSupportPoints == null) continue
      const rsp = r.runSupportPoints
      bump(r.npbPlayerId, (a) => {
        a.starterGames += 1
        a.runSupportPointsSum += rsp
        a.starterIpOutsSum += r.ipOuts
      })
    }
  }

  const generatedAt = new Date().toISOString()

  writeFileSync(
    join(outDir, "per_game.json"),
    JSON.stringify(
      {
        schemaVersion: "pitcher-nf3-metrics-per-game-v1",
        seasonYear: year,
        generatedAt,
        note:
          "援護点は打席ログとスコアボードの近似。NHB は pitchingLines の行単位（救援・再登板）でカウント。",
        games: perGame,
      },
      null,
      2
    ),
    "utf8"
  )

  const aggregate: Record<
    string,
    Agg & {
      nhbPct: number | null
      nhbPctDisplay: string
      ipr: string
      avgRunSupportPerStarterGame: number | null
    }
  > = {}

  for (const [npb, a] of byNpb) {
    const nhbPct =
      a.reliefAppearances > 0 ? (a.nhbCount / a.reliefAppearances) * 100 : null
    const nhbPctDisplay =
      a.reliefAppearances > 0 && nhbPct != null ? `${nhbPct.toFixed(1)}%` : "—"
    const ipr = nf3IprFromReliefIpRuns(a.reliefIpOutsSum, a.reliefRunsSum)
    const avgRunSupportPerStarterGame =
      a.starterGames > 0 ? a.runSupportPointsSum / a.starterGames : null
    aggregate[npb] = {
      ...a,
      nhbPct,
      nhbPctDisplay,
      ipr,
      avgRunSupportPerStarterGame,
    }
  }

  writeFileSync(
    join(outDir, "aggregate_by_npb.json"),
    JSON.stringify(
      {
        schemaVersion: "pitcher-nf3-metrics-aggregate-v1",
        seasonYear: year,
        generatedAt,
        byNpbPlayerId: aggregate,
      },
      null,
      2
    ),
    "utf8"
  )

  console.log(
    `[build_pitcher_nf3_metrics] wrote ${perGame.length} games → ${outDir} (per_game.json, aggregate_by_npb.json)`
  )
}

main()
