import {
  splitBattingColumns,
  splitPitchingColumns,
} from "@/lib/playerCareerMergedDisplay"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"

export type ProfileMergedPayload = {
  npb_player_id: string
  name_ja: string
  profile?: { birth_date_raw?: string; pro_debut_raw?: string; career_raw?: string }
  salary_by_year?: Record<string, number>
  career_total_salary_display?: string | null
  career_batting?: { rows?: Array<Record<string, any>>; total?: Record<string, any> }
  career_pitching?: { rows?: Array<Record<string, any>>; total?: Record<string, any> } | null
  faEstimate?: {
    seasonYear?: string
    domesticFa?: { displayValue?: string; source?: string; note?: string } | null
  }
} | null

/** Phase 7 期間タブ: BF ベースの率表示 */
export function pctOfBf(num: number, bf: number): string {
  if (bf <= 0) return "—"
  return `${((100 * num) / bf).toFixed(1)}%`
}
export function kMinusBbPctOfBf(so: number, bb: number, bf: number): string {
  if (bf <= 0) return "—"
  return `${((100 * (so - bb)) / bf).toFixed(1)}%`
}

// チーム色の定義
export const teamColors: Record<string, string> = {
  H: "#ffde00", // 阪神
  G: "#ff6600", // 巨人
  DB: "#0067c0", // DeNA
  C: "#d60718", // 広島
  D: "#004ea2", // 中日
  S: "#2bbb3f", // ヤクルト
  Bs: "#b79e51", // オリックス
  M: "#222222", // ロッテ（黒に近いグレー）
  F: "#0077c8", // 日本ハム
  E: "#7a0019", // 楽天
  L: "#004098", // 西武
  Hs: "#ffdb00", // ソフトバンク
}

// プレイヤーのローマ字名の定義
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
  菊池涼介: "Kikuchi Ryosuke",
  // 2026年新規支配下登録選手（追加分）
  嶋村麟士朗: "Shimamura Rinshiro",
  長野久義: "Nagano Hisayoshi",
  川端慎吾: "Kawabata Shingo",
  モンテル: "Higuma Montiel",
  "Ｊ．ティマ": "Julian Tima",
  金子京介: "Kyosuke Kaneko",
}

export function parseBirthDateJa(raw: string): { y: number; m: number; d: number } | null {
  const m = String(raw || "").match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

export function calcAgeFromJaBirth(raw: string, now = new Date()): number | null {
  const p = parseBirthDateJa(raw)
  if (!p) return null
  let age = now.getFullYear() - p.y
  const mm = now.getMonth() + 1
  const dd = now.getDate()
  if (mm < p.m || (mm === p.m && dd < p.d)) age -= 1
  return age
}

export function stripQueryHash(s: string): string {
  return (s || "").split("?")[0]?.split("#")[0] || ""
}

/**
 * `useParams` / `usePathname` のサスペンド回避（Next.js 16 + layout Suspense で真っ黒になり得る）。
 * `/players/[id]`・`/mobile/players/[id]` からセグメントを取る。
 */
export function playerIdSegmentFromPathname(pathname: string): string {
  const raw = stripQueryHash((pathname || "").trim())
  if (!raw) return ""
  const parts = raw.split("/").filter(Boolean)
  const idx = parts.lastIndexOf("players")
  if (idx >= 0 && parts[idx + 1]) {
    let seg = parts[idx + 1]!
    try {
      seg = decodeURIComponent(seg).normalize("NFC")
    } catch {
      try {
        seg = seg.normalize("NFC")
      } catch {
        // そのまま
      }
    }
    return seg
  }
  return ""
}

/** NPB 公式 player_id（master CSV / ランキングリンクでパスが数値のみになることがある） */
export const AOYAGI_NPB_ID = "71175132"
/** 日本ハム・伊藤大海（今季成績タブの数値フォント試行） */
export const ITO_DAIYA_NPB_ID = "51355153"
export const ITO_DAIYA_YAHOO_PITCHER_ID = "2000079"
/** 阪神・髙橋遥人（球種一覧サイドパネル UI パイロット） */
export const TAKAHASHI_HARUTO_NPB_ID = "91095136"
export const TAKAHASHI_HARUTO_YAHOO_PITCHER_ID = "1700078"
/** 阪神・村上頌樹（今季成績 sticky ヘッダー UI パイロット） */
export const MURAKAMI_SHOKI_NPB_ID = "13315153"
export const MURAKAMI_SHOKI_YAHOO_PITCHER_ID = "2000055"
/** キャリアハイ投手成績と同じ Bebas 数値フォントを今季タブに適用するラッパー class */
export const PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS = "pitcher-season-career-high-numerics"
/** 投手今季タブ: 数値 1.15 倍など（ルートに付与） */
export const PITCHER_SEASON_NUMERICS_UI_CLASS = "pitcher-season-numerics-ui"
/** 伊藤大海ページ: 名前・プロフィール表の Noto/Inter */
export const ITO_DAIYA_PROFILE_UI_CLASS = "ito-daiya-profile-ui"
/** 今季の成績タブ: 表の数値セルを 1.3 倍にするラッパー class */
export const PLAYER_SEASON_TAB_NUMERICS_CLASS = "player-season-tab-numerics"

export type ItoDaiyaPageDetectionInput = {
  pathname: string
  playerIdNormalized: string
  playerSegmentCore: string
  displayName: string
  displayRomanName: string | null
  rosterMatchedNpbId?: string
}

export function isItoDaiyaPlayerPage(input: ItoDaiyaPageDetectionInput): boolean {
  const {
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
    rosterMatchedNpbId = "",
  } = input
  const itoName = compactPlayerName("伊藤大海")
  const itoRoman = compactPlayerName("Itoh Hiromi")
  const pathSeg = (() => {
    const raw = pathname.split("/").filter(Boolean).pop() || ""
    try {
      return decodeURIComponent(raw).normalize("NFC")
    } catch {
      return raw.normalize("NFC")
    }
  })()
  return (
    compactPlayerName(displayName) === itoName ||
    compactPlayerName(displayName).includes("伊藤大") ||
    compactPlayerName(displayRomanName || "") === itoRoman ||
    compactPlayerName(displayRomanName || "") === compactPlayerName("H.Itoh") ||
    playerSegmentCore === ITO_DAIYA_NPB_ID ||
    playerIdNormalized === ITO_DAIYA_NPB_ID ||
    playerSegmentCore === ITO_DAIYA_YAHOO_PITCHER_ID ||
    playerIdNormalized === ITO_DAIYA_YAHOO_PITCHER_ID ||
    rosterMatchedNpbId.trim() === ITO_DAIYA_NPB_ID ||
    pathSeg === ITO_DAIYA_NPB_ID ||
    pathSeg === ITO_DAIYA_YAHOO_PITCHER_ID ||
    compactPlayerName(pathSeg).includes("伊藤大")
  )
}

export function isTakahashiHarutoPlayerPage(input: ItoDaiyaPageDetectionInput): boolean {
  const {
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
    rosterMatchedNpbId = "",
  } = input
  const nameKeys = [rosterNameMatchKey("髙橋 遥人"), rosterNameMatchKey("高橋 遥人")]
  const romanKeys = [
    compactPlayerName("Takahashi Haruto"),
    compactPlayerName("H.Takahashi"),
  ]
  const pathSeg = (() => {
    const raw = pathname.split("/").filter(Boolean).pop() || ""
    try {
      return decodeURIComponent(raw).normalize("NFC")
    } catch {
      return raw.normalize("NFC")
    }
  })()
  const nameHit = nameKeys.some((k) => rosterNameMatchKey(displayName) === k)
  const romanHit = romanKeys.some((k) => compactPlayerName(displayRomanName || "") === k)
  const idHit = (v: string) =>
    v === TAKAHASHI_HARUTO_NPB_ID || v === TAKAHASHI_HARUTO_YAHOO_PITCHER_ID
  const slugHit = (v: string) => v === "haruto-takahashi"
  return (
    nameHit ||
    romanHit ||
    idHit(playerSegmentCore) ||
    idHit(playerIdNormalized) ||
    slugHit(playerSegmentCore) ||
    slugHit(playerIdNormalized) ||
    rosterMatchedNpbId.trim() === TAKAHASHI_HARUTO_NPB_ID ||
    idHit(pathSeg) ||
    slugHit(pathSeg) ||
    nameKeys.some((k) => rosterNameMatchKey(pathSeg) === k)
  )
}

/** season-pitching 派生の npbPlayerId でも髙橋遥人を判定（URL が Yahoo ID のときの保険） */
export function isTakahashiHarutoFromPitchingPayload(npbPlayerId: string | null | undefined): boolean {
  return (npbPlayerId ?? "").trim() === TAKAHASHI_HARUTO_NPB_ID
}

export function isMurakamiShokiPlayerPage(input: ItoDaiyaPageDetectionInput): boolean {
  const {
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
    rosterMatchedNpbId = "",
  } = input
  const nameKeys = [rosterNameMatchKey("村上 頌樹")]
  const romanKeys = [
    compactPlayerName("Murakami Shoki"),
    compactPlayerName("S.Murakami"),
  ]
  const pathSeg = (() => {
    const raw = pathname.split("/").filter(Boolean).pop() || ""
    try {
      return decodeURIComponent(raw).normalize("NFC")
    } catch {
      return raw.normalize("NFC")
    }
  })()
  const nameHit = nameKeys.some((k) => rosterNameMatchKey(displayName) === k)
  const romanHit = romanKeys.some((k) => compactPlayerName(displayRomanName || "") === k)
  const idHit = (v: string) =>
    v === MURAKAMI_SHOKI_NPB_ID || v === MURAKAMI_SHOKI_YAHOO_PITCHER_ID
  return (
    nameHit ||
    romanHit ||
    idHit(playerSegmentCore) ||
    idHit(playerIdNormalized) ||
    rosterMatchedNpbId.trim() === MURAKAMI_SHOKI_NPB_ID ||
    idHit(pathSeg) ||
    nameKeys.some((k) => rosterNameMatchKey(pathSeg) === k)
  )
}

export function isMurakamiShokiFromPitchingPayload(npbPlayerId: string | null | undefined): boolean {
  return (npbPlayerId ?? "").trim() === MURAKAMI_SHOKI_NPB_ID
}

/** Phase 7 通算打撃表 UI（ランキング風・1表横スクロール） */

/**
 * 今季ブロック scale(0.7) 内の見出しと同じ見え方（対左右別の対戦成績と揃える）
 * titleBase 1.125/1.625rem × 0.7、左帯 6px × 0.7
 */
export const FIELDER_PILOT_HEADING_SCALE = 0.7
export const FIELDER_PILOT_SECTION_STRIPE_PX = 6 * FIELDER_PILOT_HEADING_SCALE

export const { left: battingColsLeft, right: battingColsRight } = splitBattingColumns()
export const { left: pitchingColsLeft, right: pitchingColsRight } = splitPitchingColumns()

export const careerTh =
  "px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0"
export const careerTd =
  "px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500"
export const careerYearTd =
  "px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500 first:border-l-0 font-bold"
