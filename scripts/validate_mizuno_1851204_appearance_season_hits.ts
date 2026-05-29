/**
 * 水野 達稀（Yahoo 打者 ID 1851204）の 2026 シーズン安打が、
 * 出場主軸 zip **有効**（`TOPPAGE_APPEARANCE_PRIMARY` 未設定）の集計で
 * Phase11 派生 JSON の通算と一致することを検証する。
 *
 *   npm run validate:mizuno-1851204-appearance-hits
 *
 * 前提: `_data/derived/player_season_batting/2026/yahoo_1851204.json` が存在し、
 * その `source.canonicalGames` に列挙された試合の canonical が揃っていること。
 * canonical や Phase11 を更新したら、本スクリプトが再び緑になるかで回帰を見る。
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import { isAppearancePrimaryZipEnabled } from "../lib/yahooGame/appearancePrimaryFeatureFlag"
import { aggregateBattingSeasonByYahooBatterHybridForProfiles } from "../lib/yahooGame/canonicalBattingSeasonAgg"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

const BATTER_ID = "1851204"
const YEAR = "2026"

function withEnv<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.TOPPAGE_APPEARANCE_PRIMARY
  if (value === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
  else process.env.TOPPAGE_APPEARANCE_PRIMARY = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.TOPPAGE_APPEARANCE_PRIMARY
    else process.env.TOPPAGE_APPEARANCE_PRIMARY = prev
  }
}

function loadMergedCanonicalSubset(gameIds: readonly string[]): CanonicalGameDocument[] {
  const out: CanonicalGameDocument[] = []
  for (const gid of gameIds) {
    const id = String(gid ?? "").trim()
    if (!id) continue
    const p = join(projectRoot, "_data", "scraped_games", "canonical", `${id}.json`)
    if (!existsSync(p)) {
      throw new Error(`canonical がありません: ${p}`)
    }
    const raw = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
    out.push(mergePhase10RestoredIntoDocIfPresent(raw))
  }
  return out
}

function seasonHitsZipOn(docs: CanonicalGameDocument[]): number {
  const by = aggregateBattingSeasonByYahooBatterHybridForProfiles(docs)
  const agg = by.get(BATTER_ID)
  assert.ok(agg, `${BATTER_ID} の集計行が得られること`)
  return agg!.h
}

function main(): void {
  const phase11Path = join(projectRoot, "_data", "derived", "player_season_batting", YEAR, `yahoo_${BATTER_ID}.json`)
  assert.ok(existsSync(phase11Path), `先に Phase11 を生成してください: ${phase11Path}`)

  const phase11 = JSON.parse(readFileSync(phase11Path, "utf8")) as {
    rows?: Array<{ split_type?: string; h?: number }>
    source?: { canonicalGames?: string[] }
  }
  const totalRow = phase11.rows?.find((r) => r.split_type === "total")
  assert.ok(totalRow && typeof totalRow.h === "number", "Phase11 JSON に通算行と安打 h があること")
  const expectedH = totalRow.h as number

  const gameIds = phase11.source?.canonicalGames ?? []
  assert.ok(Array.isArray(gameIds) && gameIds.length > 0, "Phase11 JSON に source.canonicalGames があること")

  const docs = loadMergedCanonicalSubset(gameIds)

  withEnv(undefined, () => {
    assert.equal(isAppearancePrimaryZipEnabled(), true, "zip 有効＝新方式の分岐に入ること")
    const h = seasonHitsZipOn(docs)
    assert.equal(
      h,
      expectedH,
      `新方式（zip 有効）の集計安打 ${h} が Phase11 派生の通算安打 ${expectedH} と一致すること`,
    )
  })

  console.log(
    `validate_mizuno_1851204_appearance_season_hits: OK (zip-on h=${expectedH}, games=${gameIds.length})`,
  )
}

main()
