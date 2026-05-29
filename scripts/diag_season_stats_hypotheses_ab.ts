/**
 * 個人ページ season-stats 向けの仮説 A（Yahoo ID 解決・マップ）と B（Phase11 派生）を一括で確認する。
 *
 *   npx tsx scripts/diag_season_stats_hypotheses_ab.ts
 *   npx tsx scripts/diag_season_stats_hypotheses_ab.ts --decoded 佐藤輝明
 *   npx tsx scripts/diag_season_stats_hypotheses_ab.ts --decoded 2000051
 *
 * npm:
 *   npm run diag:season-stats-ab
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { decodePlayerPathSegment } from "../lib/api/derivedPlayerApiShared"
import { getProjectRoot } from "../lib/projectRoot"
import { findRosterPlayerByPublicId } from "../lib/npbRoster"
import {
  invalidateYahooNpbBatterMapsCache,
  resolveYahooPilotIdForStats,
} from "../lib/yahooNpbBatterIdMap"
import {
  loadPhase11DerivedBattingRows,
  mergePilotSeasonStatsWithDerived,
} from "../lib/seasonStatsPilot"
import { DERIVED_SEASON_YEAR_DEFAULT } from "../lib/seasonStatsPilotShared"

function parseDecodedArg(): string {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--decoded" && args[i + 1]) {
      return decodePlayerPathSegment(args[i + 1]!)
    }
  }
  return decodePlayerPathSegment("佐藤輝明")
}

function derivedSeasonBattingExists(root: string, yahooBatterId: string, year: string): boolean {
  const id = (yahooBatterId || "").trim()
  if (!/^\d+$/.test(id)) return false
  const y = (year || "").trim() || DERIVED_SEASON_YEAR_DEFAULT
  const candidates = [
    join(root, "_data", "derived", "player_season_batting", y, `yahoo_${id}.json`),
    join(root, "_data", "derived", "player_season_batting_context", y, `yahoo_${id}.json`),
    join(root, "_data", "derived", "player_season_batting_splits", y, `yahoo_${id}.json`),
    join(root, "_data", "derived", "player_season_batting_count", y, `yahoo_${id}.json`),
    join(root, "_data", "derived", "player_season_batting_period", y, `yahoo_${id}.json`),
  ]
  return candidates.some((p) => existsSync(p))
}

function main(): void {
  const year = DERIVED_SEASON_YEAR_DEFAULT
  const decoded = parseDecodedArg()
  const root = getProjectRoot()

  invalidateYahooNpbBatterMapsCache()

  const fullPath = join(root, "_data", "scraped_games", "derived", "yahoo_to_npb_full.json")
  let fullMapEntryCount = 0
  if (existsSync(fullPath)) {
    try {
      const raw = JSON.parse(readFileSync(fullPath, "utf8")) as { map?: Record<string, string> }
      fullMapEntryCount = Object.keys(raw?.map ?? {}).length
    } catch {
      fullMapEntryCount = -1
    }
  }

  const y0 = resolveYahooPilotIdForStats(decoded)
  let yahooId: string | null = y0
  if (!yahooId && /^\d+$/.test(decoded) && derivedSeasonBattingExists(root, decoded, year)) {
    yahooId = decoded
  }
  const roster = findRosterPlayerByPublicId(decoded)
  const npbId = (roster?.npb_player_id ?? "").trim()
  if (!yahooId && npbId) {
    yahooId = resolveYahooPilotIdForStats(npbId)
  }

  const phase11Path = join(
    root,
    "_data",
    "derived",
    "player_season_batting",
    year,
    yahooId ? `yahoo_${yahooId}.json` : "yahoo_<null>.json",
  )
  const phase11Exists = yahooId ? existsSync(phase11Path) : false
  const phase11Rows = yahooId ? loadPhase11DerivedBattingRows(yahooId, year) : []
  const totalRow = phase11Rows.find((r) => r.split_type === "total" && r.split_value === "total")

  let mergeRowCount = 0
  let mergeTotalPa: number | null = null
  if (yahooId) {
    const merged = mergePilotSeasonStatsWithDerived(yahooId, year)
    mergeRowCount = merged.rows.length
    const t = merged.rows.find((r) => r.split_type === "total" && r.split_value === "total")
    mergeTotalPa = t ? t.pa : null
  }

  const hypothesisA_ok = Boolean(yahooId)
  const hypothesisB_ok =
    Boolean(yahooId) && phase11Exists && phase11Rows.length > 0 && (totalRow?.pa ?? 0) > 0

  const out = {
    projectRoot: root,
    decoded,
    hypothesisA: {
      label: "Yahoo 打者 ID が解決できるか（マップ＋名簿）",
      yahooId,
      resolve_direct: y0,
      roster_npb_player_id: npbId || null,
      roster_name_ja: roster?.name_ja ?? null,
      yahoo_to_npb_full_json_exists: existsSync(fullPath),
      yahoo_to_npb_full_map_entry_count: fullMapEntryCount,
      ok: hypothesisA_ok,
      note: hypothesisA_ok
        ? null
        : "yahooId が null → season-stats はプレースホルダーまたは hasData:false になり得る",
    },
    hypothesisB: {
      label: "Phase11 派生 JSON に実数が入っているか",
      phase11_path: yahooId ? phase11Path : null,
      phase11_file_exists: phase11Exists,
      phase11_row_count: phase11Rows.length,
      phase11_total_pa: totalRow?.pa ?? null,
      merge_after_combine_row_count: mergeRowCount,
      merge_total_pa: mergeTotalPa,
      ok: hypothesisB_ok,
      note: hypothesisB_ok
        ? null
        : "ファイル無し・rows 空・通算 pa=0 のいずれか → 表示が空／プレースホルダー寄り",
    },
  }

  console.log(JSON.stringify(out, null, 2))
}

main()
