/** 順位表用: 球団コード ↔ 表示略称（RankingUI / topPageConstants と整合） */

export const TEAM_CODE_TO_SHORT: Record<string, string> = {
  H: "阪神",
  G: "巨人",
  DB: "DeNA",
  C: "広島",
  D: "中日",
  S: "ヤクルト",
  Bs: "オリックス",
  Bu: '近鉄',
  M: "ロッテ",
  F: "日本ハム",
  E: "楽天",
  L: "西武",
  Hs: "ソフトバンク",
}

export const TEAM_SHORT_TO_CODE: Record<string, string> = {
  阪神: "H",
  阪神タイガース: "H",
  巨人: "G",
  読売ジャイアンツ: "G",
  DeNA: "DB",
  横浜DeNAベイスターズ: "DB",
  広島: "C",
  広島東洋カープ: "C",
  中日: "D",
  中日ドラゴンズ: "D",
  ヤクルト: "S",
  東京ヤクルトスワローズ: "S",
  オリックス: "Bs",
  "オリックス・バファローズ": "Bs",
  ロッテ: "M",
  千葉ロッテマリーンズ: "M",
  日本ハム: "F",
  北海道日本ハムファイターズ: "F",
  楽天: "E",
  東北楽天ゴールデンイーグルス: "E",
  西武: "L",
  埼玉西武ライオンズ: "L",
  ソフトバンク: "Hs",
  福岡ソフトバンクホークス: "Hs",
  // --- NPB 年度別ページ 歴代表記（Phase 2）---
  横浜大洋ホエールズ: "DB",
  大洋ホエールズ: "DB",
  横浜ベイスターズ: "DB",
  横浜タイガース: "DB",
  大洋松竹ロビンス: "DB",
  松竹ロビンス: "DB",
  ヤクルトスワローズ: "S",
  ヤクルトアトムス: "S",
  東京ヤクルトアトムス: "S",
  サンケイスワローズ: "S",
  サンケイアトムス: "S",
  名古屋ドラゴンズ: "D",
  広島カープ: "C",
  南海ホークス: "Hs",
  福岡ダイエーホークス: "Hs",
  ダイエーホークス: "Hs",
  西鉄ライオンズ: "L",
  西武ライオンズ: "L",
  近鉄バファローズ: "Bs",
  大阪近鉄バファローズ: "Bs",
  オリックスブルーウェーブ: "Bs",
  オリックスブルーヴェーブ: "Bs",
  東映フライヤーズ: "M",
  毎日オリオンズ: "M",
  毎日マリーンズ: "M",
  東京オリオンズ: "M",
  千葉マリーンズ: "M",
  ロッテマリーンズ: "M",
  東急フライヤーズ: "F",
  東急アトムズ: "F",
  トキーブレーブ: "F",
  東京トヨタレッドサンダー: "F",
  日本ハムファイターズ: "F",
  北海道ニッポーハムファイターズ: "F",
  北海道日本ハム: "F",
  東北楽天イーグルス: "E",
  東北楽天ゴールデンイーグルス: "E",
  国鉄オリオンズ: "M",
  大映スターズ: "DI",
  大陽ロビンス: "DB",
  大陽デイリーズ: "M",
  金星スターズ: "VS",
  トンボユニオンズ: "TU",
  中部日本: "D",
  名古屋金鯱: "D",
  名古屋軍: "D",
  名古屋クラウス: "D",
  高橋ユニオンズ: "TU2",
  急映フライヤーズ: "M",
  近畿日本: "M",
  阪急ブレーブス: "Bs",
  阪急タイガース: "H",
  大東京軍: "G",
  東京セネタース: "TS",
  日本ヒルマンズ: "JH",
  黒鷲軍: "KU",
  パシフィック: "PC",
  サンチョークラウンライター: "SC",
  ライオン軍: "L",
  南海軍: "Hs",
  西鉄軍: "L",
  近鉄軍: "Bs",
  ロッテ軍: "M",
  日本ハム軍: "F",
  読売軍: "G",
  阪神軍: "H",
  中日軍: "D",
  広島軍: "C",
  ヤクルト軍: "S",
}

/** NPB 年度別成績ページのチーム列原文 → 球団コード（Phase 2） */
export const NPB_YEARLY_LABEL_TO_CODE: Record<string, string> = {
  ...TEAM_SHORT_TO_CODE,

  'クラウンライター・ライオンズ': 'L',
  '西鉄クリッパース': 'L',
  '太平洋クラブ・ライオンズ': 'L',
  '西日本パイレーツ': 'L',
  '国鉄スワローズ': 'S',
  'サンケイアトムズ': 'S',
  '大阪タイガース': 'H',
  '大映ユニオンズ': 'M',
  '毎日大映オリオンズ': 'M',
  '近鉄パールス': 'Bu',
  '日拓ホーム・フライヤーズ': 'F',

  '近鉄バファロー': 'Bu',
  '近鉄バファローズ': 'Bu',
  '大阪近鉄バファローズ': 'Bu',
}

const NPB_NON_TEAM_LABEL_RE =
  /^(最優秀|最多|首位|最高|順位|選\s*手|\d+)$|リーダー|表彰|達成/

/** NPB 年度別ページの行がチーム行か（リーダーズ・個人成績行を除外） */

const NPB_YEARLY_NON_TEAM_LABELS = new Set([
  '最優秀新人',
  '最優秀選手',
  '最優秀防御率',
  '最多勝利',
  '最多奪三振',
  '最多打点',
  '最多本塁打',
  '最多盗塁',
  '最高勝率',
  '首位打者',
  '順位',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
]);

export function isNpbYearlyTeamLabel(label: string): boolean {
  const normalized = label.trim();
  if (!normalized) return false;
  if (NPB_YEARLY_NON_TEAM_LABELS.has(normalized)) return false;
  return resolveNpbYearlyTeamCode(normalized) !== null;
}


/** NPB 年度別ページのチーム原文 → 球団コード。未マップは null */
export function resolveNpbYearlyTeamCode(npbLabel: string): string | null {
  const t = String(npbLabel ?? "").trim()
  if (!t) return null
  if (NPB_YEARLY_LABEL_TO_CODE[t]) return NPB_YEARLY_LABEL_TO_CODE[t]
  for (const [name, code] of Object.entries(NPB_YEARLY_LABEL_TO_CODE)) {
    if (t === name || t.includes(name) || name.includes(t)) return code
  }
  return null
}

export type NpbYearlyTeamRef = {
  team: string
  teamName: string
  npbLabel: string
}

/**
 * NPB 年度別 raw JSON の team 原文を順位表用に正規化（Phase 2）。
 * リーダーズ行など非チーム行は null。
 */
export function normalizeNpbYearlyTeam(npbLabel: string): NpbYearlyTeamRef | null {
  const label = String(npbLabel ?? "").trim()
  if (!isNpbYearlyTeamLabel(label)) return null
  const team = resolveNpbYearlyTeamCode(label)
  if (!team) return null
  return {
    team,
    teamName: teamHistoricalDisplayName(label, team),
    npbLabel: label,
  }
}

/** 歴代公式名から順位表表示用の短い球団名 */
export function teamHistoricalDisplayName(npbLabel: string, code: string): string {
  if (npbLabel.includes("松竹")) return "松竹"
  if (npbLabel.includes("大洋")) return "大洋"
  if (npbLabel.includes("横浜")) return "横浜"
  if (npbLabel.includes("ベイスターズ") || npbLabel.includes("DeNA")) return "DeNA"
  if (npbLabel.includes("南海")) return "南海"
  if (npbLabel.includes("ダイエー")) return "ダイエー"
  if (npbLabel.includes("ソフトバンク")) return "ソフトバンク"
  if (npbLabel.includes("西鉄")) return "西鉄"
  if (npbLabel.includes("太平洋")) return "太平洋"
  if (npbLabel.includes("クラウン")) return "クラウン"
  if (npbLabel.includes("西武")) return "西武"
  if (npbLabel.includes("近鉄")) return "近鉄"
  if (npbLabel.includes("阪急")) return "阪急"
  if (npbLabel.includes("オリックス")) return "オリックス"
  if (npbLabel.includes("毎日")) return "毎日"
  if (npbLabel.includes("東京オリオンズ")) return "東京"
  if (npbLabel.includes("千葉マリーンズ")) return "千葉"
  if (npbLabel.includes("ロッテ") || npbLabel.includes("マリーン") || npbLabel.includes("オリオン"))
    return "ロッテ"
  if (npbLabel.includes("日拓")) return "日拓"
  if (npbLabel.includes("東映")) return "東映"
  if (npbLabel.includes("東急")) return "東急"
  if (npbLabel.includes("日本ハム") || npbLabel.includes("ニッポーハム")) return "日本ハム"
  if (npbLabel.includes("ブレーブ")) return "ブレーブ"
  if (npbLabel.includes("フライヤーズ")) return "フライヤーズ"
  if (npbLabel.includes("国鉄")) return "国鉄"
  if (npbLabel.includes("サンケイ")) return "サンケイ"
  if (npbLabel.includes("ヤクルト")) return "ヤクルト"
  if (npbLabel.includes("アトム")) return "アトムズ"
  if (npbLabel.includes("楽天")) return "楽天"
  if (npbLabel.includes("読売")) return "読売"
  if (npbLabel.includes("巨人")) return "巨人"
  if (npbLabel.includes("大阪タイガース")) return "大阪"
  if (npbLabel.includes("阪神") || npbLabel.includes("阪急タイガ")) return "阪神"
  if (npbLabel.includes("中部日本")) return "中部日本"
  if (npbLabel.includes("名古屋金鯱")) return "金鯱"
  if (npbLabel.includes("名古屋")) return "名古屋"
  if (npbLabel.includes("中日") || npbLabel.includes("ドラゴン")) return "中日"
  if (npbLabel.includes("広島") || npbLabel.includes("カープ")) return "広島"
  if (npbLabel.includes("西日本")) return "西日本"
  if (npbLabel.includes("大映")) return "大映"
  if (npbLabel.includes("スターズ")) return "スターズ"
  if (npbLabel.includes("ユニオンズ")) return "ユニオンズ"
  if (npbLabel.includes("セネタース")) return "セネタース"
  if (npbLabel.includes("ヒルマンズ")) return "ヒルマンズ"
  if (npbLabel.includes("黒鷲")) return "黒鷲"
  if (npbLabel.includes("パシフィック")) return "パシフィック"
  if (npbLabel.includes("ライオン")) return "ライオン"
  if (npbLabel.includes("トンボ")) return "トンボ"
  if (npbLabel.includes("高橋")) return "高橋"
  if (npbLabel.includes("急映")) return "急映"
  if (npbLabel.includes("近畿日本")) return "近畿日本"
  if (npbLabel.includes("軍")) return npbLabel.replace(/軍$/, "")
  if (npbLabel.includes("スワロー")) return "スワローズ"
  return teamDisplayNameFromCode(code)
}

/** raw JSON 走査用: 未マップの team 原文一覧 */
export function auditNpbYearlyTeamLabels(labels: string[]): {
  mapped: string[];
  unmapped: string[];
  ignored: string[];
} {
  const uniqueLabels = Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean))
  );

  const mapped: string[] = [];
  const unmapped: string[] = [];
  const ignored: string[] = [];

  for (const label of uniqueLabels) {
    if (NPB_YEARLY_NON_TEAM_LABELS.has(label)) {
      ignored.push(label);
      continue;
    }

    if (resolveNpbYearlyTeamCode(label)) {
      mapped.push(label);
    } else {
      unmapped.push(label);
    }
  }

  return { mapped, unmapped, ignored };
}


export const CL_TEAM_SHORTS = ["巨人", "阪神", "中日", "広島", "DeNA", "ヤクルト"] as const
export const PL_TEAM_SHORTS = ["オリックス", "ロッテ", "日本ハム", "楽天", "西武", "ソフトバンク"] as const

const CL_TEAM_SHORT_SET = new Set<string>(CL_TEAM_SHORTS)
const PL_TEAM_SHORT_SET = new Set<string>(PL_TEAM_SHORTS)

/** canonical スコアボード表記 → 順位表集計用略称（巨人・DeNA 等） */
export function teamRankingShortFromGameTeamName(teamName: string): string {
  const t = String(teamName ?? "").trim()
  if (!t) return ""
  if (CL_TEAM_SHORT_SET.has(t) || PL_TEAM_SHORT_SET.has(t)) return t
  const code = teamCodeFromShort(t)
  return TEAM_CODE_TO_SHORT[code] ?? t
}

/** 集計用チーム略称からリーグ（CL/PL）を導出。クライアント安全。 */
export function leagueFromTeamShort(short: string): "CL" | "PL" {
  const t = String(short ?? "").trim()
  if (!t) return "CL"
  return CL_TEAM_SHORT_SET.has(t) ? "CL" : "PL"
}

export function teamCodeFromShort(short: string): string {
  const t = String(short ?? "").trim()
  if (TEAM_SHORT_TO_CODE[t]) return TEAM_SHORT_TO_CODE[t]
  for (const [name, code] of Object.entries(TEAM_SHORT_TO_CODE)) {
    if (t.includes(name) || name.includes(t)) return code
  }
  return t
}

export function teamShortFromCode(code: string): string {
  return TEAM_CODE_TO_SHORT[code] ?? code
}

/**
 * 個人ページ「チーム別の対戦成績」（SeasonStatsPilot TEAM_ORDER）と同じ表記。
 */
export const TEAM_CODE_TO_DISPLAY: Record<string, string> = {
  H: "阪神",
  G: "巨人",
  DB: "DeNA",
  C: "広島",
  D: "中日",
  S: "ヤクルト",
  Bs: "オリックス",
  M: "ロッテ",
  F: "日本ハム",
  E: "楽天",
  L: "西武",
  Hs: "ソフトバンク",
}

const TEAM_SHORT_TO_DISPLAY: Record<string, string> = {
  DeNA: "DeNA",
  "ＤｅＮＡ": "DeNA",
}

function normalizeTeamNameForMatch(name: string): string {
  return String(name ?? "")
    .replace(/^vs_/, "")
    .replace(/\s+/g, "")
    .trim()
}

function resolvedTeamCodeForMatch(name: string): string {
  const normalized = normalizeTeamNameForMatch(name)
  if (!normalized) return ""
  return teamCodeFromShort(normalized)
}

/** 個人ページの球団別表で使う表示名（DB は「横浜」）。 */
export function playerVsTeamDisplayName(teamName: string): string {
  const normalized = normalizeTeamNameForMatch(teamName)
  if (!normalized) return ""
  const code = resolvedTeamCodeForMatch(normalized)
  return TEAM_CODE_TO_DISPLAY[code] ?? TEAM_SHORT_TO_DISPLAY[normalized] ?? normalized
}

/** 正式名・略称・vs_* を球団コードで突合する。 */
export function playerVsTeamNamesMatch(displayTeam: string, sourceTeamName: string): boolean {
  const displayCode = resolvedTeamCodeForMatch(displayTeam)
  const sourceCode = resolvedTeamCodeForMatch(sourceTeamName)
  if (displayCode && sourceCode && TEAM_CODE_TO_DISPLAY[displayCode] && TEAM_CODE_TO_DISPLAY[sourceCode]) {
    return displayCode === sourceCode
  }
  const display = playerVsTeamDisplayName(displayTeam)
  const source = playerVsTeamDisplayName(sourceTeamName)
  return display !== "" && source !== "" && display === source
}

/** 順位表など狭い列向けの英字球団名（NPB 公式英字表記の愛称部分） */
export const TEAM_CODE_TO_ROMAN: Record<string, string> = {
  H: "Tigers",
  G: "Giants",
  DB: "BayStars",
  C: "Carp",
  D: "Dragons",
  S: "Swallows",
  Bs: "Buffaloes",
  M: "Marines",
  F: "Fighters",
  E: "Eagles",
  L: "Lions",
  Hs: "Hawks",
}

/** 順位表 JSON の `team`（球団コード）から表示名 */
export function teamDisplayNameFromCode(code: string): string {
  const c = String(code ?? "").trim()
  return TEAM_CODE_TO_DISPLAY[c] ?? c
}

/** 順位表行の表示名。歴史データは `npbLabel` から当時の略称を優先する。 */
export function teamDisplayNameFromStandingRow(row: {
  team: string
  teamName?: string | null
  npbLabel?: string | null
}): string {
  const historical = String(row.npbLabel ?? "").trim()
  if (historical) return teamHistoricalDisplayName(historical, row.team)
  const fallback = String(row.teamName ?? "").trim()
  if (fallback) return fallback
  return teamDisplayNameFromCode(row.team)
}

/** 順位表 JSON の `team`（球団コード）から英字球団名 */
export function teamRomanNameFromCode(code: string): string {
  const c = String(code ?? "").trim()
  return TEAM_CODE_TO_ROMAN[c] ?? c
}

/** 個人ページの球団別表で使う表示名（横浜など）から英字球団名を返す。 */
export function playerVsTeamRomanName(teamName: string): string {
  const normalized = normalizeTeamNameForMatch(teamName)
  if (!normalized) return ""
  if (TEAM_CODE_TO_ROMAN[normalized]) return TEAM_CODE_TO_ROMAN[normalized]
  const code = resolvedTeamCodeForMatch(normalized)
  return TEAM_CODE_TO_ROMAN[code] ?? ""
}

/** 集計用内部略称から表示名 */
export function teamDisplayNameFromShort(short: string): string {
  const s = String(short ?? "").trim()
  if (TEAM_SHORT_TO_DISPLAY[s]) return TEAM_SHORT_TO_DISPLAY[s]
  const code = teamCodeFromShort(s)
  return TEAM_CODE_TO_DISPLAY[code] ?? s
}
