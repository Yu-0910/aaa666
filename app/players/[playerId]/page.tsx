"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useLayoutEffect, useMemo } from "react"
import { useRouter, usePathname, useParams } from "next/navigation"
import dynamic from "next/dynamic"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import PitchDetailsPilot from "@/app/components/PitchDetailsPilot"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { useClientSearchString, useViewportLayout } from "@/hooks/useIsDesktop"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"
import {
  isFabianPlayerPage,
  isKikuchiPlayerPage,
  pathMatchesKikuchiPilot,
  resolveSeasonStatsPilotQueryId,
} from "@/lib/resolveSeasonPilotQueryId"
import { compactPlayerName } from "@/lib/playerNameNormalize"
import {
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"
import { MANUAL_YAHOO_TO_NPB } from "@/lib/yahooNpbBatterIdMap.manual"
import { rosterEnglishAliasKeys, rosterEnglishFullFromCsvRow } from "@/lib/rosterEnglishDisplay"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import type {
  PitcherSeasonPocPayload,
  PitcherSeasonPitchingApiResponse,
  PitcherSeasonPitchingPeriodApiResponse,
  PitcherSeasonPitchingPeriodPayload,
} from "@/lib/pitcherSeasonPocTypes"
import {
  EMPTY_TEAM_VS_ROWS,
  pitcherPocBasicRow1,
  pitcherPocBasicRow2,
  pitcherPocBasicRow3,
  pitcherPocDayNightRows,
  pitcherPocHomeAwayRows,
  pitcherPocHandCells,
  pitcherPocCatcherRows,
  pitcherPocInningRow,
  pitcherPocMetricRow1,
  pitcherPocMetricRow2,
  pitcherPocMetricRow3,
  pitcherPocSituationRows,
  pitcherPocTeamVsRows,
  pitcherPocStadiumRows,
  EMPTY_STADIUM_VS_ROWS,
} from "@/lib/pitcherSeasonPocUi"
import { formatEra } from "@/lib/formatStat"
import { DEFAULT_YAHOO_GAME_ID_HIROSHIMA_CHUNICHI_20260327 } from "@/lib/yahooGame/pitcherPocDefaults"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { SectionLoadingSpinner } from "@/components/ui/spinner"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })

/** Phase 7 期間タブ: BF ベースの率表示 */
function pctOfBf(num: number, bf: number): string {
  if (bf <= 0) return "—"
  return `${((100 * num) / bf).toFixed(1)}%`
}
function kMinusBbPctOfBf(so: number, bb: number, bf: number): string {
  if (bf <= 0) return "—"
  return `${((100 * (so - bb)) / bf).toFixed(1)}%`
}

// チーム色の定義
const teamColors: Record<string, string> = {
  H: "#ffde00", // 阪神
  G: "#ff6600", // 巨人
  DB: "#0067c0", // DeNA
  C: "#d60718", // 広島
  D: "#004ea2", // 中日
  S: "#2bbb3f", // ヤクルト
  Bs: "#b79e51", // オリックス
  M: "#6b7280", // ロッテ（帯はグレー基調）
  F: "#0077c8", // 日本ハム
  E: "#7a0019", // 楽天
  L: "#004098", // 西武
  Hs: "#ffdb00", // ソフトバンク
}

// プレイヤーのローマ字名の定義
const playerRomanNames: Record<string, string> = {
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
}

// サンプルデータ
const playerData = {
  name: "近本光司",
  team: "H", // 阪神
  birthDate: "1994年11月9日",
  age: 30,
  birthPlace: "兵庫県津名郡東浦町（現：淡路市）",
  proDebut: "2018年 ドラフト2位（全体14位）",
  career: "社高等学校 → 関西学院大学 → 大阪ガス → 阪神 (2019 - )",
  totalSalary: "10億5000万円",
  championships: "日本一：5回、リーグ優勝：7回",
  faYear: "2027年",
}

const careerHighs = [
  { title: "OPS", value: "1.043", year: "2023年", 足: "" },
  { title: "打率", value: ".338", year: "2023年", 足: "" },
  { title: "本塁打", value: "21", year: "2023年", 足: "本" },
  { title: "打点", value: "84", year: "2023年", 足: "点" },
  { title: "出塁率", value: ".425", year: "2023年", 足: "" },
  { title: "長打率", value: ".618", year: "2023年", 足: "" },
]

function stripQueryHash(s: string): string {
  return (s || "").split("?")[0]?.split("#")[0] || ""
}

/** NPB 公式 player_id（master CSV / ランキングリンクでパスが数値のみになることがある） */
const AOYAGI_NPB_ID = "71175132"
const careerStats = [
  {
    year: 2019,
    age: 24,
    salary: 1200,
    ops: 0.791,
    avg: 0.271,
    hits: 146,
    hr: 8,
    rbi: 47,
    games: 143,
    pa: 638,
    ab: 539,
    obp: 0.348,
    slg: 0.443,
    runs: 94,
    doubles: 26,
    triples: 7,
    sb: 36,
    cs: 7,
    bb: 70,
    so: 131,
    isop: 0.172,
    isod: 0.077,
    bbp: 11.0,
    kp: 20.5,
    bbk: 0.53,
    sh: 24,
    sf: 5,
    hbp: 4,
  },
  {
    year: 2020,
    age: 25,
    salary: 2400,
    ops: 0.765,
    avg: 0.29,
    hits: 124,
    hr: 8,
    rbi: 38,
    games: 120,
    pa: 547,
    ab: 428,
    obp: 0.376,
    slg: 0.449,
    runs: 70,
    doubles: 20,
    triples: 5,
    sb: 24,
    cs: 8,
    bb: 67,
    so: 89,
    isop: 0.159,
    isod: 0.086,
    bbp: 12.2,
    kp: 16.3,
    bbk: 0.75,
    sh: 19,
    sf: 3,
    hbp: 5,
  },
  {
    year: 2021,
    age: 26,
    salary: 5000,
    ops: 0.756,
    avg: 0.288,
    hits: 153,
    hr: 4,
    rbi: 39,
    games: 143,
    pa: 653,
    ab: 531,
    obp: 0.364,
    slg: 0.392,
    runs: 85,
    doubles: 27,
    triples: 7,
    sb: 28,
    cs: 4,
    bb: 78,
    so: 105,
    isop: 0.104,
    isod: 0.076,
    bbp: 11.9,
    kp: 16.1,
    bbk: 0.74,
    sh: 33,
    sf: 2,
    hbp: 9,
  },
  {
    year: 2022,
    age: 27,
    salary: 9000,
    ops: 0.853,
    avg: 0.302,
    hits: 170,
    hr: 10,
    rbi: 52,
    games: 143,
    pa: 666,
    ab: 563,
    obp: 0.383,
    slg: 0.47,
    runs: 103,
    doubles: 32,
    triples: 8,
    sb: 25,
    cs: 8,
    bb: 72,
    so: 100,
    isop: 0.168,
    isod: 0.081,
    bbp: 10.8,
    kp: 15.0,
    bbk: 0.72,
    sh: 23,
    sf: 4,
    hbp: 4,
  },
  {
    year: 2023,
    age: 28,
    salary: 25000,
    ops: 1.043,
    avg: 0.338,
    hits: 181,
    hr: 21,
    rbi: 84,
    games: 140,
    pa: 641,
    ab: 536,
    obp: 0.425,
    slg: 0.618,
    runs: 115,
    doubles: 36,
    triples: 4,
    sb: 18,
    cs: 5,
    bb: 91,
    so: 94,
    isop: 0.28,
    isod: 0.087,
    bbp: 14.2,
    kp: 14.7,
    bbk: 0.97,
    sh: 7,
    sf: 5,
    hbp: 2,
  },
  {
    year: 2024,
    age: 29,
    salary: 52900,
    ops: 0.829,
    avg: 0.289,
    hits: 162,
    hr: 15,
    rbi: 67,
    games: 143,
    pa: 649,
    ab: 561,
    obp: 0.366,
    slg: 0.463,
    runs: 91,
    doubles: 28,
    triples: 6,
    sb: 22,
    cs: 6,
    bb: 66,
    so: 112,
    isop: 0.174,
    isod: 0.077,
    bbp: 10.2,
    kp: 17.3,
    bbk: 0.59,
    sh: 15,
    sf: 4,
    hbp: 3,
  },
]

function PlayerPageClient({
  layout,
  forceMobile,
}: {
  layout: ViewportLayout
  forceMobile?: boolean
}) {
  const isMobile = layout === "mobile"
  const tb = isMobile ? "text-[1.625rem]" : "text-[1.125rem]"
  const BUILD_MARKER = "sugano-season-ui-20260326-01"
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(2025)
  /** 既定は今季。名簿照合前は showSeasonCareerTabs が偽でも通算は (!showSeasonCareerTabs || …) で出るため、career 固定より安全 */
  const [statsTab, setStatsTab] = useState<"season" | "career">("season")
  /** 投手「今季の成績」4タブ（PoC シェル）。将来のAPI連携で値を差し替え可能 */
  const [pitcherSeasonSubTab, setPitcherSeasonSubTab] = useState<
    "basic" | "pitch" | "situation" | "period"
  >("basic")
  // 今季サブタブは SeasonStatsPilot の seasonDetailTab でブロックを出し分け。初期 pitch だと showPilotTab("situation") が偽になり
  // 「状況別」の表が DOM に存在しない（タップするまで見えない）。既定は基本成績。球種は「球種情報」タブへ。
  const [kikuchiSeasonDetailTab, setKikuchiSeasonDetailTab] = useState<
    "basic" | "pitch" | "situation" | "period"
  >("basic")
  const [displayName, setDisplayName] = useState(playerData.name)
  const [displayRomanName, setDisplayRomanName] = useState<string | null>(null)
  /** _data/npb_roster_2026.csv 由来（API・フル英字）。名簿にいる選手は playerRomanNames より優先 */
  const [rosterRomanExtra, setRosterRomanExtra] = useState<Record<string, string>>({})
  const [isRosterPlayer, setIsRosterPlayer] = useState(false)
  /** 名簿照合時の支配下公示ポジション（投手UI判定用） */
  const [rosterMatchedPosition, setRosterMatchedPosition] = useState("")
  /** 名簿照合で確定した npb_player_id（空欄ポジションの投手推定から菊池を除外する） */
  const [rosterMatchedNpbId, setRosterMatchedNpbId] = useState("")
  /** 名簿照合時の所属（帯色用。team_code 優先、無ければ CSV の team 正式名） */
  const [rosterStripeKey, setRosterStripeKey] = useState("")
  /** 名簿 API が現在の URL 向けに完了するまで本文を出さず、中間フレーム（帯・縮小・通算の不整合）を見せない */
  const [rosterMainReady, setRosterMainReady] = useState(false)
  type GamePitchTypeRow = {
    pitch_type: string
    pitches: number
    pct: number
    avg_speed_kmh: number | null
    swing_miss: number
    taken: number
    foul: number
    balls: number
    strike_pct: string
    whiff_pct: string
    avg: string
    ops?: string
    ab: number
    h: number
    hr: number
    so: number
    bb: number
    hbp: number
  }
  type GamePitchTypesData = {
    game_id: string
    pitcher_id: string
    pitches_total: number
    rows: GamePitchTypeRow[]
    total_row: GamePitchTypeRow
  }
  const [gamePitchTypes, setGamePitchTypes] = useState<GamePitchTypesData | null>(null)
  type ZoneStat = { zoneId: number; pitches: number; ab: number; h: number; hr: number; ops: string; avg: string }
  const [zoneStats, setZoneStats] = useState<{ vsRight: ZoneStat[]; vsLeft: ZoneStat[] } | null>(null)
  /** Phase 2: `_data/derived/player_season_pitching_poc` を API 経由で取得 */
  const [pitcherSeasonPocPayload, setPitcherSeasonPocPayload] =
    useState<PitcherSeasonPocPayload | null>(null)
  /** Phase 7: `_data/derived/player_season_pitching_period` を API 経由で取得 */
  const [pitcherSeasonPitchingPeriodPayload, setPitcherSeasonPitchingPeriodPayload] =
    useState<PitcherSeasonPitchingPeriodPayload | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const clientSearch = useClientSearchString()
  const yahooGameIdParam = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    return (new URLSearchParams(q).get("yahooGameId") ?? "").trim()
  }, [clientSearch])
  const params = useParams()
  const playerIdFromPath = (params?.playerId as string) || ""
  const lastSegmentFromPathname = pathname.split("/").filter(Boolean).pop() || ""
  /**
   * useParams().playerId が本番のみ空・未同期になるケースへのフォールバック。
   * 青柳はパスが 2103788（Yahoo 投手ID）でも一致するため、同条件で本番でも表示されやすい。
   */
  const playerSegment =
    playerIdFromPath ||
    (lastSegmentFromPathname && lastSegmentFromPathname !== "players" ? lastSegmentFromPathname : "")
  const playerSegmentClean = stripQueryHash(playerSegment)
  const playerSegmentCore = playerSegmentClean.replace(/^player-/, "")

  /** 本番のエンコード済みパスや NFC/NFD 差で === 比較が外れるのを防ぐ */
  const playerIdNormalized = (() => {
    if (!playerSegmentCore) return ""
    try {
      return decodeURIComponent(playerSegmentCore).normalize("NFC")
    } catch {
      return playerSegmentCore.normalize("NFC")
    }
  })()

  useLayoutEffect(() => {
    setRosterMainReady(false)
  }, [playerIdNormalized])

  useEffect(() => {
    let cancelled = false
    const id = playerIdNormalized.trim()
    const qs =
      id.length > 0 ? `?publicId=${encodeURIComponent(playerIdNormalized)}` : ""
    fetch(`/api/roster/2026${qs}`)
      .then((r) => r.json())
      .then(
        (data: {
          players: Array<{
            npb_player_id: string
            name_ja: string
            name_en: string
            name_en_full?: string
            name_en_short?: string
            team?: string
            team_code?: string
            position?: string
          }>
          matchedPlayer?: {
            npb_player_id: string
            name_ja: string
            name_en: string
            name_en_full?: string
            name_en_short?: string
            team?: string
            team_code?: string
            position?: string
          } | null
        }) => {
          if (cancelled) return
          const players = data.players || []
          /** 表示名は初期値が近本などプレースホルダのままのフレームがある。URL セグメント（日本語名）を先に名簿照合する */
          const byId =
            id && /^\d+$/.test(id)
              ? players.find((p) => String(p.npb_player_id) === id)
              : undefined
          const pathNameKey = id && !/^\d+$/.test(id) ? compactPlayerName(playerIdNormalized) : ""
          const byPathSegment =
            pathNameKey.length > 0
              ? players.find((p) => compactPlayerName(p.name_ja) === pathNameKey)
              : undefined
          const c = compactPlayerName(displayName)
          const byName = players.find((p) => compactPlayerName(p.name_ja) === c)
          /** URL が Yahoo 打者 ID のとき、クライアントでも NPB に落として名簿行を探す（byId は raw===npb のみのため 1600124 等で失敗し得る） */
          const npbFromYahooManual =
            id && /^\d+$/.test(id) ? MANUAL_YAHOO_TO_NPB[id] : undefined
          const byYahooBridge = npbFromYahooManual
            ? players.find((p) => String(p.npb_player_id) === npbFromYahooManual)
            : undefined
          /** サーバー側 findRosterPlayerByPublicId（Yahoo→NPB 橋渡し・Ｓ．省略 等）を最優先 */
          const matched =
            data.matchedPlayer ?? byId ?? byPathSegment ?? byName ?? byYahooBridge
          setIsRosterPlayer(!!matched)
          setRosterMatchedPosition((matched?.position ?? "").trim())
          setRosterMatchedNpbId((matched?.npb_player_id ?? "").trim())
          if (matched) {
            const stripeKey =
              (matched.team_code ?? "").trim() || (matched.team ?? "").trim()
            setRosterStripeKey(stripeKey)
          } else {
            setRosterStripeKey("")
          }
          const extra: Record<string, string> = {}
          for (const p of players) {
            const full = rosterEnglishFullFromCsvRow(p)
            if (!full) continue
            Object.assign(extra, rosterEnglishAliasKeys(p.name_ja, full))
          }
          setRosterRomanExtra(extra)
        }
      )
      .catch(() => {
        if (cancelled) return
        setIsRosterPlayer(false)
        setRosterMatchedPosition("")
        setRosterMatchedNpbId("")
        setRosterStripeKey("")
      })
      .finally(() => {
        if (!cancelled) setRosterMainReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [displayName, playerIdNormalized])

  // URLから表示名・英字名を取得（useSearchParamsは初回レンダーで空になるため window.location を使用）
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const nameFromQuery = params.get("name")
    const romanFromQuery = params.get("roman")
    if (nameFromQuery) {
      try {
        setDisplayName(decodeURIComponent(nameFromQuery))
      } catch {
        setDisplayName(nameFromQuery)
      }
    } else {
      const pathParts = window.location.pathname.split("/").filter(Boolean)
      const playerIdFromPath = pathParts[pathParts.length - 1]
      if (playerIdFromPath && playerIdFromPath !== "players") {
        try {
          setDisplayName(decodeURIComponent(playerIdFromPath))
        } catch {
          setDisplayName(playerIdFromPath)
        }
      }
    }
    if (romanFromQuery) {
      try {
        setDisplayRomanName(decodeURIComponent(romanFromQuery))
      } catch {
        setDisplayRomanName(romanFromQuery)
      }
    } else {
      setDisplayRomanName(null)
    }
  }, [pathname])

  // 青柳: 「今季の成績」投球パイロット（3/15 試合・pitcher 2103788 のデータを表示）
  const isAoyagiPage =
    compactPlayerName(displayName) === compactPlayerName("青柳晃洋") ||
    playerSegmentCore === "2103788" ||
    playerIdNormalized === "2103788" ||
    playerSegmentCore === AOYAGI_NPB_ID ||
    playerIdNormalized === AOYAGI_NPB_ID ||
    compactPlayerName(playerIdNormalized) === compactPlayerName("青柳晃洋")
  /** 菊池今季パイロット: 判定・API 用 playerId は lib/resolveSeasonPilotQueryId に集約（再発防止） */
  const isKikuchiPage = isKikuchiPlayerPage({
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
  })
  const isFabianPage = isFabianPlayerPage({
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
  })
  /**
   * 投手の「今季の成績」PoC シェル（未連携は「—」「ー」）。
   * 菊池（打者パイロット）は除外。名簿のポジションが空欄の場合は投手扱い（rosterPitcher.ts 参照）。
   */
  const showPitcherSeasonSuganoUi =
    !isKikuchiPage &&
    !pathMatchesKikuchiPilot(pathname) &&
    (isAoyagiPage ||
      (isRosterPlayer &&
        isPitcherRegistrationPosition(rosterMatchedPosition, {
          rosterNpbPlayerId: rosterMatchedNpbId,
        })))
  /**
   * 2026 名簿の野手：菊池と同じ今季成績（見出し・表）。投手ページは対象外。
   * 名簿 API 応答前でもファビアン・菊池パイロット（パス判定）では今季ブロックを出す。
   */
  const showFielderSeasonPilotUi =
    !showPitcherSeasonSuganoUi &&
    ((isRosterPlayer &&
      isFielderRegistrationPosition(rosterMatchedPosition, {
        rosterNpbPlayerId: rosterMatchedNpbId,
      })) ||
      isFabianPage ||
      isKikuchiPage)
  const seasonPilotPlayerId = resolveSeasonStatsPilotQueryId({
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    playerSegmentClean,
    displayName,
    displayRomanName,
  })
  /** 名簿にいる選手・パイロット対象のみ「今季／通算」タブと今季ブロックを出す */
  const showSeasonCareerTabs =
    isRosterPlayer ||
    isAoyagiPage ||
    isKikuchiPage ||
    isFabianPage

  /**
   * 今季ブロックは statsTab === "season" のときだけ描画。名簿照合が遅いと一時的に showSeasonCareerTabs が偽になるが、
   * ここで career に落とすと照合成功後も通算のまま残り得た（初期 career との組み合わせ）。
   * 非名簿ページは通算表示が (!showSeasonCareerTabs || statsTab === "career") で担保されるため、既定は season のまま維持する。
   */
  useEffect(() => {
    if (
      showSeasonCareerTabs &&
      (showPitcherSeasonSuganoUi || showFielderSeasonPilotUi)
    ) {
      setStatsTab("season")
    }
  }, [
    showSeasonCareerTabs,
    showPitcherSeasonSuganoUi,
    showFielderSeasonPilotUi,
    playerIdNormalized,
  ])

  /** Phase 3: ?yahooGameId= で試合切替。未指定時は広島中日 PoC 既定（青柳のみ別試合 2021040084） */
  useEffect(() => {
    if (!showPitcherSeasonSuganoUi) {
      setGamePitchTypes(null)
      setZoneStats(null)
      return
    }
    const gid =
      yahooGameIdParam ||
      (isAoyagiPage ? "2021040084" : DEFAULT_YAHOO_GAME_ID_HIROSHIMA_CHUNICHI_20260327)
    const npb = rosterMatchedNpbId.trim() || (isAoyagiPage ? AOYAGI_NPB_ID : "")
    if (!gid || !npb) {
      setGamePitchTypes(null)
      setZoneStats(null)
      return
    }
    let cancelled = false
    const base = `/api/games/${encodeURIComponent(gid)}/pitchers/npb/${encodeURIComponent(npb)}`
    setGamePitchTypes(null)
    setZoneStats(null)
    Promise.all([
      fetch(`${base}/pitch-types`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/zone-stats`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([pt, zs]) => {
        if (cancelled) return
        setGamePitchTypes(pt as GamePitchTypesData | null)
        setZoneStats(zs as { vsRight: ZoneStat[]; vsLeft: ZoneStat[] } | null)
      })
      .catch(() => {
        if (!cancelled) {
          setGamePitchTypes(null)
          setZoneStats(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    showPitcherSeasonSuganoUi,
    yahooGameIdParam,
    isAoyagiPage,
    rosterMatchedNpbId,
    pitcherSeasonPocPayload,
  ])

  /** Phase 2/6: `_data/derived/player_season_pitching_poc` を API 経由で取得（捕手別含む） */
  useEffect(() => {
    if (!showPitcherSeasonSuganoUi) {
      setPitcherSeasonPocPayload(null)
      return
    }
    const id = playerIdNormalized.trim()
    if (!id) {
      setPitcherSeasonPocPayload(null)
      return
    }
    let cancelled = false
    const y = DERIVED_SEASON_YEAR_DEFAULT
    fetch(
      `/api/players/${encodeURIComponent(id)}/season-pitching?year=${encodeURIComponent(y)}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PitcherSeasonPitchingApiResponse | null) => {
        if (cancelled || !data) return
        setPitcherSeasonPocPayload(data.hasData && data.payload ? data.payload : null)
      })
      .catch(() => {
        if (!cancelled) setPitcherSeasonPocPayload(null)
      })
    return () => {
      cancelled = true
    }
  }, [showPitcherSeasonSuganoUi, playerIdNormalized])

  /** Phase 7: 期間別（月・週）派生 JSON */
  useEffect(() => {
    if (!showPitcherSeasonSuganoUi) {
      setPitcherSeasonPitchingPeriodPayload(null)
      return
    }
    const id = playerIdNormalized.trim()
    if (!id) {
      setPitcherSeasonPitchingPeriodPayload(null)
      return
    }
    let cancelled = false
    const y = DERIVED_SEASON_YEAR_DEFAULT
    fetch(
      `/api/players/${encodeURIComponent(id)}/season-pitching-period?year=${encodeURIComponent(y)}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PitcherSeasonPitchingPeriodApiResponse | null) => {
        if (cancelled || !data) return
        setPitcherSeasonPitchingPeriodPayload(
          data.hasData && data.payload ? data.payload : null
        )
      })
      .catch(() => {
        if (!cancelled) setPitcherSeasonPitchingPeriodPayload(null)
      })
    return () => {
      cancelled = true
    }
  }, [showPitcherSeasonSuganoUi, playerIdNormalized])

  const pitcherPeriodMonthRows = useMemo(
    () =>
      pitcherSeasonPitchingPeriodPayload?.rows.filter((r) => r.split_type === "calendar_month") ??
      [],
    [pitcherSeasonPitchingPeriodPayload]
  )
  const pitcherPeriodWeekRows = useMemo(
    () =>
      pitcherSeasonPitchingPeriodPayload?.rows.filter((r) => r.split_type === "calendar_week") ??
      [],
    [pitcherSeasonPitchingPeriodPayload]
  )

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    if (year === 2025) {
      router.push("/")
    } else {
      router.push(`/${year}`)
    }
  }

  const yearOptions = Array.from({ length: 77 }, (_, i) => 2026 - i)
  const rankingHref = `/ranking/${selectedYear}/PL`
  /** 見出し左帯・ヘッダー縦帯と同じ所属色 */
  const sectionStripeColor = useMemo(
    () =>
      isRosterPlayer && rosterStripeKey
        ? rankingTeamStripeColor(rosterStripeKey)
        : teamColors[playerData.team] || "#666",
    [isRosterPlayer, rosterStripeKey]
  )

  const pitcherPocTeamTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocTeamVsRows(pitcherSeasonPocPayload)
        : EMPTY_TEAM_VS_ROWS,
    [pitcherSeasonPocPayload]
  )

  const pitcherPocCatcherTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocCatcherRows(pitcherSeasonPocPayload)
        : [{ label: "—", cells: Array.from({ length: 7 }, () => "—") }],
    [pitcherSeasonPocPayload]
  )

  const pitcherPocHomeAwayTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocHomeAwayRows(pitcherSeasonPocPayload)
        : (["ホーム", "アウェー"] as const).map((label) => ({
            label,
            era: "—",
            wl: "—",
            ip: "—",
            k_bb_pct: "—",
            k_pct: "—",
            whip: "—",
            avg: "—",
          })),
    [pitcherSeasonPocPayload]
  )

  const pitcherPocDayNightTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocDayNightRows(pitcherSeasonPocPayload)
        : (["デー", "ナイター"] as const).map((label) => ({
            label,
            era: "—",
            wl: "—",
            ip: "—",
            k_bb_pct: "—",
            k_pct: "—",
            whip: "—",
            qs_pct: "—",
          })),
    [pitcherSeasonPocPayload]
  )

  const pitcherPocMaxInning = useMemo(() => {
    const fallback = 9
    const maxFromData =
      pitcherSeasonPocPayload?.splits?.byInning?.reduce((m, r) => Math.max(m, r.inning ?? 0), 0) ?? 0
    // 延長は通常 10〜12 回。異常値で縦に伸びすぎないよう上限だけ安全策を置く。
    return Math.min(18, Math.max(fallback, maxFromData))
  }, [pitcherSeasonPocPayload])

  const pitcherPocStadiumTable = useMemo(
    () =>
      pitcherSeasonPocPayload != null
        ? pitcherPocStadiumRows(pitcherSeasonPocPayload)
        : EMPTY_STADIUM_VS_ROWS,
    [pitcherSeasonPocPayload]
  )

  return (
    <div
      className="min-h-screen text-white latin font-light"
      style={{
        background: "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)",
      }}
    >
      <div data-build-marker={BUILD_MARKER} style={{ display: "none" }} />
      {/* Header */}
      {isMobile ? (
        <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333] py-1 px-3">
          <div className="flex items-center justify-between relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
              aria-label="メニューを開く"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className="block w-full h-0.5 bg-[#ffff44]" />
                <span className="block w-full h-0.5 bg-[#ffff44]" />
                <span className="block w-full h-0.5 bg-[#ffff44]" />
              </div>
            </button>
            <Link href="/" className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="Short-Stop" width={28} height={28} className="object-contain" />
            </Link>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-2 py-0.5 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#333]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
              <Image src="/logo.png" alt="Short-Stop" width={36} height={36} className="object-contain" />
              <span className="text-[#ffff44] text-base font-bold tracking-tight">Short-Stop</span>
            </Link>
            <nav className="flex flex-1 flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
              <Link href="/" className="hover:text-[#ffff44] transition-colors">
                トップ
              </Link>
              <Link href={rankingHref} className="hover:text-[#ffff44] transition-colors">
                成績一覧
              </Link>
              <span className="text-gray-500 cursor-not-allowed">ドラフト情報</span>
            </nav>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="bg-[#1a1a1a] text-[#ffff44] border border-[#555] rounded px-3 py-1 text-sm bebas cursor-pointer hover:bg-[#2a2a2a] transition-colors shrink-0"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </header>
      )}

      {isMobile && <TopPageMobileDrawer open={isMenuOpen} onClose={() => setIsMenuOpen(false)} selectedYear={selectedYear} />}

      {/* Main Content */}
      <main
        className={
          isMobile
            ? `container mx-auto px-5 py-8 ${forceMobile ? "max-w-[420px]" : "max-w-[800px]"}`
            : "max-w-6xl mx-auto px-8 py-10"
        }
        style={isMobile ? { paddingLeft: "20px", paddingRight: "20px" } : undefined}
      >
        {!rosterMainReady ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center py-20">
            <SectionLoadingSpinner className="py-8" />
          </div>
        ) : (
          <>
            {/* Player Name & Stats Tabs */}
            <div
              className={
                isMobile
                  ? "flex flex-row items-center justify-between gap-3 mb-8"
                  : "flex flex-row items-center justify-between gap-4 mb-8"
              }
            >
              <div
                className="flex items-center gap-2"
                style={
                  showPitcherSeasonSuganoUi
                    ? { transform: "scale(0.9)", transformOrigin: "left center" }
                    : undefined
                }
              >
            {/* Team Color Bar */}
            <div
              className="w-1.5 h-12 flex-shrink-0"
              style={{ backgroundColor: sectionStripeColor }}
            />
            {/* Player Info */}
            <div className="flex flex-col">
              <h1
                className={`${isMobile ? "text-[1.75rem]" : "text-[1.5rem]"} leading-tight latin font-light`}
                style={{
                  textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                  fontWeight: 900,
                }}
              >
                {displayName}
              </h1>
              {(() => {
                const mergedRoman = { ...playerRomanNames, ...rosterRomanExtra }
                const romanFull =
                  mergedRoman[displayName] ?? mergedRoman[compactPlayerName(displayName)] ?? ""
                const fromRoster = romanFull.trim()
                /** ランキング等の ?roman= は略式のため、名簿にフル英字があるときはそちらを優先 */
                const romanToShow =
                  fromRoster ||
                  (displayRomanName && displayRomanName.trim() ? displayRomanName.trim() : null)
                return romanToShow ? (
                  <span className="latin text-sm text-gray-400 leading-tight mt-0.5">
                    {romanToShow}
                  </span>
                ) : null
              })()}
            </div>
          </div>
          {/* Stats Tab Buttons（名簿・パイロット対象のみ） */}
          {showSeasonCareerTabs && (
            <div
              className="relative isolate box-border flex min-h-9 shrink-0 items-stretch overflow-hidden"
              style={{
                border: "1px solid #555",
                backgroundColor: "#1a1a1a",
              }}
            >
              <div
                className="absolute inset-y-0 left-0 w-1/2 transition-transform duration-200 ease-out"
                style={{
                  backgroundColor: "#FFFF44",
                  transform: statsTab === "career" ? "translateX(100%)" : "translateX(0)",
                }}
              />
              <button
                type="button"
                onClick={() => setStatsTab("season")}
                className="relative z-10 m-0 flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap rounded-none border-0 bg-transparent px-4 py-1.5 text-[11px] font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                style={{
                  color: statsTab === "season" ? "#000000" : "#9ca3af",
                }}
              >
                今季の成績
              </button>
              <button
                type="button"
                onClick={() => setStatsTab("career")}
                className="relative z-10 m-0 flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-1.5 text-[11px] font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                style={{
                  color: statsTab === "career" ? "#000000" : "#9ca3af",
                }}
              >
                通算成績
              </button>
            </div>
          )}
        </div>

        {/* Profile Table */}
        <div
          className={showPitcherSeasonSuganoUi ? "mb-6" : showFielderSeasonPilotUi ? "mb-6" : "mb-12"}
          style={
            showPitcherSeasonSuganoUi || showFielderSeasonPilotUi
              ? {
                  transform: "scale(0.7)",
                  transformOrigin: "top left",
                  width: "142.857%",
                  marginBottom: showPitcherSeasonSuganoUi ? "-2.5rem" : undefined,
                }
              : undefined
          }
        >
          <table className="w-full border-collapse" style={{ border: "1px solid #333333" }}>
            <tbody style={{ fontWeight: 900, lineHeight: 1.35, fontSize: "0.875rem" }}>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    width: "120px",
                    fontWeight: 900,
                  }}
                >
                  生年月日
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.birthDate}（{playerData.age}歳）
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  出身地
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.birthPlace}
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  プロ入り
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.proDebut}
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  経歴
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.career}
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  生涯年俸
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.totalSalary}
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  チーム成績
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.championships}
                </td>
              </tr>
              <tr>
                <td
                  className="px-2 py-1.5"
                  style={{
                    backgroundColor: "#FFFF44",
                    color: "#000000",
                    border: "1px solid #333333",
                    fontWeight: 900,
                  }}
                >
                  FA取得（推定）
                </td>
                <td className="px-2 py-1.5" style={{ border: "1px solid #333333" }}>
                  {playerData.faYear}
                </td>
              </tr>
            </tbody>
          </table>
          {/* 名簿野手: 今季サブタブ（プロフィール表・今季ブロックと同じ幅に収める） */}
          {showSeasonCareerTabs &&
            statsTab === "season" &&
            !showPitcherSeasonSuganoUi &&
            showFielderSeasonPilotUi && (
              <div
                className="relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mt-7 mb-5"
                style={{
                  border: "1px solid #555",
                  backgroundColor: "#1a1a1a",
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-1/4 transition-transform duration-200 ease-out"
                  style={{
                    backgroundColor: "#FFFF44",
                    transform:
                      kikuchiSeasonDetailTab === "basic"
                        ? "translateX(0)"
                        : kikuchiSeasonDetailTab === "pitch"
                          ? "translateX(100%)"
                          : kikuchiSeasonDetailTab === "situation"
                            ? "translateX(200%)"
                            : "translateX(300%)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setKikuchiSeasonDetailTab("basic")}
                  className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                  style={{
                    color: kikuchiSeasonDetailTab === "basic" ? "#000000" : "#9ca3af",
                  }}
                >
                  基本成績
                </button>
                <button
                  type="button"
                  onClick={() => setKikuchiSeasonDetailTab("pitch")}
                  className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                  style={{
                    color: kikuchiSeasonDetailTab === "pitch" ? "#000000" : "#9ca3af",
                  }}
                >
                  球種情報
                </button>
                <button
                  type="button"
                  onClick={() => setKikuchiSeasonDetailTab("situation")}
                  className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                  style={{
                    color: kikuchiSeasonDetailTab === "situation" ? "#000000" : "#9ca3af",
                  }}
                >
                  状況別
                </button>
                <button
                  type="button"
                  onClick={() => setKikuchiSeasonDetailTab("period")}
                  className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                  style={{
                    color: kikuchiSeasonDetailTab === "period" ? "#000000" : "#9ca3af",
                  }}
                >
                  期間別
                </button>
              </div>
            )}
          {/* 名簿野手・今季: 通算などは同一 scale コンテナ内に置く（別ラッパーだと transform のレイアウト高さで大きな空きが出る） */}
          {showSeasonCareerTabs &&
            statsTab === "season" &&
            !showPitcherSeasonSuganoUi &&
            showFielderSeasonPilotUi && (
              <>
                <SeasonStatsPilot
                  playerId={seasonPilotPlayerId}
                  seasonDetailTab={kikuchiSeasonDetailTab}
                  layout={layout}
                  looseSpacing
                  rosterFielderShell={showFielderSeasonPilotUi}
                  rosterPrimaryPositionLabel={rosterMatchedPosition || undefined}
                  headingStripeColor={sectionStripeColor}
                />
                {kikuchiSeasonDetailTab === "pitch" && (
                  <PitchDetailsPilot
                    playerId={seasonPilotPlayerId}
                    layout={layout}
                    headingStripeColor={sectionStripeColor}
                  />
                )}
              </>
            )}
        </div>

        {/* 今季の成績（投手 PoC シェル） */}
        {showSeasonCareerTabs && statsTab === "season" && (
          <div>
            {/* 投手: 青柳ページと同じ「今季の成績」見出し・表構成（未連携は「—」「ー」） */}
            {showPitcherSeasonSuganoUi && (
              <div
                style={{
                  transform: "scale(0.7)",
                  transformOrigin: "top left",
                  width: "142.857%",
                }}
              >
                {/* Detail Tab Buttons（main の横パディングまで #1a1a1a で埋める） */}
                <div
                  className={
                    isMobile
                      ? "relative isolate box-border mb-6 flex min-h-10 w-[calc(100%+2.5rem)] max-w-none shrink-0 -mx-5 items-stretch overflow-hidden"
                      : "relative isolate box-border mb-6 flex min-h-10 w-[calc(100%+4rem)] max-w-none shrink-0 -mx-8 items-stretch overflow-hidden"
                  }
                  style={{
                    border: "1px solid #555",
                    backgroundColor: "#1a1a1a",
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0 w-1/4 transition-transform duration-200 ease-out"
                    style={{
                      backgroundColor: "#FFFF44",
                      transform:
                        pitcherSeasonSubTab === "basic"
                          ? "translateX(0)"
                          : pitcherSeasonSubTab === "pitch"
                            ? "translateX(100%)"
                            : pitcherSeasonSubTab === "situation"
                              ? "translateX(200%)"
                              : "translateX(300%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPitcherSeasonSubTab("basic")}
                    className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: pitcherSeasonSubTab === "basic" ? "#000000" : "#9ca3af",
                    }}
                  >
                    基本成績
                  </button>
                  <button
                    type="button"
                    onClick={() => setPitcherSeasonSubTab("pitch")}
                    className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: pitcherSeasonSubTab === "pitch" ? "#000000" : "#9ca3af",
                    }}
                  >
                    球種情報
                  </button>
                  <button
                    type="button"
                    onClick={() => setPitcherSeasonSubTab("situation")}
                    className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: pitcherSeasonSubTab === "situation" ? "#000000" : "#9ca3af",
                    }}
                  >
                    状況別
                  </button>
                  <button
                    type="button"
                    onClick={() => setPitcherSeasonSubTab("period")}
                    className="relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: pitcherSeasonSubTab === "period" ? "#000000" : "#9ca3af",
                    }}
                  >
                    期間別
                  </button>
                </div>

                {pitcherSeasonSubTab === "basic" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      基本成績
                    </h2>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">防御率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">試合</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">先発</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">救援</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝利</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">敗戦</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">Ｓ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">ＨＰ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">QS</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow1(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">完投</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完封</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">無四球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">回数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打者</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">投球数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">P/IP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被安</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K%</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow2(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">被本</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">三振</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">四球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">故意四</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">死球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">暴投</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">失点</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">自責</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">WHIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">QS率</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocBasicRow3(pitcherSeasonPocPayload)
                              : Array.from({ length: 10 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        対チーム別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                チーム
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">防御率</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">回数</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">K％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocTeamTable.map((row) => (
                              <tr key={row.team} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  <div className="flex items-center gap-1 min-h-[1.25rem]">
                                    <div
                                      className="w-1 h-4 flex-shrink-0"
                                      style={{
                                        backgroundColor:
                                          row.team === "巨人"
                                            ? "#ff6600"
                                            : row.team === "阪神"
                                              ? "#ffde00"
                                              : row.team === "ＤｅＮＡ"
                                                ? "#0067c0"
                                                : row.team === "ヤクルト"
                                                  ? "#2bbb3f"
                                                  : row.team === "中日"
                                                    ? "#004ea2"
                                                    : row.team === "広島"
                                                      ? "#d60718"
                                                      : row.team === "日本ハム"
                                                        ? "#0077c8"
                                                        : row.team === "楽天"
                                                          ? "#7a0019"
                                                          : row.team === "西武"
                                                            ? "#004098"
                                                            : row.team === "ロッテ"
                                                              ? "#6b7280"
                                                              : row.team === "オリックス"
                                                                ? "#b79e51"
                                                                : row.team === "ソフトバンク"
                                                                  ? "#ffdb00"
                                                                  : "#666666",
                                      }}
                                    />
                                    <span>{row.team}</span>
                                  </div>
                                </td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "1.25rem" }}>
                    <div
                      style={{
                        transform: "scale(1.2)",
                        transformOrigin: "top left",
                        width: "83.333%",
                        paddingTop: "2rem",
                        marginBottom: "1.35rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        左右別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "48px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                条件
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被安打</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                { label: "対右", key: "vsR" as const },
                                { label: "対左", key: "vsL" as const },
                              ] as const
                            ).map(({ label, key }) => {
                              const agg =
                                pitcherSeasonPocPayload?.splits?.vsHand?.[key] ?? null
                              const cells =
                                agg && pitcherSeasonPocPayload
                                  ? pitcherPocHandCells(agg)
                                  : Array.from({ length: 7 }, () => "—")
                              return (
                              <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-0 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {label}
                                </td>
                                {cells.map((cell, i) => (
                                  <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>

                    <div style={{ paddingTop: "2.75rem" }}>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-0`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      投球指標
                    </h2>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">QS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HQS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">SQS率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被BABIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被出塁率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被長打率</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow1(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">GO/AO</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">援護率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IPR</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB%</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">FIP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HR/9</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K-BB％</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow2(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-hidden overflow-x-auto mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "collapse",
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <tbody>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">K％</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB％</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">LOB%</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">PR</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSAA</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSWIN</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocMetricRow3(pitcherSeasonPocPayload)
                              : Array.from({ length: 7 }, () => "—")
                            ).map((cell, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      コース別の投球成績（対右打者）
                    </h2>
                    <div className="overflow-x-auto flex justify-center mb-4">
                      <div
                        className="inline-grid grid-cols-5 gap-0"
                        style={{
                          border: "0.5px solid #888888",
                          background: "#000000",
                          minWidth: "min(95vw, 380px)",
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((row) =>
                          [1, 2, 3, 4, 5].map((col) => {
                            const z = (row - 1) * 5 + col
                            const isStrikeZone = [7, 8, 9, 12, 13, 14, 17, 18, 19].includes(z)
                            const stat = zoneStats?.vsRight?.find((s) => s.zoneId === z)
                            const opsVal = stat?.ops ?? "ー"
                            const avgVal = stat?.avg ?? "ー"
                            const hrVal = stat?.hr != null ? String(stat.hr) : "ー"
                            return (
                              <div
                                key={z}
                                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-h-[60px]"
                                style={{
                                  border: isStrikeZone ? "1.5px solid #FFFF44" : "0.5px solid #888888",
                                  backgroundColor: "#000000",
                                  color: "#e5e5e5",
                                }}
                              >
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被OPS</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{opsVal}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被打率</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{avgVal}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被本</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{hrVal}</span>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 latin">
                      5×5グリッド（投手目線＝投手がマウンドから見る視点。外角高→内角低）。中央9マス＝ストライクゾーン。被OPS・被打率・被本塁打は決着球のゾーン別。
                    </p>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      コース別の投球成績（対左打者）
                    </h2>
                    <div className="overflow-x-auto flex justify-center mb-4">
                      <div
                        className="inline-grid grid-cols-5 gap-0"
                        style={{
                          border: "0.5px solid #888888",
                          background: "#000000",
                          minWidth: "min(95vw, 380px)",
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((row) =>
                          [1, 2, 3, 4, 5].map((col) => {
                            const z = (row - 1) * 5 + col
                            const isStrikeZone = [7, 8, 9, 12, 13, 14, 17, 18, 19].includes(z)
                            const stat = zoneStats?.vsLeft?.find((s) => s.zoneId === z)
                            const opsVal = stat?.ops ?? "ー"
                            const avgVal = stat?.avg ?? "ー"
                            const hrVal = stat?.hr != null ? String(stat.hr) : "ー"
                            return (
                              <div
                                key={z}
                                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-h-[60px]"
                                style={{
                                  border: isStrikeZone ? "1.5px solid #FFFF44" : "0.5px solid #888888",
                                  backgroundColor: "#000000",
                                  color: "#e5e5e5",
                                }}
                              >
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被OPS</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{opsVal}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被打率</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{avgVal}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] latin">
                                  <span className="opacity-70">被本</span>
                                  <span className="latin font-black tabular-nums text-[12px]">{hrVal}</span>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 latin">
                      5×5グリッド（投手目線＝投手がマウンドから見る視点。外角高→内角低）。中央9マス＝ストライクゾーン。被OPS・被打率・被本塁打は決着球のゾーン別。
                    </p>
                    </div>
                  </>
                )}

                {pitcherSeasonSubTab === "pitch" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      球種一覧
                    </h2>
                    {gamePitchTypes?.rows?.length ? (
                      <>
                        <p className="text-sm text-gray-400 mb-4">
                          試合 <span className="text-gray-200 font-mono tabular-nums">{gamePitchTypes.game_id}</span>
                          の球種別（URL に{" "}
                          <code className="text-gray-300">?yahooGameId=</code> で試合を切り替え可能）
                        </p>
                        <div className="mb-6">
                          <PitchTypePieChart
                            rows={gamePitchTypes.rows.map((r) => ({
                              pitch_type: r.pitch_type,
                              pitches: r.pitches,
                              pct: r.pct,
                            }))}
                          />
                        </div>
                        <div className="overflow-x-auto overflow-y-hidden mb-12">
                          <table
                            className="text-xs"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              borderCollapse: "separate",
                              borderSpacing: 0,
                              border: "1px solid #555",
                              width: "100%",
                              minWidth: "473px",
                              tableLayout: "fixed",
                            }}
                          >
                            <colgroup>
                              <col style={{ width: "102px" }} />
                              <col style={{ width: "95px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "48px" }} />
                              <col style={{ width: "57px" }} />
                            </colgroup>
                            <thead>
                              <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                                <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                  球種
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  平均球速
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  割合
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  Strike％
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  空振り％
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  被打率
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  被OPS
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {gamePitchTypes.rows.map((row) => (
                                <tr key={row.pitch_type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                  <td
                                    className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                    style={{ backgroundColor: "#1a1a1a" }}
                                  >
                                    {row.pitch_type}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 whitespace-nowrap">
                                    {row.avg_speed_kmh != null ? (
                                      <>
                                        <span className="latin">{row.avg_speed_kmh.toFixed(1)}</span>
                                        <span className="latin text-[11px] opacity-90"> km/h</span>
                                      </>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {row.pct.toFixed(1)}%
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {row.strike_pct}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {row.whiff_pct}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {row.avg}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {row.ops ?? "—"}
                                  </td>
                                </tr>
                              ))}
                              {gamePitchTypes.total_row && (
                                <tr
                                  key="__total_row"
                                  style={{ backgroundColor: "rgba(255, 255, 68, 0.12)" }}
                                >
                                  <td
                                    className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                    style={{ backgroundColor: "#1a1a1a" }}
                                  >
                                    {gamePitchTypes.total_row.pitch_type}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    —
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {gamePitchTypes.total_row.pct.toFixed(1)}%
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {gamePitchTypes.total_row.strike_pct}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {gamePitchTypes.total_row.whiff_pct}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {gamePitchTypes.total_row.avg}
                                  </td>
                                  <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                    {gamePitchTypes.total_row.ops ?? "—"}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-400 mb-4">
                          （球種データなし。広島・中日 PoC 試合に登板した投手は既定の{" "}
                          <code className="text-gray-300">yahooGameId</code> で自動取得。他は{" "}
                          <code className="text-gray-300">?yahooGameId=</code> を指定。青柳は別既定試合）
                        </p>
                        <div className="overflow-x-auto overflow-y-hidden mb-12">
                          <table
                            className="text-xs"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              borderCollapse: "separate",
                              borderSpacing: 0,
                              border: "1px solid #555",
                              width: "100%",
                              minWidth: "473px",
                              tableLayout: "fixed",
                            }}
                          >
                            <colgroup>
                              <col style={{ width: "102px" }} />
                              <col style={{ width: "95px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "57px" }} />
                              <col style={{ width: "48px" }} />
                              <col style={{ width: "57px" }} />
                            </colgroup>
                            <thead>
                              <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                                <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                  球種
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  平均球速
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  割合
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  Strike％
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  空振り％
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  被打率
                                </th>
                                <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  被OPS
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[14px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  —
                                </td>
                                {Array.from({ length: 6 }, (_, i) => (
                                  <td
                                    key={i}
                                    className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    —
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}

                {pitcherSeasonSubTab === "situation" && (
                  <>
                    {/* 状況別の投球成績（菊池ページ「状況別の打撃成績」と同じ条件列・ランナー別） */}
                    <div className="w-full mb-7">
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        状況別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "auto",
                            minWidth: "520px",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "52px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "60px" }} />
                            {/* K-BB％ / K％ を BB％と同じ横幅に揃える */}
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                条件
                              </th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被安打</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                              <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(pitcherSeasonPocPayload
                              ? pitcherPocSituationRows(pitcherSeasonPocPayload)
                              : [
                                  "無し",
                                  "1塁",
                                  "2塁",
                                  "3塁",
                                  "1・2塁",
                                  "1・3塁",
                                  "2・3塁",
                                  "満塁",
                                  "非得点圏",
                                  "得点圏",
                                ].map((label) => ({
                                  label,
                                  cells: Array.from({ length: 7 }, () => "ー"),
                                }))
                            ).map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-0.5 py-1 text-center align-middle latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                {row.cells.map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "3rem" }}>
                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        球場別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                球場
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocStadiumTable.map((row) => (
                              <tr key={row.venue} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  <div className="flex items-center gap-1 min-h-[1.25rem]">
                                    <div
                                      className="w-1 h-4 flex-shrink-0"
                                      style={{
                                        backgroundColor:
                                          row.teamLabel === "日本ハム"
                                            ? "#0077c8"
                                            : row.teamLabel === "楽天"
                                              ? "#7a0019"
                                              : row.teamLabel === "西武"
                                                ? "#004098"
                                                : row.teamLabel === "ロッテ"
                                                  ? "#222222"
                                                  : row.teamLabel === "オリックス"
                                                    ? "#b79e51"
                                                    : row.teamLabel === "ソフトバンク"
                                                      ? "#ffdb00"
                                                      : row.teamLabel === "巨人"
                                                        ? "#ff6600"
                                                        : row.teamLabel === "ヤクルト"
                                                          ? "#2bbb3f"
                                                          : row.teamLabel === "ＤｅＮＡ" || row.teamLabel === "横浜"
                                                            ? "#0067c0"
                                                            : row.teamLabel === "中日"
                                                              ? "#004ea2"
                                                              : row.teamLabel === "阪神"
                                                                ? "#ffde00"
                                                                : row.teamLabel === "広島"
                                                                  ? "#d60718"
                                                                  : "#666666",
                                      }}
                                    />
                                    <span>{row.venue}</span>
                                  </div>
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ paddingTop: "3rem" }}>
                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "1.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-0`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        ホーム&ビジター別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                種別
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocHomeAwayTable.map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.avg}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: `6px solid ${sectionStripeColor}`,
                        fontWeight: 900,
                      }}
                    >
                      イニング別の投球成績
                    </h2>
                    <div className="overflow-x-auto overflow-y-hidden mb-4">
                      <table
                        className="text-xs"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderCollapse: "separate",
                          borderSpacing: 0,
                          border: "1px solid #555",
                          width: "100%",
                          tableLayout: "fixed",
                        }}
                      >
                        <colgroup>
                          <col style={{ width: "58px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              イニング
                            </th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">打数</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被本塁打</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: pitcherPocMaxInning }, (_, i) => i + 1).map((inn) => {
                            const label = `${inn}回`
                            const cells =
                              pitcherSeasonPocPayload != null
                                ? pitcherPocInningRow(pitcherSeasonPocPayload, inn)
                                : Array.from({ length: 8 }, () => "—")
                            return (
                            <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-0.5 py-1 text-center latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {label}
                              </td>
                              {cells.map((cell, j) => (
                                <td
                                  key={j}
                                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "2.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        捕手別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                捕手
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocCatcherTable.map((row, ri) => (
                              <tr
                                key={`${row.label}-${ri}`}
                                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                              >
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                {row.cells.map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        デー&ナイター別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "65px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                種別
                              </th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                              <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPocDayNightTable.map((row) => (
                              <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                <td
                                  className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                  style={{ backgroundColor: "#1a1a1a" }}
                                >
                                  {row.label}
                                </td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                                <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                    </div>
                  </>
                )}

                {pitcherSeasonSubTab === "period" && (
                  <>
                    <div
                      style={{
                        transform: "scale(1.1)",
                        transformOrigin: "top left",
                        width: "90.909%",
                        marginBottom: "2.75rem",
                      }}
                    >
                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        月間別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                月
                              </th>
                              {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "QS％"].map((h) => (
                                <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPeriodMonthRows.length > 0
                              ? pitcherPeriodMonthRows.map((row) => (
                                  <tr
                                    key={`m-${row.split_value}`}
                                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                  >
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.split_label}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {formatEra(row.era)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      —
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.ip}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {kMinusBbPctOfBf(row.so, row.bb, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {pctOfBf(row.so, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.whip != null ? row.whip.toFixed(3) : "—"}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      —
                                    </td>
                                  </tr>
                                ))
                              : [
                                  { month: "～4月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "5月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "6月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "7月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "8月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "9月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "10月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                  { month: "11月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー" },
                                ].map((row) => (
                                  <tr key={row.month} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.month}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">ー</td>
                                  </tr>
                                ))}
                          </tbody>
                        </table>
                      </div>

                      <h2
                        className={`${tb} mb-4 pl-4 mt-8`}
                        style={{
                          borderLeft: `6px solid ${sectionStripeColor}`,
                          fontWeight: 900,
                        }}
                      >
                        週間別の投球成績
                      </h2>
                      <div className="overflow-x-auto overflow-y-hidden mb-0">
                        <table
                          className="text-xs"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            border: "1px solid #555",
                            width: "100%",
                            tableLayout: "fixed",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "51px" }} />
                            <col style={{ width: "45px" }} />
                            <col style={{ width: "45px" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                              <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                週間
                              </th>
                              {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "被打率"].map((h) => (
                                <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitcherPeriodWeekRows.length > 0
                              ? pitcherPeriodWeekRows.map((row) => (
                                  <tr
                                    key={`w-${row.split_value}`}
                                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                  >
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      {row.split_label}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {formatEra(row.era)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      —
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.ip}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {kMinusBbPctOfBf(row.so, row.bb, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {pctOfBf(row.so, row.bf)}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.whip != null ? row.whip.toFixed(3) : "—"}
                                    </td>
                                    <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                      {row.avgAgainstApprox}
                                    </td>
                                  </tr>
                                ))
                              : (
                                  <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                                    <td
                                      className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                      style={{ backgroundColor: "#1a1a1a" }}
                                    >
                                      3/10〜3/15
                                    </td>
                                    {Array.from({ length: 7 }, (_, i) => (
                                      <td
                                        key={i}
                                        className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                      >
                                        —
                                      </td>
                                    ))}
                                  </tr>
                                )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 通算成績 */}
        {(!showSeasonCareerTabs || statsTab === "career") && (
          <>
        {/* Section Title */}
        <h2
          className={`${tb} mb-6 pl-4`}
          style={{
            borderLeft: `6px solid ${sectionStripeColor}`,
            fontWeight: 900,
          }}
        >
          キャリアハイの打撃成績（2023年）
        </h2>

        {/* Career High Grid */}
        <div className={isMobile ? "grid grid-cols-2 gap-4 mb-12" : "grid grid-cols-3 gap-4 mb-12"}>
          {careerHighs.map((stat, idx) => (
            <div
              key={idx}
              className="overflow-hidden"
              style={{
                background: "linear-gradient(145deg, #0c0c0c, #000000)",
                border: "1.6px solid #555555",
                borderRadius: "0",
                boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
                aspectRatio: "3 / 2",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className="px-4 py-1.5 text-center latin font-light tabular-nums tracking-tight"
                style={{
                  backgroundColor: "#FFFF44",
                  color: "#000000",
                  fontWeight: 900,
                }}
              >
                {stat.title}
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <div
                  className={`${isMobile ? "text-[3.75rem]" : "text-[2.875rem]"} font-black leading-none mb-4`}
                  style={{
                    fontFamily: '"Bebas Neue", sans-serif',
                    letterSpacing: "1.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stat.value}
                </div>
              </div>
              {stat.year && (
                <div className="px-2 py-1 text-center text-sm" style={{ backgroundColor: "#1f1f1f" }}>
                  {stat.year}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Section Title */}
        <h2
          className={`${tb} mb-6 pl-4`}
          style={{
            borderLeft: `6px solid ${sectionStripeColor}`,
            fontWeight: 900,
          }}
        >
          通算の打撃成績
        </h2>

        {/* Career Stats Table - 縦2列、スライドなしで全表示 */}
        <div className={isMobile ? "mb-4 grid grid-cols-1 gap-4" : "mb-4 grid grid-cols-2 gap-4"}>
          <div className="rounded overflow-hidden min-w-0">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">年度</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">年齢</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">年俸</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">OPS</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打率</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">安打</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">本塁</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打点</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">試合</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打席</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">打数</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">出塁</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">長打</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">得点</th>
                  </tr>
                </thead>
                <tbody>
                  {careerStats.map((stat, idx) => (
                  <tr key={idx} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500 first:border-l-0 font-bold" style={{ backgroundColor: "#FFFF44", color: "#000000" }}>{stat.year}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.age}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.salary.toLocaleString()}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.ops.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.avg.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.hits}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.hr}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.rbi}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.games}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.pa}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.ab}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.obp.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.slg.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          <div className="rounded overflow-hidden min-w-0">
            <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse", border: "1px solid #555", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">年度</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">年齢</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">２Ｂ</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">３Ｂ</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">盗塁</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">盗塁死</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">四球</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">三振</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IsoP</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IsoD</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB%</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K%</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB/K</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">犠打</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">犠飛</th>
                  <th className="px-1 py-0.5 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">死球</th>
                </tr>
              </thead>
              <tbody>
                {careerStats.map((stat, idx) => (
                  <tr key={idx} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500 first:border-l-0 font-bold" style={{ backgroundColor: "#FFFF44", color: "#000000" }}>{stat.year}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.age}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.doubles}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.triples}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.sb}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.cs}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.bb}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.so}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.isop.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.isod.toFixed(3)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.bbp.toFixed(1)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.kp.toFixed(1)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.bbk.toFixed(2)}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.sh}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.sf}</td>
                    <td className="px-1 py-0.5 text-center latin font-black tabular-nums text-[10px] border-l border-gray-500">{stat.hbp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
          </>
        )}
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-8" style={{ backgroundColor: "#000000", borderColor: "#333333" }}>
        <div className="container mx-auto px-5 text-center" style={{ color: "#999" }}>
          <p className="text-sm">© 2025 NPB打撃成績ランキング</p>
        </div>
      </footer>
    </div>
  )
}

export default function PlayerPage() {
  const { isDesktop, forceMobile } = useViewportLayout()

  return (
    <PlayerPageClient
      layout={isDesktop ? "desktop" : "mobile"}
      forceMobile={forceMobile}
    />
  )
}
