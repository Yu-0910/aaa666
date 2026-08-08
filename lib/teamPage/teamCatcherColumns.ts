/**
 * チーム捕手成績一覧の列定義（個人捕手タブ「基本成績」と同指標・同順）
 */

export type TeamCatcherSortKey =
  | "era"
  | "gamesAsCatcher"
  | "starts"
  | "wins"
  | "losses"
  | "draws"
  | "avgAgainst"
  | "qsCount"
  | "teamWinPct"
  | "ipOuts"
  | "bf"
  | "pitches"
  | "h"
  | "kPct"
  | "whip"
  | "hr"
  | "so"
  | "bb"
  | "ibb"
  | "hbp"
  | "er"
  | "qsPct"
  | "hqsPct"
  | "babipAgainst"
  | "obpAgainst"
  | "slgAgainst"
  | "goAo"
  | "csPct"
  | "pbPer9"
  | "player"

export type TeamCatcherColumnDef = {
  key: TeamCatcherSortKey | "rank"
  label: string
  sortable: boolean
  numeric: boolean
}

export const TEAM_CATCHER_COLUMNS: readonly TeamCatcherColumnDef[] = [
  { key: "rank", label: "順", sortable: false, numeric: false },
  { key: "player", label: "選手名", sortable: true, numeric: false },
  { key: "teamWinPct", label: "勝率", sortable: true, numeric: true },
  { key: "era", label: "防御率", sortable: true, numeric: true },
  { key: "csPct", label: "盗塁阻止率", sortable: true, numeric: true },
  { key: "gamesAsCatcher", label: "試合", sortable: true, numeric: true },
  { key: "starts", label: "先発", sortable: true, numeric: true },
  { key: "wins", label: "勝利", sortable: true, numeric: true },
  { key: "losses", label: "敗戦", sortable: true, numeric: true },
  { key: "draws", label: "引分", sortable: true, numeric: true },
  { key: "avgAgainst", label: "被打率", sortable: true, numeric: true },
  { key: "qsCount", label: "QS", sortable: true, numeric: true },
  { key: "ipOuts", label: "回数", sortable: true, numeric: true },
  { key: "bf", label: "被打者", sortable: true, numeric: true },
  { key: "pitches", label: "投球数", sortable: true, numeric: true },
  { key: "h", label: "被安", sortable: true, numeric: true },
  { key: "kPct", label: "K%", sortable: true, numeric: true },
  { key: "whip", label: "WHIP", sortable: true, numeric: true },
  { key: "hr", label: "被本", sortable: true, numeric: true },
  { key: "so", label: "三振", sortable: true, numeric: true },
  { key: "bb", label: "四球", sortable: true, numeric: true },
  { key: "ibb", label: "故意四", sortable: true, numeric: true },
  { key: "hbp", label: "死球", sortable: true, numeric: true },
  { key: "er", label: "失点", sortable: true, numeric: true },
  { key: "qsPct", label: "QS率", sortable: true, numeric: true },
  { key: "hqsPct", label: "HQS率", sortable: true, numeric: true },
  { key: "babipAgainst", label: "被BABIP", sortable: true, numeric: true },
  { key: "obpAgainst", label: "被出塁率", sortable: true, numeric: true },
  { key: "slgAgainst", label: "被長打率", sortable: true, numeric: true },
  { key: "goAo", label: "GO/AO", sortable: true, numeric: true },
  { key: "pbPer9", label: "PB/9", sortable: true, numeric: true },
] as const

export const TEAM_CATCHER_DEFAULT_SORT_KEY: TeamCatcherSortKey = "teamWinPct"

export const TEAM_CATCHER_DEFAULT_SORT_ORDER: "asc" | "desc" = "desc"

export const TEAM_CATCHER_SORT_KEYS: readonly TeamCatcherSortKey[] = TEAM_CATCHER_COLUMNS.filter(
  (c) => c.key !== "rank",
).map((c) => c.key as TeamCatcherSortKey)
