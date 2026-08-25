/**
 * 順位表 JSON のパス（Phase 0 固定）。
 * 仕様: docs/plan_team_standings_phase0_spec.md §2
 */

import type { StandingsLeague } from "@/lib/standings/types"

/** 工場層（派生・検証用） */
export function derivedTeamStandingsRelPath(year: string, league: StandingsLeague): string {
  return `_data/derived/team_standings/${year}/${league}.json`
}

/** ローカル表示用（R2 アップロード元・Git 外） */
export function publicTeamStandingsRelPath(year: string, league: StandingsLeague): string {
  return `public/data/standings/${year}/${league}.json`
}

export function derivedWeeklyTeamStandingsRelPath(
  year: string,
  weekKey: string,
  league: StandingsLeague
): string {
  return `_data/derived/team_standings/weekly/${year}/${weekKey}/${league}.json`
}

export function publicWeeklyTeamStandingsRelPath(
  year: string,
  weekKey: string,
  league: StandingsLeague
): string {
  return `public/data/standings/weekly/${year}/${weekKey}/${league}.json`
}

/** R2 オブジェクトキー（public/ なし） */
export function r2TeamStandingsObjectKey(year: string, league: StandingsLeague): string {
  return `data/standings/${year}/${league}.json`
}

/** ブラウザ / Vercel プロキシ */
export function siteTeamStandingsPath(year: string, league: StandingsLeague): string {
  return `/data/standings/${year}/${league}.json`
}

/** 本番フォールバック用の静的公開パス（app/data ルートを通さない） */
export function staticTeamStandingsPath(year: string, league: StandingsLeague): string {
  return `/standings-json/${year}/${league}.json`
}

export function siteWeeklyTeamStandingsPath(
  year: string,
  weekKey: string,
  league: StandingsLeague
): string {
  return `/data/standings/weekly/${year}/${weekKey}/${league}.json`
}
