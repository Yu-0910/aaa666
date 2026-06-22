/**
 * facounter.net 各球団ページ（Phase 1 取得用）。
 * URL は index.html から抽出した 2026 シーズン版の固定リスト。
 */

export type FacounterTeamPageDef = {
  /** 保存ファイル名（拡張子なし）例: cnd */
  slug: string
  /** 取得 URL */
  url: string
  /** 2026 名簿 `team` 列との突合用（Phase 3） */
  rosterTeamFullName: string
  league: "CL" | "PL"
}

const BASE = "https://facounter.net/count"

/** 12 球団（facounter の slug 固定） */
export const FACOUNTER_TEAM_PAGES_2026: FacounterTeamPageDef[] = [
  { slug: "yug", url: `${BASE}/yug.html`, rosterTeamFullName: "読売ジャイアンツ", league: "CL" },
  { slug: "ydb", url: `${BASE}/ydb.html`, rosterTeamFullName: "横浜DeNAベイスターズ", league: "CL" },
  { slug: "tys", url: `${BASE}/tys.html`, rosterTeamFullName: "東京ヤクルトスワローズ", league: "CL" },
  { slug: "cnd", url: `${BASE}/cnd.html`, rosterTeamFullName: "中日ドラゴンズ", league: "CL" },
  { slug: "htc", url: `${BASE}/htc.html`, rosterTeamFullName: "広島東洋カープ", league: "CL" },
  { slug: "hst", url: `${BASE}/hst.html`, rosterTeamFullName: "阪神タイガース", league: "CL" },
  { slug: "clm", url: `${BASE}/clm.html`, rosterTeamFullName: "千葉ロッテマリーンズ", league: "PL" },
  { slug: "nhf", url: `${BASE}/nhf.html`, rosterTeamFullName: "北海道日本ハムファイターズ", league: "PL" },
  { slug: "ssl", url: `${BASE}/ssl.html`, rosterTeamFullName: "埼玉西武ライオンズ", league: "PL" },
  { slug: "sbh", url: `${BASE}/sbh.html`, rosterTeamFullName: "福岡ソフトバンクホークス", league: "PL" },
  { slug: "tre", url: `${BASE}/tre.html`, rosterTeamFullName: "東北楽天ゴールデンイーグルス", league: "PL" },
  { slug: "obs", url: `${BASE}/obs.html`, rosterTeamFullName: "オリックス・バファローズ", league: "PL" },
]

export function facounterScrapedDir(projectRoot: string, year: string): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  return `${projectRoot}/_data/scraped_external/facounter/${safeYear}`.replace(/\\/g, "/")
}
