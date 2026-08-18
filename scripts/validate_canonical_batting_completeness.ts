/**
 * canonical 打撃データの「欠陥を生みやすい条件」を検知して事前に警告/失敗させる。
 *
 * 目的:
 * - plateAppearances が無い試合で、battingLines だけに依存すると PA/SF/IBB/TB などが欠損しやすい
 * - 欠損の温床をパイプラインで可視化し、閾値超えならビルドを止める（任意）
 *
 * 実行:
 *   tsx scripts/validate_canonical_batting_completeness.ts --year 2026
 *   tsx scripts/validate_canonical_batting_completeness.ts --year 2026 --fail-on-warn
 *   tsx scripts/validate_canonical_batting_completeness.ts --year 2026 --from 2026-07-18 --to 2026-07-19
 */

import fs from "node:fs"
import path from "node:path"
import { isRegularSeasonCanonicalGame } from "@/lib/npbRegularSeason"

type CanonicalDoc = {
  gameId: string
  game?: {
    meta?: { documentTitle?: string }
    textPlayByPlay?: Array<{ sectionTitle?: string; lines?: string[] }>
  }
  domain?: {
    plateAppearances?: unknown[]
    battingLines?: Array<{
      yahooPlayerId?: string
      playerName?: string
      ab?: number
      h?: number
      hr?: number
      bb?: number
      hbp?: number
      sh?: number
      // optional in canonical
      h2?: number
      h3?: number
    }>
  }
}

function parseArgs(argv: string[]): {
  year: string
  failOnWarn: boolean
  from: string
  to: string
  gameIds: string[] | null
} {
  const yearIdx = argv.indexOf("--year")
  const fromIdx = argv.indexOf("--from")
  const toIdx = argv.indexOf("--to")
  const gameIdsIdx = argv.indexOf("--game-ids")
  const failOnWarn = argv.includes("--fail-on-warn")
  const year = yearIdx >= 0 ? String(argv[yearIdx + 1] ?? "").trim() : "2026"
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "").trim() : ""
  const to = toIdx >= 0 ? String(argv[toIdx + 1] ?? "").trim() : ""
  const gameIdsRaw = gameIdsIdx >= 0 ? String(argv[gameIdsIdx + 1] ?? "").trim() : ""
  const gameIds = gameIdsRaw
    ? gameIdsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  return { year: year || "2026", failOnWarn, from, to, gameIds }
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T
  } catch {
    return null
  }
}

function listCanonicalGameIds(root: string): string[] {
  const dir = path.join(root, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.replace(/\.json$/, ""))
}

function gameIdsForDayFromIndex(root: string, year: string, day: string): string[] {
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJson<{ byDate?: Record<string, string[]> }>(idxPath)
  const list = idx?.byDate?.[day] ?? []
  return list.map((x) => String(x ?? "").trim()).filter(Boolean)
}

function collectGameIdsForRange(root: string, year: string, from: string, to: string): string[] {
  if (!from && !to) return listCanonicalGameIds(root)
  const idxPath = path.join(root, "_data", "sportsnavi_schedule_index", `season_${year}.json`)
  const idx = readJson<{ byDate?: Record<string, string[]> }>(idxPath)
  const byDate = idx?.byDate ?? {}
  const ids = new Set<string>()
  for (const day of Object.keys(byDate).sort()) {
    if (from && day < from) continue
    if (to && day > to) continue
    for (const id of gameIdsForDayFromIndex(root, year, day)) ids.add(id)
  }
  return [...ids].sort()
}

function extractSfCountFromText(doc: CanonicalDoc): number {
  const sections = doc.game?.textPlayByPlay ?? []
  let n = 0
  for (const sec of sections) {
    for (const line of sec.lines ?? []) {
      const s = String(line ?? "")
      if (/犠牲フライ|犠飛/.test(s)) n += 1
    }
  }
  return n
}

function extractGameDateFromTitle(title: string | undefined, year: string): string {
  const match = String(title ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!match || match[1] !== year) return ""
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`
}

function main(): void {
  const root = process.cwd()
  const { year, failOnWarn, from, to, gameIds } = parseArgs(process.argv.slice(2))

  const idsAll = listCanonicalGameIds(root)
  if (idsAll.length === 0) {
    console.error("[validate_canonical_batting_completeness] no canonical games found")
    process.exit(1)
  }

  let ids = idsAll
  if (gameIds && gameIds.length > 0) {
    const allowed = new Set(gameIds)
    ids = idsAll.filter((id) => allowed.has(id))
  } else if (from || to) {
    const allowed = new Set(collectGameIdsForRange(root, year, from, to))
    ids = idsAll.filter((id) => allowed.has(id))
  }
  if (ids.length === 0) {
    console.log(
      `[validate_canonical_batting_completeness] no canonical games for range year=${year} from=${from || "(none)"} to=${to || "(none)"}`,
    )
    return
  }

  const findings: Array<{
    gameId: string
    title?: string
    paRows: number
    battingLines: number
    sfMentionsInText: number
    risk: string[]
  }> = []

  let warnCount = 0
  let regularSeasonGameCount = 0
  for (const gameId of ids) {
    const p = path.join(root, "_data", "scraped_games", "canonical", `${gameId}.json`)
    const doc = readJson<CanonicalDoc>(p)
    if (!doc) continue

    const title = doc.game?.meta?.documentTitle
    const gameDate = extractGameDateFromTitle(title, year)
    if (gameDate && !isRegularSeasonCanonicalGame(year, gameDate, title)) continue
    regularSeasonGameCount += 1

    const paRows = doc.domain?.plateAppearances?.length ?? 0
    const bl = doc.domain?.battingLines ?? []
    const sfMentionsInText = extractSfCountFromText(doc)

    const risk: string[] = []

    // 1) plateAppearances が無いのに SF の記載がある → PAズレの温床（補完が効いていない/効けない可能性）
    if (paRows === 0 && sfMentionsInText > 0) {
      risk.push("plateAppearances=0 but SF mentioned in text (PA undercount risk)")
    }

    // 2) plateAppearances が無いのに battingLines の 2B/3B 情報が欠けている行がある → TB近似の温床
    if (paRows === 0 && bl.length > 0) {
      const hasMissingExtraBase = bl.some((r) => (r.h2 === undefined || r.h3 === undefined) && (r.h ?? 0) > 0)
      if (hasMissingExtraBase) {
        risk.push("plateAppearances=0 and battingLines missing h2/h3 (TB approximation risk)")
      }
    }

    // 3) plateAppearances が無いと IBB は原則拾えない（battingLines に無い前提）
    if (paRows === 0 && bl.length > 0) {
      risk.push("plateAppearances=0 (IBB may be missing)")
    }

    if (risk.length > 0) {
      warnCount += 1
      findings.push({
        gameId,
        title,
        paRows,
        battingLines: bl.length,
        sfMentionsInText,
        risk,
      })
    }
  }

  const report = {
    schemaVersion: "validate-canonical-batting-completeness-v0",
    year,
    canonicalGames: regularSeasonGameCount,
    warnings: warnCount,
    findings: findings.slice(0, 200), // 量が多い場合に備えて上限
  }

  const outPath = path.join(root, "_data", "derived", `validate_canonical_batting_completeness_${year}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")

  if (warnCount > 0) {
    console.warn(
      `[validate_canonical_batting_completeness] warnings=${warnCount} games=${ids.length} (see ${outPath})`
    )
    if (failOnWarn) process.exit(2)
  } else {
    console.log(`[validate_canonical_batting_completeness] ok (games=${regularSeasonGameCount})`)
  }
}

main()

