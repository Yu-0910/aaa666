/**
 * Phase2 canonical に「打撃の実体が全く無い」試合が残っていないか検査する。
 *
 * 背景:
 * - スポナビ stats/text は CSR で、初回 fetch が空のテーブルだけを返すことがある。
 * - その状態で canonical を生成すると battingLines / plateAppearances が両方空になり、
 *   個人通算（phase11）からその試合の打数・安打が抜けて打率が歪む（例: 渡部聖弥 2021038791）。
 *
 * 実行:
 *   npx tsx scripts/validate_phase2_canonical_nonempty.ts --year 2026
 *   npx tsx scripts/validate_phase2_canonical_nonempty.ts --year 2026 --fail
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, "..")

type CanonicalDoc = {
  gameId: string
  game?: { missingOrPartial?: string[]; meta?: { documentTitle?: string } }
  domain?: { plateAppearances?: unknown[]; battingLines?: unknown[] }
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

function parseYmdFromTitleJa(title: string): { y: number; m: number; d: number } | null {
  const t = String(title ?? "")
  const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  const y = parseInt(m[1]!, 10)
  const mo = parseInt(m[2]!, 10)
  const d = parseInt(m[3]!, 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/**
 * 「今日以降」のカードは、試合前/試合中で stats/text が空でも正常になり得るため、
 * フェーズ4の欠損検知（過去試合の取り逃し）からは除外する。
 *
 * 目的:
 * - 試合当日（試合前）の運用で検証が落ち続けるのを防ぐ
 */
function shouldSkipAsTodayOrFuture(title: string): boolean {
  const ymd = parseYmdFromTitleJa(title)
  if (!ymd) return false
  const today = new Date()
  const ty = today.getFullYear()
  const tm = today.getMonth() + 1
  const td = today.getDate()
  if (ymd.y > ty) return true
  if (ymd.y < ty) return false
  if (ymd.m > tm) return true
  if (ymd.m < tm) return false
  return ymd.d >= td
}

function readTextIfExists(p: string): string | null {
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

/**
 * Sportsnavi の試合トップ raw（raw_sportsnavi/{gameId}.html）から、当該カードが
 * - 試合前（まだ成立していない）
 * - 試合中止 / ノーゲーム（成立しない/しなかった）
 * のどれかを判定する。
 *
 * 目的:
 * - 「試合前」の gameId まで欠損扱いしてフェーズ4が落ち続けるのを防ぐ
 * - 「中止/ノーゲーム」は battingLines/plateAppearances が空でも正常なので除外する
 *
 * 注意:
 * - scoreList（別試合一覧）の「試合前」等は誤検知しやすいので、bb-gameCard__state のみ見る。
 */
function shouldSkipAsNotFinalizedOrNoContest(gameId: string): boolean {
  const mainPath = path.join(projectRoot, "_data", "scraped_games", "raw_sportsnavi", `${gameId}.html`)
  const statsPath = path.join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_stats", `${gameId}.html`)
  const textPath = path.join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_text", `${gameId}.html`)
  const htmlMain = readTextIfExists(mainPath)
  const htmlStats = readTextIfExists(statsPath)
  const htmlText = readTextIfExists(textPath)

  const html = htmlMain || htmlStats || htmlText
  if (!html) return false

  // 当該カードの状態（試合カード上段）を優先して見る
  const stateRe = /<p[^>]*\bbb-gameCard__state\b[^>]*>[\s\S]*?<span>\s*(試合前|試合中止|ノーゲーム)\s*<\/span>[\s\S]*?<\/p>/i
  if (stateRe.test(htmlMain ?? "")) return true
  if (stateRe.test(htmlStats ?? "")) return true
  if (stateRe.test(htmlText ?? "")) return true

  // 当該カード固有のステータスコメント（ノーゲーム/試合中止が出る）
  const titleRe = /<h2[^>]*\bbb-head01__title\b[^>]*>\s*(試合中止|ノーゲーム)\s*<\/h2>/i
  if (titleRe.test(htmlMain ?? "")) return true
  if (titleRe.test(htmlStats ?? "")) return true
  if (titleRe.test(htmlText ?? "")) return true

  return false
}

function readJson(p: string): CanonicalDoc | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CanonicalDoc
  } catch {
    return null
  }
}

function main() {
  const { year, fail } = parseArgs(process.argv)
  const dir = path.join(projectRoot, "_data", "scraped_games", "canonical")
  if (!fs.existsSync(dir)) {
    console.error("[validate_phase2_canonical_nonempty] missing dir:", dir)
    process.exit(1)
  }

  const bad: Array<{ gameId: string; title?: string; hints: string[] }> = []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))

  for (const f of files) {
    const gameId = f.replace(/\.json$/, "")
    const p = path.join(dir, f)
    const doc = readJson(p)
    if (!doc) continue

    const title = doc.game?.meta?.documentTitle ?? ""
    if (year && !title.includes(`${year}年`)) continue

    if (shouldSkipAsTodayOrFuture(title)) continue
    if (isCancelled(doc)) continue
    if (shouldSkipAsNotFinalizedOrNoContest(gameId)) continue

    const pa = doc.domain?.plateAppearances?.length ?? 0
    const bl = doc.domain?.battingLines?.length ?? 0
    if (pa > 0 || bl > 0) continue

    const hints = (doc.game?.missingOrPartial ?? []).filter((s) => String(s).startsWith("phase2:"))
    bad.push({ gameId, title: title || undefined, hints })
  }

  const report = {
    schemaVersion: "validate-phase2-canonical-nonempty-v0",
    year,
    badCount: bad.length,
    bad,
  }

  const outPath = path.join(projectRoot, "_data", "derived", `validate_phase2_canonical_nonempty_${year}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")

  if (bad.length > 0) {
    console.error(
      `[validate_phase2_canonical_nonempty] ${bad.length} game(s) have no battingLines and no plateAppearances (not cancelled).`,
    )
    console.error(`  Report: ${outPath}`)
    for (const b of bad.slice(0, 30)) {
      console.error(`  - ${b.gameId}${b.title ? `  ${b.title}` : ""}`)
    }
    if (bad.length > 30) console.error(`  ... and ${bad.length - 30} more`)
    console.error(
      "  対処: npm run phase2:sportsnavi:stats-text:refetch-incomplete （fetch 後に canonical は自動 --only-stale）または npm run phase2:sportsnavi:canonical:stale",
    )
    if (fail) process.exit(2)
    process.exit(0)
  }

  console.log(`[validate_phase2_canonical_nonempty] ok (checked ${files.length} files, year filter=${year})`)
}

main()
