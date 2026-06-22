/**
 * 対戦成績の球団コード一覧（SeasonStatsPilot TEAM_ORDER / teamCodes と整合）。
 * 見出しの表示順は対戦人数降順。同数のときのタイブレークにこの順を使う。
 */
export const PLAYER_MATCHUP_TEAM_ORDER = [
  { teamCode: "F", label: "日本ハム" },
  { teamCode: "E", label: "楽天" },
  { teamCode: "L", label: "西武" },
  { teamCode: "M", label: "ロッテ" },
  { teamCode: "Bs", label: "オリックス" },
  { teamCode: "Hs", label: "ソフトバンク" },
  { teamCode: "G", label: "巨人" },
  { teamCode: "S", label: "ヤクルト" },
  { teamCode: "DB", label: "横浜" },
  { teamCode: "D", label: "中日" },
  { teamCode: "H", label: "阪神" },
  { teamCode: "C", label: "広島" },
] as const
