/**
 * 球場名の正規化マスタ（SSOT）。
 * Phase0 日程・Phase13 split_value・打者/投手 UI の dataKeys はここから派生する。
 */

export type StadiumVenueDefinition = {
  /** 派生 JSON の split_value / 日程 stadiumByGameId の保存名 */
  canonical: string
  /** UI 表ヘッダ（省略表示） */
  display: string
  /** 日程表・メタ等で出現する別名（canonical / display を含めてもよい） */
  aliases: string[]
  teamLabel: string
  /** 投手 POC 表のみ別ラベルが必要なとき */
  pitcherTeamLabel?: string
}

export type StadiumVenueUiRow = {
  display: string
  dataKeys: string[]
  teamLabel: string
}

/** セ・リーグ中心 + パリーグ球場。aliases は両 UI・日程表の表記を統合 */
export const STADIUM_VENUE_DEFINITIONS: StadiumVenueDefinition[] = [
  {
    canonical: "エスコンＦ",
    display: "エスコンＦ",
    aliases: ["エスコン", "エスコンフィールド名古屋", "北広島", "エスコンフィールド"],
    teamLabel: "日本ハム",
  },
  {
    canonical: "楽天モバイル",
    display: "楽天最強",
    aliases: ["楽天最強", "楽天モバイル", "楽天モバイルパーク", "楽天生命", "楽天生命パーク"],
    teamLabel: "楽天",
  },
  {
    canonical: "ベルーナD",
    display: "ベルーナD",
    aliases: ["ベルーナ", "ベルーナドーム", "メットライフ", "西武ドーム", "ベルーナドーム"],
    teamLabel: "西武",
  },
  {
    canonical: "ZOZOマリン",
    display: "ZOZOマリン",
    aliases: ["ZOZO", "マリン", "Zozoマリンスタジアム", "ZOZOマリンスタジアム"],
    teamLabel: "ロッテ",
  },
  {
    canonical: "京セラD大阪",
    display: "京セラD大阪",
    aliases: ["京セラ", "京セラドーム大阪", "京セラドーム"],
    teamLabel: "オリックス",
  },
  {
    canonical: "みずほPayPay",
    display: "みずほPayPay",
    aliases: ["PayPayドーム", "みずほPayPayドーム", "福岡PayPayドーム"],
    teamLabel: "ソフトバンク",
  },
  {
    canonical: "東京ドーム",
    display: "東京ドーム",
    aliases: ["東京ドーム"],
    teamLabel: "巨人",
  },
  {
    canonical: "神宮球場",
    display: "神宮球場",
    aliases: ["神宮", "神宮球場"],
    teamLabel: "ヤクルト",
  },
  {
    canonical: "横浜スタジアム",
    display: "横浜スタジアム",
    aliases: ["横浜", "横浜S", "横浜スタジアム", "横浜スタ"],
    teamLabel: "横浜",
    pitcherTeamLabel: "ＤｅＮＡ",
  },
  {
    canonical: "バンテリンD",
    display: "バンテリンD",
    aliases: ["バンテリン", "バンテリンドーム", "バンテリンD", "ナゴヤドーム"],
    teamLabel: "中日",
  },
  {
    canonical: "甲子園球場",
    display: "甲子園球場",
    aliases: ["甲子園", "甲子園球場", "阪神甲子園球場"],
    teamLabel: "阪神",
  },
  {
    canonical: "マツダ",
    display: "マツダ",
    aliases: ["マツダ", "マツダスタジアム", "MAZDA Zoom-Zoomスタジアム"],
    teamLabel: "広島",
  },
  {
    canonical: "地方球場",
    display: "地方球場",
    aliases: [
      "地方",
      "地方球場",
      "倉敷",
      "きらめき",
      "岐阜",
      "弘前",
      "前橋",
      "長野",
      "県営大宮",
      "豊橋",
      "北九州",
    ],
    teamLabel: "—",
    pitcherTeamLabel: "広島",
  },
]

/** 12球団本拠地の canonical（地方球場・未設定を除く） */
export const HOME_STADIUM_CANONICAL_SET = new Set(
  STADIUM_VENUE_DEFINITIONS.filter((d) => d.canonical !== "地方球場").map((d) => d.canonical),
)

const EXACT_ALIAS_TO_CANONICAL = new Map<string, string>()

function registerAlias(alias: string, canonical: string): void {
  const key = alias.trim()
  if (!key) return
  EXACT_ALIAS_TO_CANONICAL.set(key, canonical)
}

for (const def of STADIUM_VENUE_DEFINITIONS) {
  registerAlias(def.canonical, def.canonical)
  registerAlias(def.display, def.canonical)
  for (const a of def.aliases) registerAlias(a, def.canonical)
}

function longestPartialMatch(raw: string): string | null {
  let best: { canonical: string; len: number } | null = null
  for (const def of STADIUM_VENUE_DEFINITIONS) {
    const candidates = [def.canonical, def.display, ...def.aliases]
    for (const alias of candidates) {
      const a = alias.trim()
      if (a.length < 2) continue
      if (raw === a || raw.includes(a) || a.includes(raw)) {
        if (!best || a.length > best.len) {
          best = { canonical: def.canonical, len: a.length }
        }
      }
    }
  }
  return best?.canonical ?? null
}

/**
 * 日程・Phase13・補完ロジック向け。
 * - 空は「未設定」（日程未取得のまま）
 * - 12球団本拠地はマスタの canonical へ
 * - それ以外はすべて「地方球場」
 */
/** 日程・インデックスで球場未取得のマーカー */
export function isUnsetStadiumSplitValue(value: string | undefined | null): boolean {
  return String(value ?? "").trim() === "未設定"
}

export function normalizeStadiumSplitValue(raw: string): string {
  const s = String(raw ?? "").trim()
  if (!s) return "未設定"
  if (s === "未設定") return s

  const exact = EXACT_ALIAS_TO_CANONICAL.get(s)
  if (exact) return exact

  const partial = longestPartialMatch(s)
  if (partial) return partial

  return "地方球場"
}

function buildUiRows(forPitcher: boolean): StadiumVenueUiRow[] {
  return STADIUM_VENUE_DEFINITIONS.map((def) => {
    const keys = new Set<string>()
    keys.add(def.canonical)
    keys.add(def.display)
    for (const a of def.aliases) keys.add(a.trim())
    const teamLabel =
      forPitcher && def.pitcherTeamLabel != null ? def.pitcherTeamLabel : def.teamLabel
    return {
      display: def.display,
      dataKeys: [...keys],
      teamLabel,
    }
  })
}

/** 打者 SeasonStatsPilot の球場別表 */
export const STADIUM_VENUE_UI_ROWS_BATTING: StadiumVenueUiRow[] = buildUiRows(false)

/** 投手 POC の球場別表 */
export const STADIUM_VENUE_UI_ROWS_PITCHER: StadiumVenueUiRow[] = buildUiRows(true)

/** チーム短名 → 本拠 canonical（canonical 補完用） */
export function teamHomeStadiumCanonical(teamShort: string): string | null {
  const map: Record<string, string> = {
    巨人: "東京ドーム",
    広島: "マツダ",
    阪神: "甲子園球場",
    中日: "バンテリンD",
    ヤクルト: "神宮球場",
    横浜: "横浜スタジアム",
    DeNA: "横浜スタジアム",
    オリックス: "京セラD大阪",
    ソフトバンク: "みずほPayPay",
    楽天: "楽天モバイル",
    西武: "ベルーナD",
    ロッテ: "ZOZOマリン",
    日本ハム: "エスコンＦ",
  }
  const key = teamShort.trim()
  const raw = map[key]
  return raw ? normalizeStadiumSplitValue(raw) : null
}

/** 投手・野手個人ページの球場表のみ、表示名を短縮する */
export function formatPlayerPageStadiumDisplay(display: string): string {
  if (display === "みずほPayPay") return "みずほPay"
  if (display === "横浜スタジアム") return "横浜S"
  return display
}
