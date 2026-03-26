"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { useRouter, usePathname, useParams, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import PitchDetailsPilot from "@/app/components/PitchDetailsPilot"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })

// チーム色の定義
const teamColors: Record<string, string> = {
  H: "#ffde00", // 阪神
  G: "#ff6600", // 巨人
  DB: "#0067c0", // DeNA
  C: "#d60718", // 広島
  D: "#004ea2", // 中日
  S: "#2bbb3f", // ヤクルト
  Bs: "#b79e51", // オリックス
  M: "#222", // ロッテ
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

/** NFC 後に半角・全角の空白を除いた名前比較（CSVやクエリの「姓　名」表記の差を吸収） */
function compactPlayerName(s: string): string {
  return (s || "").normalize("NFC").replace(/[\s\u3000]+/g, "")
}

function stripQueryHash(s: string): string {
  return (s || "").split("?")[0]?.split("#")[0] || ""
}

/** NPB 公式 player_id（master CSV / ランキングリンクでパスが数値のみになることがある） */
const AOYAGI_NPB_ID = "71175132"
const SUGANO_NPB_ID = "41745137"
const KIKUCHI_NPB_ID = "61565135"
const KIKUCHI_YAHOO_ID = "1100082"

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

function PlayerPageClient({ layout, forceMobile }: { layout: ViewportLayout; forceMobile?: boolean }) {
  const isMobile = layout === "mobile"
  const tb = isMobile ? "text-[1.625rem]" : "text-[1.125rem]"
  const BUILD_MARKER = "sugano-season-ui-20260326-01"
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(2025)
  const [statsTab, setStatsTab] = useState<"season" | "career">("career")
  const [detailTab, setDetailTab] = useState<"basic" | "pitch" | "situation" | "period">("basic")
  const [suganoDetailTab, setSuganoDetailTab] = useState<"basic" | "pitch" | "situation" | "period">("basic")
  const [isSuganoUrlMatch, setIsSuganoUrlMatch] = useState(false)
  const [kikuchiSeasonDetailTab, setKikuchiSeasonDetailTab] = useState<
    "basic" | "pitch" | "situation" | "period"
  >("basic")
  const [displayName, setDisplayName] = useState(playerData.name)
  const [displayRomanName, setDisplayRomanName] = useState<string | null>(null)
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
  const router = useRouter()
  const pathname = usePathname()
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const rawPath = window.location.pathname || ""
    let decoded = rawPath
    try {
      decoded = decodeURIComponent(rawPath)
    } catch {
      // ignore
    }
    const key = compactPlayerName(decoded)
    setIsSuganoUrlMatch(key.includes("菅野") || key.includes(SUGANO_NPB_ID))
  }, [pathname])

  // 青柳: 「今季の成績」投球パイロット（3/15 試合・pitcher 2103788 のデータを表示）
  const displayNameNorm = displayName.normalize("NFC")
  const isAoyagiPage =
    compactPlayerName(displayName) === compactPlayerName("青柳晃洋") ||
    playerSegmentCore === "2103788" ||
    playerIdNormalized === "2103788" ||
    playerSegmentCore === AOYAGI_NPB_ID ||
    playerIdNormalized === AOYAGI_NPB_ID ||
    compactPlayerName(playerIdNormalized) === compactPlayerName("青柳晃洋")
  const showAoyagiPitchPilotSeasonUI = isAoyagiPage
  const suganoNameKey = compactPlayerName("菅野智之")
  const isSuganoPage =
    compactPlayerName(displayName) === suganoNameKey ||
    compactPlayerName(displayName).includes("菅野") ||
    playerSegmentCore === "菅野智之" ||
    playerIdNormalized === "菅野智之" ||
    playerSegmentCore === SUGANO_NPB_ID ||
    playerIdNormalized === SUGANO_NPB_ID ||
    compactPlayerName(playerIdNormalized) === suganoNameKey ||
    compactPlayerName(playerIdNormalized).includes("菅野")
  /** 菅野ページ: 青柳のUIのみ（数値・URL表記ゆれ対策済み）。成績データはコピーしない */
  const showSuganoSeasonUI = isSuganoPage || isSuganoUrlMatch
  const kikuchiNameKey = compactPlayerName("菊池涼介")
  const seasonPilotPlayerId =
    playerIdNormalized || playerSegmentCore || (playerSegmentClean || "").replace(/^player-/, "") || displayName
  const isKikuchiPage =
    compactPlayerName(displayName) === kikuchiNameKey ||
    compactPlayerName(displayName).includes("菊池") ||
    playerSegmentCore === "菊池涼介" ||
    playerIdNormalized === "菊池涼介" ||
    playerSegmentCore === KIKUCHI_NPB_ID ||
    playerIdNormalized === KIKUCHI_NPB_ID ||
    playerSegmentCore === KIKUCHI_YAHOO_ID ||
    playerIdNormalized === KIKUCHI_YAHOO_ID ||
    compactPlayerName(playerIdNormalized) === kikuchiNameKey ||
    compactPlayerName(playerIdNormalized).includes("菊池")
  useEffect(() => {
    if (!showAoyagiPitchPilotSeasonUI) return
    fetch("/api/games/2021040084/pitchers/2103788/pitch-types")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GamePitchTypesData | null) => data && setGamePitchTypes(data))
      .catch(() => {})
  }, [showAoyagiPitchPilotSeasonUI])

  useEffect(() => {
    if (!showAoyagiPitchPilotSeasonUI) return
    fetch("/api/games/2021040084/pitchers/2103788/zone-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { vsRight: ZoneStat[]; vsLeft: ZoneStat[] } | null) => data && setZoneStats(data))
      .catch(() => {})
  }, [showAoyagiPitchPilotSeasonUI])

  // 初期表示が「通算成績」のままだと投球パイロット（基本成績タブ）に気づかない／本番URLだけ一致しないとブロック非表示に見えるため、該当選手では「今季の成績」を開く
  useEffect(() => {
    if (showAoyagiPitchPilotSeasonUI) {
      setStatsTab("season")
    }
  }, [showAoyagiPitchPilotSeasonUI, playerIdNormalized])

  useEffect(() => {
    if (showSuganoSeasonUI) {
      setStatsTab("season")
    }
  }, [showSuganoSeasonUI, playerIdNormalized])

  useEffect(() => {
    if (isKikuchiPage) {
      setStatsTab("season")
    }
  }, [isKikuchiPage, playerIdNormalized])

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
              showSuganoSeasonUI
                ? { transform: "scale(0.9)", transformOrigin: "left center" }
                : undefined
            }
          >
            {/* Team Color Bar */}
            <div
              className="w-1.5 h-12 flex-shrink-0"
              style={{ backgroundColor: teamColors[playerData.team] || "#666" }}
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
                const romanToShow = displayRomanName ?? (playerRomanNames[displayName]
                  ? (() => {
                      const parts = playerRomanNames[displayName].split(/\s+/)
                      return parts.length >= 2
                        ? `${parts[0][0].toUpperCase()}.${parts[1]}`
                        : parts[0] ?? ""
                    })()
                  : null)
                return romanToShow ? (
                  <span className="latin text-sm text-gray-400 leading-tight mt-0.5">
                    {romanToShow}
                  </span>
                ) : null
              })()}
            </div>
          </div>
          {/* Stats Tab Buttons */}
          <div
            className="relative flex shrink-0 overflow-hidden"
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
              className="relative z-10 flex flex-1 min-w-[80px] items-center justify-center px-4 py-1.5 font-bold text-[11px] transition-colors duration-150 hover:bg-[#2a2a2a]/50 whitespace-nowrap"
              style={{
                color: statsTab === "season" ? "#000000" : "#9ca3af",
              }}
            >
              今季の成績
            </button>
            <button
              type="button"
              onClick={() => setStatsTab("career")}
              className="relative z-10 flex flex-1 min-w-[80px] items-center justify-center px-4 py-1.5 font-bold text-[11px] transition-colors duration-150 hover:bg-[#2a2a2a]/50"
              style={{
                color: statsTab === "career" ? "#000000" : "#9ca3af",
              }}
            >
              通算成績
            </button>
          </div>
        </div>

        {/* Profile Table */}
        <div
          className={showSuganoSeasonUI || isKikuchiPage ? "mb-6" : "mb-12"}
          style={
            showSuganoSeasonUI || isKikuchiPage
              ? {
                  transform: "scale(0.7)",
                  transformOrigin: "top left",
                  width: "142.857%",
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
        </div>

        {/* 今季の成績（Phase 4: 菊池涼介のみパイロットデータ表示） */}
        {statsTab === "season" && (
          <div>
            {!showSuganoSeasonUI && isKikuchiPage ? (
              <div
                style={{
                  transform: "scale(0.7)",
                  transformOrigin: "top left",
                  width: "142.857%",
                }}
              >
                <div
                  className="relative flex shrink-0 overflow-hidden mb-6"
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
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: kikuchiSeasonDetailTab === "basic" ? "#000000" : "#9ca3af",
                    }}
                  >
                    基本成績
                  </button>
                  <button
                    type="button"
                    onClick={() => setKikuchiSeasonDetailTab("pitch")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: kikuchiSeasonDetailTab === "pitch" ? "#000000" : "#9ca3af",
                    }}
                  >
                    球種情報
                  </button>
                  <button
                    type="button"
                    onClick={() => setKikuchiSeasonDetailTab("situation")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: kikuchiSeasonDetailTab === "situation" ? "#000000" : "#9ca3af",
                    }}
                  >
                    状況別
                  </button>
                  <button
                    type="button"
                    onClick={() => setKikuchiSeasonDetailTab("period")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: kikuchiSeasonDetailTab === "period" ? "#000000" : "#9ca3af",
                    }}
                  >
                    期間別
                  </button>
                </div>
                <SeasonStatsPilot
                  playerId={seasonPilotPlayerId}
                  seasonDetailTab={kikuchiSeasonDetailTab}
                  layout={layout}
                />
                {kikuchiSeasonDetailTab === "pitch" && (
                  <PitchDetailsPilot
                    playerId={seasonPilotPlayerId}
                    layout={layout}
                  />
                )}
              </div>
            ) : (
              <>
                {!showSuganoSeasonUI && (
                  <SeasonStatsPilot
                    playerId={seasonPilotPlayerId}
                    seasonDetailTab={isKikuchiPage ? kikuchiSeasonDetailTab : undefined}
                    layout={layout}
                  />
                )}
                {!showSuganoSeasonUI && (!isKikuchiPage || kikuchiSeasonDetailTab === "pitch") && (
                  <PitchDetailsPilot
                    playerId={seasonPilotPlayerId}
                    layout={layout}
                  />
                )}
              </>
            )}

            {/* 青柳晃洋: 今季基本成績（同一UI・同一成績データ） */}
            {showAoyagiPitchPilotSeasonUI && (
              <>
                {/* Detail Tab Buttons */}
                <div
                  className="relative flex shrink-0 overflow-hidden mb-6"
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
                        detailTab === "basic"
                          ? "translateX(0)"
                          : detailTab === "pitch"
                            ? "translateX(100%)"
                            : detailTab === "situation"
                              ? "translateX(200%)"
                              : "translateX(300%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setDetailTab("basic")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: detailTab === "basic" ? "#000000" : "#9ca3af",
                    }}
                  >
                    基本成績
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("pitch")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: detailTab === "pitch" ? "#000000" : "#9ca3af",
                    }}
                  >
                    球種情報
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("situation")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: detailTab === "situation" ? "#000000" : "#9ca3af",
                    }}
                  >
                    状況別
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab("period")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: detailTab === "period" ? "#000000" : "#9ca3af",
                    }}
                  >
                    期間別
                  </button>
                </div>

                {detailTab === "basic" && (
                  <>
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">連投(試)</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝利</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">敗戦</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HLD</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">Ｓ</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">ＨＰ</th>
                      </tr>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">2.25</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">ＳＰ</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完投</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完封</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">無四球</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">回数</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打者</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">投球数</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">P/IP</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被安</th>
                      </tr>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1.000</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">5.0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">21</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">76</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">15.2</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">4</td>
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
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">3</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">2</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1.20</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 対チーム別の投球成績（3/15阪神戦ベース。該当成績なしは「ー」表示） */}
                <div>
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  対チーム別の投球成績
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
                      <col style={{ width: "95px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
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
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">被打率</th>
                        <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        // パ・リーグ
                        { team: "日本ハム", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "楽天", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "西武", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "ロッテ", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "オリックス", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "ソフトバンク", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        // セ・リーグ
                        { team: "巨人", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "ヤクルト", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "ＤｅＮＡ", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "中日", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { team: "阪神", era: "0.00", ip: "5.0", wl: "1-0", qs_pct: "100.0", k_pct: "14.3", k_bb_pct: "4.8", whip: "1.20", baa: ".211" },
                        { team: "広島", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                      ].map((row) => (
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
                                                        ? "#222222"
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
                          <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>

                {/* 左右別の投球成績（暫定。菊池ページ「左右別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  左右別の投球成績
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
                      <col style={{ width: "95px" }} />
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                          条件
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
                      {[
                        { label: "対右打者", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "対左打者", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                      ].map((row) => (
                        <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.label}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ab}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.bb_pct === "ー" ? "ー" : parseFloat(row.bb_pct) === 100 ? "100％" : parseFloat(row.bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.hr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">HQS率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">SQS率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被BABIP</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被出塁率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被長打率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K-BB％</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">K％</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">BB％</th>
                      </tr>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">0.0%</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0.0%</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">.211</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">.250</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">.286</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1.50</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">5.40</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">3.60</td>
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">HR/9</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">GO/AO</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">援護率</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">IPR</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB%</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">FIP</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">LOB%</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSAA</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">RSWIN</th>
                      </tr>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">0.00</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1.80</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0.00</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">100.0%</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">PR</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">KD</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">失点時回数</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">援護回</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">援護点</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">救援時回数</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">救援時失点</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">NHB</th>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">無失点</th>
                      </tr>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0.0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0.0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">0</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">—</td>
                        <td className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500">1</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* コース別の投球成績（対右打者）（菊池ページ「コース別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
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

                {/* コース別の投球成績（対左打者）（菊池ページ「コース別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
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
                  </>
                )}

                {detailTab === "pitch" && (
                  <>
                {/* 球種一覧（菊池ページ「球種別の打撃成績」と同デザイン・球種別取得データを表示） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  球種一覧
                </h2>
                {gamePitchTypes == null ? (
                  <p className="text-sm text-gray-400 mb-4">球種データを読み込み中...</p>
                ) : (
                  <>
                    {/* 球種の投球割合（円グラフ） */}
                    <PitchTypePieChart rows={gamePitchTypes.rows} />
                    <div className="overflow-x-auto overflow-y-hidden mb-4 mt-8">
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
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.avg_speed_kmh != null ? row.avg_speed_kmh.toFixed(1) + " km/h" : "—"}</td>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.pct.toFixed(1)}%</td>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.strike_pct}</td>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whiff_pct}</td>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.avg}</td>
                            <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                              {(() => {
                                const denom = row.ab + row.bb + row.hbp
                                const obp = denom > 0 ? (row.h + row.bb + row.hbp) / denom : null
                                const slg = row.ab > 0 ? (row.h + 3 * row.hr) / row.ab : null
                                if (obp != null && slg != null) {
                                  const ops = obp + slg
                                  return ops < 1 ? "." + ops.toFixed(3).slice(2) : ops.toFixed(3)
                                }
                                return "—"
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                  </>
                )}

                {detailTab === "situation" && (
                  <>
                {/* 球場別の投球成績（菊池ページ「球場別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  球場別の投球成績
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
                      <col style={{ width: "95px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
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
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        // パ・リーグ本拠・主要球場
                        { venue: "エスコンＦ", teamLabel: "日本ハム", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "楽天モバイル", teamLabel: "楽天", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "ベルーナD", teamLabel: "西武", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "ZOZOマリン", teamLabel: "ロッテ", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "京セラD大阪", teamLabel: "オリックス", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "みずほPayPay", teamLabel: "ソフトバンク", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        // セ・リーグ主要球場
                        { venue: "東京ドーム", teamLabel: "巨人", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "神宮球場", teamLabel: "ヤクルト", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "横浜スタジアム", teamLabel: "ＤｅＮＡ", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "バンテリンD", teamLabel: "中日", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { venue: "甲子園球場", teamLabel: "阪神", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        // マツダ（3/15 阪神戦）
                        { venue: "マツダ", teamLabel: "広島", era: "0.00", ip: "5.0", wl: "1-0", qs_pct: "100.0", k_pct: "14.3", k_bb_pct: "4.8", whip: "1.20", baa: ".211" },
                        // 地方球場（セ・パ問わず、地方開催はすべてここに集約）
                        { venue: "地方球場", teamLabel: "広島", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                      ].map((row) => (
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
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ホーム&ビジター別の投球成績（菊池ページ「ホーム&ビジター別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  ホーム&ビジター別の投球成績
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
                      <col style={{ width: "65px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
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
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          type: "ホーム",
                          era: "0.00",
                          ip: "5.0",
                          wl: "1-0",
                          qs_pct: "100.0",
                          k_pct: "14.3",
                          k_bb_pct: "4.8",
                          whip: "1.20",
                          baa: ".211",
                        },
                        {
                          type: "アウェー",
                          era: "ー",
                          ip: "ー",
                          wl: "ー",
                          qs_pct: "ー",
                          k_pct: "ー",
                          k_bb_pct: "ー",
                          whip: "ー",
                          baa: "ー",
                        },
                      ].map((row) => (
                        <tr key={row.type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.type}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* イニング別の投球成績（暫定。菊池ページ「左右別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
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
                      <col style={{ width: "95px" }} />
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
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
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
                      {[
                        { label: "1回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "2回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "3回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "4回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "5回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "6回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "7回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "8回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                        { label: "9回", era: "ー", ab: "ー", bb_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー", hr: "ー" },
                      ].map((row) => (
                        <tr key={row.label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.label}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ab}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.bb_pct === "ー" ? "ー" : parseFloat(row.bb_pct) === 100 ? "100％" : parseFloat(row.bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.hr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 捕手別の投球成績（3/15阪神戦ベース。菊池ページ「デー&ナイター別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  捕手別の投球成績
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
                      <col style={{ width: "65px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
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
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          catcher: "石原 貴規",
                          era: "0.00",
                          ip: "5.0",
                          wl: "1-0",
                          qs_pct: "100.0",
                          k_pct: "14.3",
                          k_bb_pct: "4.8",
                          whip: "1.20",
                          baa: ".211",
                        },
                      ].map((row) => (
                        <tr key={row.catcher} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.catcher}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* デー&ナイター別の投球成績（菊池ページ「ホーム&ビジター別の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  デー&ナイター別の投球成績
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
                      <col style={{ width: "65px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
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
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          type: "デー",
                          era: "0.00",
                          ip: "5.0",
                          wl: "1-0",
                          qs_pct: "100.0",
                          k_pct: "14.3",
                          k_bb_pct: "4.8",
                          whip: "1.20",
                          baa: ".211",
                        },
                        {
                          type: "ナイター",
                          era: "ー",
                          ip: "ー",
                          wl: "ー",
                          qs_pct: "ー",
                          k_pct: "ー",
                          k_bb_pct: "ー",
                          whip: "ー",
                          baa: "ー",
                        },
                      ].map((row) => (
                        <tr key={row.type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.type}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  </>
                )}

                {detailTab === "period" && (
                  <>
                {/* 月間別の投球成績（菊池ページ「月間の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  月間別の投球成績
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
                      <col style={{ width: "40px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "51px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                        <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                          月
                        </th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { month: "～4月", era: "0.00", ip: "5.0", wl: "1-0", qs_pct: "100.0", k_pct: "14.3", k_bb_pct: "4.8", whip: "1.20", baa: ".211" },
                        { month: "5月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "6月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "7月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "8月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "9月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "10月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
                        { month: "11月", era: "ー", ip: "ー", wl: "ー", qs_pct: "ー", k_pct: "ー", k_bb_pct: "ー", whip: "ー", baa: "ー" },
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
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.qs_pct === "ー" ? "ー" : parseFloat(row.qs_pct) === 100 ? "100％" : parseFloat(row.qs_pct).toFixed(1) + "％"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 週間別の投球成績（菊池ページ「週間の打撃成績」と同デザイン） */}
                <h2
                  className={`${tb} mb-4 pl-4 mt-8`}
                  style={{
                    borderLeft: "6px solid #FF4444",
                    fontWeight: 900,
                  }}
                >
                  週間別の投球成績
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
                      <col style={{ width: "95px" }} />
                      <col style={{ width: "50px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "45px" }} />
                      <col style={{ width: "51px" }} />
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
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">防御率</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">勝‐敗</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">回数</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K-BB％</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">K％</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">BB％</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">WHIP</th>
                        <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          span: "3/10〜3/15",
                          era: "0.00",
                          ip: "5.0",
                          wl: "1-0",
                          bb_pct: "9.5",
                          k_pct: "14.3",
                          k_bb_pct: "4.8",
                          whip: "1.20",
                          baa: ".211",
                        },
                      ].map((row) => (
                        <tr key={row.span} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                          <td
                            className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: "#1a1a1a" }}
                          >
                            {row.span}
                          </td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.era}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.wl}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.ip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_bb_pct === "ー" ? "ー" : parseFloat(row.k_bb_pct) === 100 ? "100％" : parseFloat(row.k_bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.k_pct === "ー" ? "ー" : parseFloat(row.k_pct) === 100 ? "100％" : parseFloat(row.k_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.bb_pct === "ー" ? "ー" : parseFloat(row.bb_pct) === 100 ? "100％" : parseFloat(row.bb_pct).toFixed(1) + "％"}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.whip}</td>
                          <td className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">{row.baa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  </>
                )}
              </>
            )}

            {/* 菅野智之: 青柳ページの「今季の成績」UIのみ（値は表示しない） */}
            {showSuganoSeasonUI && (
              <div
                style={{
                  transform: "scale(0.7)",
                  transformOrigin: "top left",
                  width: "142.857%",
                }}
              >
                {/* Detail Tab Buttons */}
                <div
                  className="relative flex shrink-0 overflow-hidden mb-6"
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
                        suganoDetailTab === "basic"
                          ? "translateX(0)"
                          : suganoDetailTab === "pitch"
                            ? "translateX(100%)"
                            : suganoDetailTab === "situation"
                              ? "translateX(200%)"
                              : "translateX(300%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSuganoDetailTab("basic")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: suganoDetailTab === "basic" ? "#000000" : "#9ca3af",
                    }}
                  >
                    基本成績
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuganoDetailTab("pitch")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: suganoDetailTab === "pitch" ? "#000000" : "#9ca3af",
                    }}
                  >
                    球種情報
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuganoDetailTab("situation")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: suganoDetailTab === "situation" ? "#000000" : "#9ca3af",
                    }}
                  >
                    状況別
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuganoDetailTab("period")}
                    className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 font-bold text-xs transition-colors duration-150 hover:bg-[#2a2a2a]/50"
                    style={{
                      color: suganoDetailTab === "period" ? "#000000" : "#9ca3af",
                    }}
                  >
                    期間別
                  </button>
                </div>

                {suganoDetailTab === "basic" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      基本成績
                    </h2>

                    {/* 以降、値は出さずUIのみ（青柳と同じ見出し＋表構造） */}
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
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">連投(試)</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝利</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">敗戦</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">HLD</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">Ｓ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">ＨＰ</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {Array.from({ length: 10 }, (_, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                —
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
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">ＳＰ</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完投</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">完封</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">無四球</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">勝率</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">回数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被打者</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">投球数</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">P/IP</th>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-gray-500">被安</th>
                          </tr>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderTop: "1px solid #333" }}>
                            {Array.from({ length: 10 }, (_, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                —
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
                            {Array.from({ length: 10 }, (_, i) => (
                              <td
                                key={i}
                                className="px-1 py-2 text-center latin font-black tabular-nums text-[14px] border-l border-gray-500 first:border-l-0"
                              >
                                —
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      対チーム別の投球成績
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
                          <col style={{ width: "95px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
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
                            <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">被打率</th>
                            <th className="px-0 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500">QS％</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 8 }, (_, i) => (
                              <td key={i} className="px-0 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                —
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      左右別の投球成績
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
                          <col style={{ width: "95px" }} />
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
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              条件
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
                          {["対右打者", "対左打者"].map((label) => (
                            <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {label}
                              </td>
                              {Array.from({ length: 8 }, (_, i) => (
                                <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                  —
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {suganoDetailTab === "pitch" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      球種情報
                    </h2>
                    <div className="overflow-x-auto overflow-y-hidden mb-12">
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
                        <thead>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              球種
                            </th>
                            {["投球", "割合", "平均球速", "空振", "見逃", "ファウル", "ボール", "スト率", "空振率", "被打率"].map((h) => (
                              <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums border-l border-b border-gray-500 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 10 }, (_, i) => (
                              <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                —
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {suganoDetailTab === "situation" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      球場別の投球成績
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
                          <col style={{ width: "95px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
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
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr key="venue-dummy" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 8 }, (_, i) => (
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

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      ホーム&ビジター別の投球成績
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
                          <col style={{ width: "65px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
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
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                          </tr>
                        </thead>
                        <tbody>
                          {["ホーム", "アウェー"].map((type) => (
                            <tr key={type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {type}
                              </td>
                              {Array.from({ length: 8 }, (_, i) => (
                                <td
                                  key={i}
                                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                >
                                  —
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
                        borderLeft: "6px solid #FF4444",
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
                          <col style={{ width: "95px" }} />
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
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
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
                          {Array.from({ length: 9 }, (_, i) => `${i + 1}回`).map((label) => (
                            <tr key={label} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {label}
                              </td>
                              {Array.from({ length: 8 }, (_, j) => (
                                <td
                                  key={j}
                                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                >
                                  —
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
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      捕手別の投球成績
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
                          <col style={{ width: "65px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
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
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">被打率</th>
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 8 }, (_, i) => (
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

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      デー&ナイター別の投球成績
                    </h2>
                    <div className="overflow-x-auto overflow-y-hidden mb-12">
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
                            <th className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">QS％</th>
                          </tr>
                        </thead>
                        <tbody>
                          {["デー", "ナイター"].map((type) => (
                            <tr key={type} style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                              <td
                                className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: "#1a1a1a" }}
                              >
                                {type}
                              </td>
                              {Array.from({ length: 8 }, (_, i) => (
                                <td
                                  key={i}
                                  className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500"
                                >
                                  —
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {suganoDetailTab === "period" && (
                  <>
                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      月間別の投球成績
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
                          <col style={{ width: "40px" }} />
                          <col style={{ width: "50px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "51px" }} />
                          <col style={{ width: "45px" }} />
                          <col style={{ width: "45px" }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              月
                            </th>
                            {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "WHIP", "被打率", "QS％"].map((h) => (
                              <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 8 }, (_, i) => (
                              <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                —
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <h2
                      className={`${tb} mb-4 pl-4 mt-8`}
                      style={{
                        borderLeft: "6px solid #FF4444",
                        fontWeight: 900,
                      }}
                    >
                      週間別の投球成績
                    </h2>
                    <div className="overflow-x-auto overflow-y-hidden mb-12">
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
                          <col style={{ width: "45px" }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
                            <th className="px-1 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500 first:border-l-0 sticky left-0 bg-[#FFFF44] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                              週間
                            </th>
                            {["防御率", "勝‐敗", "回数", "K-BB％", "K％", "BB％", "WHIP", "被打率"].map((h) => (
                              <th key={h} className="px-0.5 py-1 text-center font-bold text-[10px] latin tabular-nums whitespace-nowrap border-l border-b border-gray-500">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                            <td
                              className="px-1 py-1 text-left latin font-black tabular-nums text-[13px] border-l border-b border-gray-500 first:border-l-0 sticky left-0 z-20 whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.3)]"
                              style={{ backgroundColor: "#1a1a1a" }}
                            >
                              —
                            </td>
                            {Array.from({ length: 8 }, (_, i) => (
                              <td key={i} className="px-0.5 py-1 text-center latin font-black tabular-nums text-[14px] border-l border-b border-gray-500">
                                —
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 通算成績 */}
        {statsTab === "career" && (
          <>
        {/* Section Title */}
        <h2
          className={`${tb} mb-6 pl-4`}
          style={{
            borderLeft: "6px solid #FF4444",
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
            borderLeft: "6px solid #FF4444",
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
  const isDesktop = useIsDesktop()
  const sp = useSearchParams()

  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-black" aria-busy="true" />
  }

  const forceMobile =
    sp.get("mobile") === "1" ||
    sp.get("view") === "mobile" ||
    sp.has("mobile=1") ||
    sp.has("view=mobile") ||
    (typeof window !== "undefined" &&
      (() => {
        const raw = window.location.search || ""
        try {
          const decoded = decodeURIComponent(raw)
          return decoded.includes("mobile=1") || decoded.includes("view=mobile")
        } catch {
          return raw.includes("mobile%3D1") || raw.includes("view%3Dmobile")
        }
      })())

  return (
    <PlayerPageClient layout={isDesktop ? "desktop" : "mobile"} forceMobile={forceMobile} />
  )
}
