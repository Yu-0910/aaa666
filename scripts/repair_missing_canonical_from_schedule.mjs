/**
 * Phase 0の日程を基準に、完了済みなのにcanonicalが無い/空の試合を再取得する。
 * 日程をcanonicalの完全性チェックに使い、週間集計の「試合なし」誤判定を防ぐ。
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

function parseArgs(argv) {
  const value = (name, fallback = "") => {
    const i = argv.indexOf(name)
    return i >= 0 ? String(argv[i + 1] ?? fallback).trim() : fallback
  }
  return {
    year: value("--year", "2026"),
    from: value("--from"),
    to: value("--to"),
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function isCancelled(game) {
  const text = `${game?.statusText ?? ""} ${game?.gameState ?? ""}`
  return /中止|ノーゲーム|cancel|no.?game/i.test(text)
}

function isRegularSeasonScheduleGame(year, ymd, game) {
  if (year === "2026" && ymd < "2026-03-27") return false
  const teams = `${game?.homeTeamShort ?? ""} ${game?.awayTeamShort ?? ""}`
  return !/オールセリーグ|オールパリーグ|全セ|全パ/.test(teams)
}

function isCanonicalUsable(doc) {
  const domain = doc?.domain
  if (!domain || !Array.isArray(domain.battingLines) || domain.battingLines.length === 0) return false
  const appearances = domain.plateAppearances
  return !Array.isArray(appearances) || appearances.length > 0
}

function inRange(ymd, from, to) {
  return (!from || ymd >= from) && (!to || ymd <= to)
}

function run(label, args) {
  console.log(`[schedule-repair] ${label}`)
  const result = spawnSync(process.execPath, args, { stdio: "inherit", cwd: process.cwd() })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function main() {
  const { year, from, to } = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const indexPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const index = readJson(indexPath)
  if (!index?.byDate || !index?.scheduleGameByGameId) {
    throw new Error(`[schedule-repair] missing schedule index: ${indexPath}`)
  }

  const canonicalDir = path.join(root, "_data", "scraped_games", "canonical")
  const missing = []
  for (const [ymd, ids] of Object.entries(index.byDate)) {
    if (!inRange(ymd, from, to)) continue
    for (const rawId of Array.isArray(ids) ? ids : []) {
      const gameId = String(rawId).trim()
      const scheduleGame = index.scheduleGameByGameId[gameId]
      if (!gameId || isCancelled(scheduleGame) || !isRegularSeasonScheduleGame(year, ymd, scheduleGame)) continue
      const canonical = readJson(path.join(canonicalDir, `${gameId}.json`))
      if (!isCanonicalUsable(canonical)) missing.push(gameId)
    }
  }

  const gameIds = [...new Set(missing)].sort()
  console.log(`[schedule-repair] year=${year} range=${from || "(all)"}..${to || "(all)"} missing=${gameIds.length}`)
  if (gameIds.length === 0) return

  const ids = gameIds.join(",")
  run("Phase1 raw再取得", [path.join(root, "scripts", "phase1_fetch_sportsnavi_games.mjs"), "--year", year, "--game-ids", ids, "--force"])
  run("Phase2 stats/text再取得", [path.join(root, "scripts", "phase2_fetch_sportsnavi_stats_text.mjs"), "--year", year, "--game-ids", ids, "--force"])
  run("canonical再生成", [path.join(root, "scripts", "phase2_build_canonical_from_raw_sportsnavi.mjs"), "--year", year, "--game-ids", ids, "--force"])
  console.log(`[schedule-repair] repaired=${gameIds.length} game(s): ${ids}`)
}

main()
