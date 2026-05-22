/**
 * 規定打席（PA）フィルタリングに関する定数と関数
 * 指標ごとに「規定打席到達が必要 / 不要」を分類
 *
 * 仕分け方針（2024年以前のランキングページと同様）:
 * - 規定打席「必要」: 率・割合・指標系（OPS, 打率, 出塁率, 長打率, IsoP, IsoD, BB%, K%, BB/K, RC, XR, BABIP, SecA, TA, NOI, GPA）
 * - 規定打席「不要」: カウント系（安打, 本塁打, 打点, 試合, 打席, 打数, 単打, 二塁打, 三塁打, 得点, 四球, 敬遠, 死球, 三振, 塁打, 盗塁, 盗塁死, 犠打, 犠飛, 併殺打）
 *
 * Phase 4（後方互換）: 規定用CSVからビルドしたJSONは既に規定到達者のみのため、Client側のフィルタは実質 no-op。
 * 従来ビルドのJSON（全員入り）の場合はフィルタが効き正しく表示される。フィルタを残すことで後方互換を確保。
 * 詳細: docs/ranking_qualifying_filter_phase4.md
 */

/**
 * 規定打席到達が必要な指標（率・割合・指標系）
 * 少サンプルの上振れを除外するため、規定打席フィルタを適用
 */
export const METRICS_REQUIRE_QUALIFYING_PA = new Set([
  "ops",
  "avg",
  "obp",
  "slg",
  "isop",
  "isod",
  "bbpct",
  "kpct",
  "bbk",
  "rc",
  "xr",
  "babip",
  "seca",
  "ta",
  "noi",
  "gpa",
]);

/**
 * 規定打席到達が不要な指標（カウント系）
 * 通算量のランキングのため、規定打席フィルタを適用しない
 */
export const METRICS_NO_QUALIFYING_PA = new Set([
  "hits",
  "hr",
  "rbi",
  "games",
  "pa",
  "ab",
  "singles",
  "doubles",
  "triples",
  "runs",
  "bb",
  "ibb",
  "hbp",
  "so",
  "tb",
  "sb",
  "cs",
  "sh",
  "sf",
  "gidp",
]);

/**
 * metric_map.json の値（例: bbPct, kPct）と Set 内の小文字キーを一致させる正規化
 */
function normalizeMetricKeyForPA(metricKey: string): string {
  let key = metricKey.toLowerCase().trim();
  // % を pct に統一（BB% → bbpct, K% → kpct）
  key = key.replace(/%/g, "pct").replace(/\//g, "").replace(/-/g, "");
  return key;
}

/**
 * 指標キーに対して規定打席が必要かどうかを判定
 * @param metricKey 指標の内部キー（metric_map.json の値や Record.csv のラベル由来）
 * @returns 規定打席が必要な場合はtrue、不要な場合はfalse
 */
/**
 * チーム試合数から規定打席を算出（動的規定・ランキング JSON 用）。
 * 静的 `calculateMinPA(year, league)` と端数処理を揃える。
 */
export function minPAFromTeamGames(teamGames: number, year: string): number {
  if (!Number.isFinite(teamGames) || teamGames <= 0) return 0
  const calculatedPA = teamGames * 3.1
  const yearNum = parseInt(year, 10)
  if (Number.isFinite(yearNum) && yearNum >= 2009) {
    return Math.round(calculatedPA)
  }
  return Math.floor(calculatedPA)
}

export function shouldRequireQualifyingPA(metricKey: string): boolean {
  const normalizedKey = normalizeMetricKeyForPA(metricKey);
  
  // デバッグログ（開発時のみ）
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[QualifyingPA] Checking metric:", {
      original: metricKey,
      normalized: normalizedKey,
      inRequireSet: METRICS_REQUIRE_QUALIFYING_PA.has(normalizedKey),
      inNoRequireSet: METRICS_NO_QUALIFYING_PA.has(normalizedKey),
    });
  }
  
  if (METRICS_REQUIRE_QUALIFYING_PA.has(normalizedKey)) {
    return true;
  }
  
  if (METRICS_NO_QUALIFYING_PA.has(normalizedKey)) {
    return false;
  }
  
  // 未知の指標: 規定未到達でも掲載する（規定不要として扱う）
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.warn(
      `[QualifyingPA] Unknown metricKey: ${metricKey} (normalized: ${normalizedKey}). ` +
        `Treating as NO_QUALIFYING_PA (all players shown). ` +
        `Add to METRICS_REQUIRE_QUALIFYING_PA or METRICS_NO_QUALIFYING_PA in lib/ranking/qualifyingPA.ts if needed.`
    );
  }
  return false;
}

/**
 * 年度・リーグごとの試合数データ
 * 主要な年度の試合数を記録（不足分は推定値を使用）
 */
const TEAM_GAMES_DATA: Record<string, Record<string, number>> = {
  // 1950年代
  '1950': { CL: 120, PL: 120 },
  '1951': { CL: 120, PL: 120 },
  '1952': { CL: 120, PL: 120 }, // パ・リーグは一部121試合もあるが、代表値として120
  '1953': { CL: 130, PL: 130 },
  '1954': { CL: 130, PL: 130 },
  '1955': { CL: 130, PL: 130 },
  '1956': { CL: 130, PL: 130 },
  '1957': { CL: 130, PL: 132 },
  '1958': { CL: 130, PL: 130 }, // パ・リーグが130試合に統一
  '1959': { CL: 130, PL: 130 },
  
  // 1960年代
  '1960': { CL: 130, PL: 130 },
  '1961': { CL: 130, PL: 140 }, // パ・リーグ全6チーム140試合
  '1962': { CL: 130, PL: 130 },
  '1963': { CL: 130, PL: 150 }, // パ・リーグ150試合
  '1964': { CL: 140, PL: 150 }, // パ・リーグ150試合
  '1965': { CL: 140, PL: 140 },
  '1966': { CL: 140, PL: 130 }, // パ・リーグ130試合
  '1967': { CL: 140, PL: 130 }, // パ・リーグ130試合
  '1968': { CL: 140, PL: 130 }, // パ・リーグ130試合
  '1969': { CL: 130, PL: 130 },
  
  // 1970年代
  '1970': { CL: 130, PL: 130 },
  '1971': { CL: 130, PL: 130 },
  '1972': { CL: 130, PL: 130 },
  '1973': { CL: 130, PL: 130 },
  '1974': { CL: 130, PL: 130 },
  '1975': { CL: 130, PL: 130 },
  '1976': { CL: 130, PL: 130 },
  '1977': { CL: 130, PL: 130 },
  '1978': { CL: 130, PL: 130 },
  '1979': { CL: 130, PL: 130 },
  
  // 1980年代
  '1980': { CL: 130, PL: 130 },
  '1981': { CL: 130, PL: 130 },
  '1982': { CL: 130, PL: 130 },
  '1983': { CL: 130, PL: 130 },
  '1984': { CL: 130, PL: 130 },
  '1985': { CL: 130, PL: 130 },
  '1986': { CL: 130, PL: 130 },
  '1987': { CL: 130, PL: 130 },
  '1988': { CL: 130, PL: 130 },
  '1989': { CL: 130, PL: 130 },
  
  // 1990年代
  '1990': { CL: 130, PL: 130 },
  '1991': { CL: 130, PL: 130 },
  '1992': { CL: 130, PL: 130 },
  '1993': { CL: 130, PL: 130 },
  '1994': { CL: 130, PL: 130 },
  '1995': { CL: 130, PL: 130 },
  '1996': { CL: 130, PL: 130 },
  '1997': { CL: 135, PL: 135 },
  '1998': { CL: 135, PL: 135 },
  '1999': { CL: 135, PL: 135 },
  
  // 2000年代
  '2000': { CL: 135, PL: 135 },
  '2001': { CL: 140, PL: 140 },
  '2002': { CL: 140, PL: 140 },
  '2003': { CL: 140, PL: 140 },
  '2004': { CL: 138, PL: 138 }, // ストライキにより2試合未消化
  '2005': { CL: 146, PL: 146 },
  '2006': { CL: 146, PL: 146 },
  '2007': { CL: 144, PL: 144 },
  '2008': { CL: 144, PL: 144 },
  '2009': { CL: 144, PL: 144 },
  
  // 2010年代
  '2010': { CL: 144, PL: 144 },
  '2011': { CL: 144, PL: 144 },
  '2012': { CL: 144, PL: 144 },
  '2013': { CL: 144, PL: 144 },
  '2014': { CL: 144, PL: 144 },
  '2015': { CL: 143, PL: 143 },
  '2016': { CL: 143, PL: 143 },
  '2017': { CL: 143, PL: 143 },
  '2018': { CL: 143, PL: 143 },
  '2019': { CL: 143, PL: 143 },
  
  // 2020年代（2025年は2024年以前と同じ試合数で踏襲）
  '2020': { CL: 120, PL: 120 }, // コロナ禍により短縮
  '2021': { CL: 143, PL: 143 },
  '2022': { CL: 143, PL: 143 },
  '2023': { CL: 143, PL: 143 },
  '2024': { CL: 143, PL: 143 },
  '2025': { CL: 143, PL: 143 },
  '2026': { CL: 143, PL: 143 }, // 2025年データを流用
}

/**
 * 年度・リーグごとの試合数を取得
 * 
 * @param year 年度（例: "1972"）
 * @param league リーグ（"PL" | "CL"）
 * @returns 試合数（取得できない場合は推定値）
 */
function getTeamGames(year: string, league: string): number {
  const upperLeague = league.toUpperCase() as 'CL' | 'PL'
  const yearData = TEAM_GAMES_DATA[year]
  
  if (yearData && yearData[upperLeague]) {
    return yearData[upperLeague]
  }
  
  // データがない場合は、年度に応じた推定値を使用
  const yearNum = parseInt(year, 10)
  
  if (yearNum >= 2021) {
    return 143
  } else if (yearNum === 2020) {
    return 120
  } else if (yearNum >= 2015) {
    return 143
  } else if (yearNum >= 2005) {
    return 146
  } else if (yearNum >= 2001) {
    return 140
  } else if (yearNum >= 1997) {
    return 135
  } else if (yearNum >= 1964 && yearNum <= 1968) {
    return 140
  } else if (yearNum >= 1958) {
    return 130
  } else if (yearNum >= 1950) {
    return 120
  }
  
  // デフォルト値
  return 130
}

/**
 * 1950-1958年の規定打数（AB）ルール
 * 1952年は除外（別ルールがあるため）
 */
type ABRule = 
  | { type: 'fixed', value: number }  // 固定値
  | { type: 'calculated', formula: string, multiplier: number }  // 計算式（例: teamGames * 3.1）
  | { type: 'team_specific', value: number }  // チーム別ルール（1951年・1952年パ・リーグなど）

const AB_RULES_1950_1958: Record<string, Record<string, ABRule>> = {
  '1950': {
    CL: { type: 'fixed', value: 300 },
    PL: { type: 'fixed', value: 300 },
  },
  '1951': {
    CL: { type: 'fixed', value: 280 },
    PL: { type: 'team_specific', value: 0 }, // チーム別ルール（PL_1951_TEAM_AB_THRESHOLDを使用）
  },
  '1953': {
    CL: { type: 'fixed', value: 325 },
    PL: { type: 'fixed', value: 300 },
  },
  '1954': {
    CL: { type: 'fixed', value: 338 },
    PL: { type: 'fixed', value: 360 },
  },
  '1955': {
    CL: { type: 'fixed', value: 335 },
    PL: { type: 'fixed', value: 360 },
  },
  '1956': {
    CL: { type: 'fixed', value: 338 },
    PL: { type: 'fixed', value: 400 },
  },
  '1957': {
    CL: { type: 'calculated', formula: 'teamGames * 3.1', multiplier: 3.1 },
    PL: { type: 'calculated', formula: 'teamGames * 3.1', multiplier: 3.1 },
  },
  '1958': {
    CL: { type: 'fixed', value: 400 },
    PL: { type: 'fixed', value: 400 },
  },
}

/**
 * 1950年セ・リーグの追加条件: 試合数 >= 100
 * 1950年パ・リーグはAB >= 300のみ（試合数条件なし）
 */
const MIN_GAMES_1950_CL = 100

/**
 * 1950-1958年の規定打数（AB）を取得
 * @param year 年度（"1950" | "1951" | "1953" | ... | "1958"）
 * @param league リーグ（"CL" | "PL"）
 * @returns 規定打数（AB）
 */
function get1950_1958AB(year: string, league: string, team?: string): number {
  const upperLeague = league.toUpperCase() as 'CL' | 'PL'
  const rule = AB_RULES_1950_1958[year]?.[upperLeague]
  
  if (!rule) {
    // ルールがない場合はデフォルト計算式を使用
    const teamGames = getTeamGames(year, league)
    return Math.floor(teamGames * 3.1)
  }
  
  if (rule.type === 'fixed') {
    return rule.value
  } else if (rule.type === 'team_specific') {
    // 1951年パ・リーグ: チーム別規定打数を使用
    if (year === '1951' && upperLeague === 'PL' && team) {
      return get1951PLTeamAB(team)
    }
    // フォールバック: デフォルト計算式を使用
    const teamGames = getTeamGames(year, league)
    return Math.floor(teamGames * 3.1)
  } else {
    // calculated
    const teamGames = getTeamGames(year, league)
    const calculated = teamGames * rule.multiplier
    // 1950-1958年は切り捨て
    return Math.floor(calculated)
  }
}

/**
 * 1951年パ・リーグのチーム別規定打数（AB）マッピング
 * チーム別試合数 × 2.5（切り捨て）に基づく規定打数：
 * - 南海ホークス（104試合） → 260打数
 * - 西鉄ライオンズ（105試合） → 262打数
 * - 毎日オリオンズ（110試合） → 275打数
 * - 大映スターズ（101試合） → 252打数
 * - 阪急ブレーブス（96試合） → 240打数
 * - 東急フライヤーズ（102試合） → 255打数
 * - 近鉄パールス（98試合） → 245打数
 * 
 * 1951年当時のチーム名 → CSVの現在のチーム名の対応：
 * - 南海ホークス → 福岡ソフトバンクホークス
 * - 西鉄ライオンズ → 埼玉西武ライオンズ
 * - 毎日オリオンズ → 千葉ロッテマリーンズ
 * - 大映スターズ → （データなし、252打数として扱う）
 * - 阪急ブレーブス → オリックス・バファローズ
 * - 東急フライヤーズ → 北海道日本ハムファイターズ
 * - 近鉄パールス → 近鉄バファローズ
 */
const PL_1951_TEAM_AB_THRESHOLD: Record<string, number> = {
  '福岡ソフトバンクホークス': 260, // 南海ホークス（104試合 × 2.5 = 260）
  '埼玉西武ライオンズ': 262,        // 西鉄ライオンズ（105試合 × 2.5 = 262.5 → 262）
  '千葉ロッテマリーンズ': 275,      // 毎日オリオンズ（110試合 × 2.5 = 275）
  'オリックス・バファローズ': 240,  // 阪急ブレーブス（96試合 × 2.5 = 240）
  '北海道日本ハムファイターズ': 255, // 東急フライヤーズ（102試合 × 2.5 = 255）
  '近鉄バファローズ': 245,          // 近鉄パールス（98試合 × 2.5 = 245）
}

/**
 * 1952年パ・リーグのチーム別規定打数（AB）マッピング
 * 順位に基づく規定打数：
 * - 上位4球団（1-4位）: 300打数
 * - 下位3球団（5-7位）: 270打数
 * 
 * 1952年当時のチーム名 → CSVの現在のチーム名の対応：
 * - 南海ホークス（1位） → 福岡ソフトバンクホークス
 * - 毎日オリオンズ（2位） → 千葉ロッテマリーンズ
 * - 西鉄ライオンズ（3位） → 埼玉西武ライオンズ
 * - 大映スターズ（4位） → （データなし、300打数として扱う）
 * - 阪急ブレーブス（5位） → オリックス・バファローズ
 * - 東急フライヤーズ（6位） → 北海道日本ハムファイターズ
 * - 近鉄パールス（7位） → 近鉄バファローズ
 */
const PL_1952_TEAM_AB_THRESHOLD: Record<string, number> = {
  '福岡ソフトバンクホークス': 300, // 南海ホークス（1位）
  '千葉ロッテマリーンズ': 300,      // 毎日オリオンズ（2位）
  '埼玉西武ライオンズ': 300,        // 西鉄ライオンズ（3位）
  'オリックス・バファローズ': 270,  // 阪急ブレーブス（5位）
  '北海道日本ハムファイターズ': 270, // 東急フライヤーズ（6位）
  '近鉄バファローズ': 270,          // 近鉄パールス（7位）
}

/**
 * 1951年パ・リーグのチーム別規定打数を取得
 * @param team チーム名（CSVの現在のチーム名）
 * @returns 規定打数（AB）、見つからない場合は252（大映スターズのデフォルト値）
 */
function get1951PLTeamAB(team: string): number {
  return PL_1951_TEAM_AB_THRESHOLD[team] ?? 252
}

/**
 * 1952年パ・リーグのチーム別規定打数を取得
 * @param team チーム名（CSVの現在のチーム名）
 * @returns 規定打数（AB）、見つからない場合は300（上位4球団のデフォルト値）
 */
function get1952PLTeamAB(team: string): number {
  return PL_1952_TEAM_AB_THRESHOLD[team] ?? 300
}

/**
 * 1966年パ・リーグのチーム別規定打席（PA）マッピング
 * チーム別試合数 × 3.1（切り捨て）に基づく規定打席：
 * - 南海ホークス（133試合） → 412打席
 * - 西鉄ライオンズ（138試合） → 427打席
 * - 東映フライヤーズ（136試合） → 421打席
 * - 東京オリオンズ（134試合） → 415打席
 * - 阪急ブレーブス（134試合） → 415打席
 * - 近鉄バファローズ（133試合） → 412打席
 * 
 * 1966年当時のチーム名 → CSVの現在のチーム名の対応：
 * - 南海ホークス → 福岡ソフトバンクホークス
 * - 西鉄ライオンズ → 埼玉西武ライオンズ
 * - 東映フライヤーズ → 北海道日本ハムファイターズ
 * - 東京オリオンズ → 千葉ロッテマリーンズ
 * - 阪急ブレーブス → オリックス・バファローズ
 * - 近鉄バファローズ → 近鉄バファローズ
 */
const PL_1966_TEAM_PA_THRESHOLD: Record<string, number> = {
  '福岡ソフトバンクホークス': 412, // 南海ホークス（133試合 × 3.1 = 412.3 → 412）
  '埼玉西武ライオンズ': 427,        // 西鉄ライオンズ（138試合 × 3.1 = 427.8 → 427）
  '北海道日本ハムファイターズ': 421, // 東映フライヤーズ（136試合 × 3.1 = 421.6 → 421）
  '千葉ロッテマリーンズ': 415,      // 東京オリオンズ（134試合 × 3.1 = 415.4 → 415）
  'オリックス・バファローズ': 415,  // 阪急ブレーブス（134試合 × 3.1 = 415.4 → 415）
  '近鉄バファローズ': 412,          // 近鉄バファローズ（133試合 × 3.1 = 412.3 → 412）
}

/**
 * 1967年パ・リーグのチーム別規定打席（PA）マッピング
 * チーム別試合数 × 3.1（切り捨て）に基づく規定打席：
 * - 南海ホークス（133試合） → 412打席
 * - 西鉄ライオンズ（140試合） → 434打席
 * - 東映フライヤーズ（134試合） → 415打席
 * - 東京オリオンズ（137試合） → 424打席
 * - 阪急ブレーブス（134試合） → 415打席
 * - 近鉄バファローズ（132試合） → 409打席
 * 
 * 1967年当時のチーム名 → CSVの現在のチーム名の対応：
 * - 南海ホークス → 福岡ソフトバンクホークス
 * - 西鉄ライオンズ → 埼玉西武ライオンズ
 * - 東映フライヤーズ → 北海道日本ハムファイターズ
 * - 東京オリオンズ → 千葉ロッテマリーンズ
 * - 阪急ブレーブス → オリックス・バファローズ
 * - 近鉄バファローズ → 近鉄バファローズ
 */
const PL_1967_TEAM_PA_THRESHOLD: Record<string, number> = {
  '福岡ソフトバンクホークス': 412, // 南海ホークス（133試合 × 3.1 = 412.3 → 412）
  '埼玉西武ライオンズ': 434,        // 西鉄ライオンズ（140試合 × 3.1 = 434.0 → 434）
  '北海道日本ハムファイターズ': 415, // 東映フライヤーズ（134試合 × 3.1 = 415.4 → 415）
  '千葉ロッテマリーンズ': 424,      // 東京オリオンズ（137試合 × 3.1 = 424.7 → 424）
  'オリックス・バファローズ': 415,  // 阪急ブレーブス（134試合 × 3.1 = 415.4 → 415）
  '近鉄バファローズ': 409,          // 近鉄バファローズ（132試合 × 3.1 = 409.2 → 409）
}

/**
 * 1966年パ・リーグのチーム別規定打席を取得
 * @param team チーム名（CSVの現在のチーム名）
 * @returns 規定打席（PA）、見つからない場合は412（デフォルト値）
 */
function get1966PLTeamPA(team: string): number {
  return PL_1966_TEAM_PA_THRESHOLD[team] ?? 412
}

/**
 * 1967年パ・リーグのチーム別規定打席を取得
 * @param team チーム名（CSVの現在のチーム名）
 * @returns 規定打席（PA）、見つからない場合は409（デフォルト値）
 */
function get1967PLTeamPA(team: string): number {
  return PL_1967_TEAM_PA_THRESHOLD[team] ?? 409
}

/**
 * 1950-1958年（1952年除く）の年度・リーグで規定打数（AB）を使用するかどうか
 */
function usesABFor1950_1958(year: string): boolean {
  const yearNum = parseInt(year, 10)
  return yearNum >= 1950 && yearNum <= 1958 && yearNum !== 1952
}

/**
 * 規定打席（minPA）を計算
 * リーグ・年度の公式ルールに合わせて計算（例: teamGames * 3.1）
 * 
 * npb_regulation_table.csvの情報に基づき：
 * - 計算式: チーム試合数×3.1（1950年以降すべて）
 * - 端数処理: 2008年まで切り捨て、2009年以降四捨五入
 * 
 * 特別ルール：
 * - 1950-1958年（1951・1952・1957年パ・リーグ・1958年パ・リーグ除く）: 規定打数（AB）を使用
 * - 1952年パ・リーグ: チーム別規定打数（AB）を使用（順位に基づく）
 * - 1957年パ・リーグ: 規定打席（PA）チーム試合数×3.1（全6チーム132試合→409打席）
 * - 1958年パ・リーグ: 規定打席（PA）400打席
 * - 1966年パ・リーグ: チーム別規定打席（PA）を使用（チーム別試合数×3.1）
 * - 1967年パ・リーグ: チーム別規定打席（PA）を使用（チーム別試合数×3.1）
 * 
 * @param year 年度（例: "2025"）
 * @param league リーグ（"PL" | "CL"）
 * @param team チーム名（1952年パ・リーグの場合のみ使用）
 * @returns 規定打席数（1950-1958年と1952年パ・リーグの場合は規定打数（AB）を返す）
 */
export function calculateMinPA(year: string, league: string, team?: string): number {
  // 1967年パ・リーグの特別ルール: チーム別規定打席（PA）を使用
  if (year === '1967' && league.toUpperCase() === 'PL' && team) {
    return get1967PLTeamPA(team)
  }
  
  // 1966年パ・リーグの特別ルール: チーム別規定打席（PA）を使用
  if (year === '1966' && league.toUpperCase() === 'PL' && team) {
    return get1966PLTeamPA(team)
  }
  
  // 1952年パ・リーグの特別ルール: チーム別規定打数（AB）を使用
  if (year === '1952' && league.toUpperCase() === 'PL' && team) {
    return get1952PLTeamAB(team)
  }
  
  // 1951年パ・リーグの特別ルール: チーム別規定打数（AB）を使用
  if (year === '1951' && league.toUpperCase() === 'PL' && team) {
    return get1951PLTeamAB(team)
  }
  
  // 1958年パ・リーグの特別ルール: 規定打席（PA）400打席
  if (year === '1958' && league.toUpperCase() === 'PL') {
    return 400
  }
  
  // 1950-1958年（1951年・1952年・1957年パ・リーグ・1958年パ・リーグ除く）の特別ルール: 規定打数（AB）を使用
  // 1957年パ・リーグは規定打席（PA）: チーム試合数×3.1（全6チーム132試合）のため一般計算へ
  if (usesABFor1950_1958(year) && !(year === '1957' && league.toUpperCase() === 'PL')) {
    return get1950_1958AB(year, league, team)
  }
  
  // 1. 年度・リーグごとの試合数を取得
  const teamGames = getTeamGames(year, league)
  
  // 2. 計算式に基づいて規定打席を計算
  // npb_regulation_table.csvによると、すべて「チーム試合数×3.1」
  const calculatedPA = teamGames * 3.1
  
  // 3. 端数処理を適用
  // npb_regulation_table.csvの備考欄によると：
  // - 2008年まで: 小数点以下の端数切り捨て
  // - 2009年以降: 四捨五入
  const yearNum = parseInt(year, 10)
  let minPA: number
  
  if (yearNum >= 2009) {
    // 2009年以降: 四捨五入
    minPA = Math.round(calculatedPA)
  } else {
    // 2008年まで: 切り捨て
    minPA = Math.floor(calculatedPA)
  }
  
  return minPA
}

/**
 * 1950年セ・リーグの追加条件: 試合数 >= 100 を取得
 * 1950年パ・リーグはAB >= 300のみのためnullを返す
 * @param year 年度
 * @param league リーグ（"CL" | "PL"）
 * @returns 最小試合数、該当しない場合はnull
 */
export function get1950MinGames(year: string, league: string): number | null {
  if (year === '1950' && league.toUpperCase() === 'CL') {
    return MIN_GAMES_1950_CL
  }
  return null
}

