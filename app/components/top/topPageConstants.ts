import type { LeadersConfig } from "@/lib/ranking/leadersTypes"

export type { LeadersConfig }

export type StandingRow = {
  pos: number
  name: string
  abbr: string
  w: number
  l: number
  pct: number
  runs: number
  ops: string
  avg: string
  hr: number
  obp: string
  slg: string
  isod: string
  isop: string
  bb_rate_hit: string
  k_rate_hit: string
  bb_k_diff_hit: string
  runs_allowed: number
  era: string
  cg: number
  bb_rate_pitch: string
  k_rate_pitch: string
  k_bb_diff_pitch: string
}

export const teamColors: Record<string, string> = {
  H: "#ffde00",
  G: "#ff6600",
  DB: "#0067c0",
  C: "#d60718",
  D: "#004ea2",
  S: "#2bbb3f",
  Bs: "#b79e51",
  M: "#222",
  F: "#0077c8",
  E: "#7a0019",
  L: "#004098",
  Hs: "#ffdb00",
}

/** パ順位表・今週タブの bebas 数値（細さ・字間） */
export const TOP_PAGE_BEBAS_NUMERIC_CLASS = "bebas tabular-nums font-normal tracking-[-0.01em]"

export const teamRomanNames: Record<string, string> = {
  H: "Hanshin Tigers",
  G: "Yomiuri Giants",
  DB: "Yokohama DeNA BayStars",
  C: "Hiroshima Toyo Carp",
  D: "Chunichi Dragons",
  S: "Tokyo Yakult Swallows",
  Bs: "Orix Buffaloes",
  M: "Chiba Lotte Marines",
  F: "Hokkaido Nippon-Ham Fighters",
  E: "Tohoku Rakuten Golden Eagles",
  L: "Saitama Seibu Lions",
  Hs: "Fukuoka SoftBank Hawks",
}

export const playerRomanNames: Record<string, string> = {
  佐藤輝明: "Sato Teruaki",
  岡本和真: "Okamoto Kazuma",
  村上宗隆: "Murakami Munetaka",
  近本光司: "Chikamoto Koji",
  牧秀悟: "Maki Shugo",
  佐野恵太: "Sano Keita",
  青柳晃洋: "Aoyagi Koyo",
  菅野智之: "Sugano Tomoyuki",
  大野雄大: "Ono Yudai",
  岩崎優: "Iwasaki Yu",
  伊勢大夢: "Ise Hiromu",
  石田健大: "Ishida Kenta",
  戸郷翔征: "Togou Shosei",
  山川穂高: "Yamakawa Hotaka",
  吉田正尚: "Yoshida Masataka",
  中村晃: "Nakamura Akira",
  源田壮亮: "Genda Sosuke",
  柳田悠岐: "Yanagita Yuki",
  浅村栄斗: "Asamura Hideto",
  周東佑京: "Shuto Ukyo",
  山本由伸: "Yamamoto Yoshinobu",
  千賀滉大: "Senga Kodai",
  佐々木朗希: "Sasaki Roki",
  宮城大弥: "Miyagi Hiroya",
  森唯斗: "Mori Yuito",
  益田直也: "Masuda Naoya",
}

export const battersCL: LeadersConfig = {
  top3Metrics: ["OPS", "AVG", "HR"],
  miniMetrics: ["出塁率", "長打率", "打点", "安打", "盗塁"],
  leaders: {
    OPS: [
      { rank: 1, name: "佐藤輝明", team: "H", teamName: "阪神", value: "1.052" },
      { rank: 2, name: "岡本和真", team: "G", teamName: "巨人", value: "1.015" },
      { rank: 3, name: "村上宗隆", team: "S", teamName: "ヤクルト", value: "0.998" },
    ],
    AVG: [
      { rank: 1, name: "近本光司", team: "H", teamName: "阪神", value: ".342" },
      { rank: 2, name: "牧秀悟", team: "DB", teamName: "DeNA", value: ".338" },
      { rank: 3, name: "佐野恵太", team: "DB", teamName: "DeNA", value: ".325" },
    ],
    HR: [
      { rank: 1, name: "村上宗隆", team: "S", teamName: "ヤクルト", value: 48 },
      { rank: 2, name: "岡本和真", team: "G", teamName: "巨人", value: 45 },
      { rank: 3, name: "佐藤輝明", team: "H", teamName: "阪神", value: 42 },
    ],
    出塁率: [{ rank: 1, name: "村上宗隆", team: "S", teamName: "ヤクルト", value: ".425" }],
    長打率: [{ rank: 1, name: "佐藤輝明", team: "H", teamName: "阪神", value: ".648" }],
    打点: [{ rank: 1, name: "岡本和真", team: "G", teamName: "巨人", value: 125 }],
    安打: [{ rank: 1, name: "近本光司", team: "H", teamName: "阪神", value: 198 }],
    盗塁: [{ rank: 1, name: "近本光司", team: "H", teamName: "阪神", value: 52 }],
  },
}

export const pitchersCL: LeadersConfig = {
  top3Metrics: ["最多勝", "防御率", "セーブ"],
  miniMetrics: ["奪三振", "WHIP", "勝率", "完投", "投球回"],
  leaders: {
    最多勝: [
      { rank: 1, name: "青柳晃洋", team: "H", teamName: "阪神", value: 16 },
      { rank: 2, name: "菅野智之", team: "G", teamName: "巨人", value: 15 },
      { rank: 3, name: "大野雄大", team: "D", teamName: "中日", value: 14 },
    ],
    防御率: [
      { rank: 1, name: "青柳晃洋", team: "H", teamName: "阪神", value: "1.85" },
      { rank: 2, name: "大野雄大", team: "D", teamName: "中日", value: "2.05" },
      { rank: 3, name: "戸郷翔征", team: "G", teamName: "巨人", value: "2.18" },
    ],
    セーブ: [
      { rank: 1, name: "岩崎優", team: "H", teamName: "阪神", value: 42 },
      { rank: 2, name: "伊勢大夢", team: "DB", teamName: "DeNA", value: 38 },
      { rank: 3, name: "石田健大", team: "S", teamName: "ヤクルト", value: 35 },
    ],
    奪三振: [{ rank: 1, name: "戸郷翔征", team: "G", teamName: "巨人", value: 215 }],
    WHIP: [{ rank: 1, name: "青柳晃洋", team: "H", teamName: "阪神", value: "0.98" }],
    勝率: [{ rank: 1, name: "青柳晃洋", team: "H", teamName: "阪神", value: ".842" }],
    完投: [{ rank: 1, name: "大野雄大", team: "D", teamName: "中日", value: 5 }],
    投球回: [{ rank: 1, name: "青柳晃洋", team: "H", teamName: "阪神", value: "195.2" }],
  },
}

export const battersPL: LeadersConfig = {
  top3Metrics: ["OPS", "AVG", "HR"],
  miniMetrics: ["出塁率", "長打率", "打点", "安打", "盗塁"],
  leaders: {
    OPS: [
      { rank: 1, name: "山川穂高", team: "L", teamName: "西武", value: "1.088" },
      { rank: 2, name: "吉田正尚", team: "Bs", teamName: "オリックス", value: "1.045" },
      { rank: 3, name: "中村晃", team: "Hs", teamName: "ソフトバンク", value: "1.012" },
    ],
    AVG: [
      { rank: 1, name: "吉田正尚", team: "Bs", teamName: "オリックス", value: ".355" },
      { rank: 2, name: "源田壮亮", team: "L", teamName: "西武", value: ".340" },
      { rank: 3, name: "柳田悠岐", team: "Hs", teamName: "ソフトバンク", value: ".332" },
    ],
    HR: [
      { rank: 1, name: "山川穂高", team: "L", teamName: "西武", value: 52 },
      { rank: 2, name: "中村晃", team: "Hs", teamName: "ソフトバンク", value: 46 },
      { rank: 3, name: "浅村栄斗", team: "E", teamName: "楽天", value: 43 },
    ],
    出塁率: [{ rank: 1, name: "吉田正尚", team: "Bs", teamName: "オリックス", value: ".445" }],
    長打率: [{ rank: 1, name: "山川穂高", team: "L", teamName: "西武", value: ".685" }],
    打点: [{ rank: 1, name: "山川穂高", team: "L", teamName: "西武", value: 135 }],
    安打: [{ rank: 1, name: "吉田正尚", team: "Bs", teamName: "オリックス", value: 205 }],
    盗塁: [{ rank: 1, name: "周東佑京", team: "Hs", teamName: "ソフトバンク", value: 65 }],
  },
}

export const pitchersPL: LeadersConfig = {
  top3Metrics: ["最多勝", "防御率", "セーブ"],
  miniMetrics: ["奪三振", "WHIP", "勝率", "完投", "投球回"],
  leaders: {
    最多勝: [
      { rank: 1, name: "山本由伸", team: "Bs", teamName: "オリックス", value: 18 },
      { rank: 2, name: "千賀滉大", team: "Hs", teamName: "ソフトバンク", value: 17 },
      { rank: 3, name: "佐々木朗希", team: "M", teamName: "ロッテ", value: 16 },
    ],
    防御率: [
      { rank: 1, name: "山本由伸", team: "Bs", teamName: "オリックス", value: "1.68" },
      { rank: 2, name: "千賀滉大", team: "Hs", teamName: "ソフトバンク", value: "1.82" },
      { rank: 3, name: "佐々木朗希", team: "M", teamName: "ロッテ", value: "1.95" },
    ],
    セーブ: [
      { rank: 1, name: "宮城大弥", team: "Bs", teamName: "オリックス", value: 45 },
      { rank: 2, name: "森唯斗", team: "Hs", teamName: "ソフトバンク", value: 40 },
      { rank: 3, name: "益田直也", team: "M", teamName: "ロッテ", value: 37 },
    ],
    奪三振: [{ rank: 1, name: "佐々木朗希", team: "M", teamName: "ロッテ", value: 238 }],
    WHIP: [{ rank: 1, name: "山本由伸", team: "Bs", teamName: "オリックス", value: "0.89" }],
    勝率: [{ rank: 1, name: "山本由伸", team: "Bs", teamName: "オリックス", value: ".900" }],
    完投: [{ rank: 1, name: "千賀滉大", team: "Hs", teamName: "ソフトバンク", value: 6 }],
    投球回: [{ rank: 1, name: "山本由伸", team: "Bs", teamName: "オリックス", value: "205.1" }],
  },
}

export const standingsCL: StandingRow[] = [
  {
    pos: 1,
    name: "阪神タイガース",
    abbr: "阪神",
    w: 85,
    l: 58,
    pct: 0.594,
    runs: 725,
    ops: ".785",
    avg: ".275",
    hr: 185,
    obp: ".345",
    slg: ".440",
    isod: ".070",
    isop: ".165",
    bb_rate_hit: "9.8%",
    k_rate_hit: "20.5%",
    bb_k_diff_hit: "-10.7%",
    runs_allowed: 598,
    era: "3.42",
    cg: 12,
    bb_rate_pitch: "7.5%",
    k_rate_pitch: "22.8%",
    k_bb_diff_pitch: "15.3%",
  },
  {
    pos: 2,
    name: "読売ジャイアンツ",
    abbr: "巨人",
    w: 82,
    l: 61,
    pct: 0.573,
    runs: 702,
    ops: ".768",
    avg: ".268",
    hr: 178,
    obp: ".338",
    slg: ".430",
    isod: ".070",
    isop: ".162",
    bb_rate_hit: "9.2%",
    k_rate_hit: "21.3%",
    bb_k_diff_hit: "-12.1%",
    runs_allowed: 612,
    era: "3.58",
    cg: 9,
    bb_rate_pitch: "8.1%",
    k_rate_pitch: "21.5%",
    k_bb_diff_pitch: "13.4%",
  },
  {
    pos: 3,
    name: "横浜DeNAベイスターズ",
    abbr: "DeNA",
    w: 78,
    l: 65,
    pct: 0.545,
    runs: 685,
    ops: ".752",
    avg: ".265",
    hr: 165,
    obp: ".332",
    slg: ".420",
    isod: ".067",
    isop: ".155",
    bb_rate_hit: "8.8%",
    k_rate_hit: "22.1%",
    bb_k_diff_hit: "-13.3%",
    runs_allowed: 625,
    era: "3.68",
    cg: 7,
    bb_rate_pitch: "8.5%",
    k_rate_pitch: "20.8%",
    k_bb_diff_pitch: "12.3%",
  },
  {
    pos: 4,
    name: "広島東洋カープ",
    abbr: "広島",
    w: 75,
    l: 68,
    pct: 0.524,
    runs: 668,
    ops: ".742",
    avg: ".262",
    hr: 158,
    obp: ".328",
    slg: ".414",
    isod: ".066",
    isop: ".152",
    bb_rate_hit: "8.5%",
    k_rate_hit: "22.8%",
    bb_k_diff_hit: "-14.3%",
    runs_allowed: 645,
    era: "3.82",
    cg: 5,
    bb_rate_pitch: "8.8%",
    k_rate_pitch: "20.2%",
    k_bb_diff_pitch: "11.4%",
  },
  {
    pos: 5,
    name: "中日ドラゴンズ",
    abbr: "中日",
    w: 68,
    l: 75,
    pct: 0.476,
    runs: 632,
    ops: ".725",
    avg: ".255",
    hr: 142,
    obp: ".320",
    slg: ".405",
    isod: ".065",
    isop: ".150",
    bb_rate_hit: "8.2%",
    k_rate_hit: "23.5%",
    bb_k_diff_hit: "-15.3%",
    runs_allowed: 665,
    era: "3.95",
    cg: 8,
    bb_rate_pitch: "9.2%",
    k_rate_pitch: "19.8%",
    k_bb_diff_pitch: "10.6%",
  },
  {
    pos: 6,
    name: "東京ヤクルトスワローズ",
    abbr: "ヤクルト",
    w: 62,
    l: 81,
    pct: 0.434,
    runs: 615,
    ops: ".712",
    avg: ".250",
    hr: 138,
    obp: ".315",
    slg: ".397",
    isod: ".065",
    isop: ".147",
    bb_rate_hit: "8.0%",
    k_rate_hit: "24.2%",
    bb_k_diff_hit: "-16.2%",
    runs_allowed: 688,
    era: "4.12",
    cg: 4,
    bb_rate_pitch: "9.5%",
    k_rate_pitch: "19.2%",
    k_bb_diff_pitch: "9.7%",
  },
]

export const standingsPL: StandingRow[] = [
  {
    pos: 1,
    name: "オリックス・バファローズ",
    abbr: "オリックス",
    w: 88,
    l: 55,
    pct: 0.615,
    runs: 755,
    ops: ".812",
    avg: ".282",
    hr: 198,
    obp: ".352",
    slg: ".460",
    isod: ".070",
    isop: ".178",
    bb_rate_hit: "10.2%",
    k_rate_hit: "19.8%",
    bb_k_diff_hit: "-9.6%",
    runs_allowed: 575,
    era: "3.18",
    cg: 15,
    bb_rate_pitch: "7.2%",
    k_rate_pitch: "23.5%",
    k_bb_diff_pitch: "16.3%",
  },
  {
    pos: 2,
    name: "福岡ソフトバンクホークス",
    abbr: "ソフトバンク",
    w: 85,
    l: 58,
    pct: 0.594,
    runs: 738,
    ops: ".795",
    avg: ".278",
    hr: 192,
    obp: ".348",
    slg: ".447",
    isod: ".070",
    isop: ".169",
    bb_rate_hit: "9.8%",
    k_rate_hit: "20.5%",
    bb_k_diff_hit: "-10.7%",
    runs_allowed: 588,
    era: "3.32",
    cg: 13,
    bb_rate_pitch: "7.5%",
    k_rate_pitch: "22.8%",
    k_bb_diff_pitch: "15.3%",
  },
  {
    pos: 3,
    name: "埼玉西武ライオンズ",
    abbr: "西武",
    w: 80,
    l: 63,
    pct: 0.559,
    runs: 715,
    ops: ".778",
    avg: ".272",
    hr: 185,
    obp: ".342",
    slg: ".436",
    isod: ".070",
    isop: ".164",
    bb_rate_hit: "9.5%",
    k_rate_hit: "21.2%",
    bb_k_diff_hit: "-11.7%",
    runs_allowed: 605,
    era: "3.48",
    cg: 11,
    bb_rate_pitch: "8.0%",
    k_rate_pitch: "21.8%",
    k_bb_diff_pitch: "13.8%",
  },
  {
    pos: 4,
    name: "千葉ロッテマリーンズ",
    abbr: "ロッテ",
    w: 75,
    l: 68,
    pct: 0.524,
    runs: 688,
    ops: ".762",
    avg: ".268",
    hr: 172,
    obp: ".335",
    slg: ".427",
    isod: ".070",
    isop: ".159",
    bb_rate_hit: "9.0%",
    k_rate_hit: "21.8%",
    bb_k_diff_hit: "-12.8%",
    runs_allowed: 628,
    era: "3.62",
    cg: 9,
    bb_rate_pitch: "8.3%",
    k_rate_pitch: "21.2%",
    k_bb_diff_pitch: "12.9%",
  },
  {
    pos: 5,
    name: "東北楽天ゴールデンイーグルス",
    abbr: "楽天",
    w: 70,
    l: 73,
    pct: 0.49,
    runs: 665,
    ops: ".745",
    avg: ".263",
    hr: 165,
    obp: ".330",
    slg: ".415",
    isod: ".070",
    isop: ".152",
    bb_rate_hit: "8.7%",
    k_rate_hit: "22.5%",
    bb_k_diff_hit: "-13.8%",
    runs_allowed: 652,
    era: "3.78",
    cg: 7,
    bb_rate_pitch: "8.6%",
    k_rate_pitch: "20.5%",
    k_bb_diff_pitch: "11.9%",
  },
  {
    pos: 6,
    name: "北海道日本ハムファイターズ",
    abbr: "日本ハム",
    w: 65,
    l: 78,
    pct: 0.455,
    runs: 642,
    ops: ".728",
    avg: ".258",
    hr: 155,
    obp: ".325",
    slg: ".403",
    isod: ".067",
    isop: ".145",
    bb_rate_hit: "8.5%",
    k_rate_hit: "23.2%",
    bb_k_diff_hit: "-14.7%",
    runs_allowed: 678,
    era: "3.98",
    cg: 6,
    bb_rate_pitch: "9.0%",
    k_rate_pitch: "19.8%",
    k_bb_diff_pitch: "10.8%",
  },
]

export { TOP_PAGE_TABS as mainTabs } from "@/app/components/top/topPageRouteConfig"

export const subTabs = [
  { id: 0, label: "セ個人成績", type: "combined", league: "CL" },
  { id: 1, label: "パ個人成績", type: "combined", league: "PL" },
  { id: 2, label: "セ順位表", type: "standings", league: "CL" },
  { id: 3, label: "パ順位表", type: "standings", league: "PL" },
] as const

export const dummyArticles = [
  {
    id: 1,
    title: "プロ野球2024年シーズンMVPが決定",
    date: "2024.12.05",
    source: "スポーツニッポン",
    image: "/baseball-mvp.jpg",
  },
  {
    id: 2,
    title: "新人王候補、期待を上回る活躍を見せる",
    date: "2024.11.20",
    source: "日刊スポーツ",
    image: "/rookie-of-the-year.jpg",
  },
  {
    id: 3,
    title: "FA市場の動向：注目選手と移籍の可能性",
    date: "2024.10.15",
    source: "ベースボールマガジン",
    image: "/fa-market.jpg",
  },
  {
    id: 4,
    title: "メジャー挑戦への道：若手投手の挑戦",
    date: "2024.09.30",
    source: "MLB通信",
    image: "/mlb-challenge.jpg",
  },
  {
    id: 5,
    title: "球団別戦力分析：優勝への鍵は？",
    date: "2024.08.10",
    source: "プロ野球ガイド",
    image: "/team-analysis.jpg",
  },
  {
    id: 6,
    title: "レジェンドたちの名場面集",
    date: "2024.07.01",
    source: "野球殿堂",
    image: "/legendary-moments.jpg",
  },
]

export function getDataForPanel(league: string, type: string): LeadersConfig {
  if (league === "CL" && type === "batting") {
    return battersCL
  }
  if (league === "CL" && type === "pitching") {
    return pitchersCL
  }
  if (league === "PL" && type === "batting") {
    return battersPL
  }
  if (league === "PL" && type === "pitching") {
    return pitchersPL
  }
  return { top3Metrics: [], miniMetrics: [], leaders: {} }
}
