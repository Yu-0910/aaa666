"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import SeasonStatsPilot from "@/app/components/SeasonStatsPilot"
import type { ViewportLayout } from "@/lib/viewportLayout"
import { useClientPathname, useClientSearchString, useViewportLayout } from "@/hooks/useIsDesktop"
import { TopPageMobileDrawer } from "@/app/components/top/TopPageMobileDrawer"
import { SITE_TOP_HREF } from "@/lib/siteNavigation"
import SiteFooter from "@/app/components/common/SiteFooter"
import {
  isFabianPlayerPage,
  isKikuchiPlayerPage,
  pathMatchesKikuchiPilot,
  resolveSeasonStatsPilotQueryId,
} from "@/lib/resolveSeasonPilotQueryId"
import { compactPlayerName, rosterNameMatchKey } from "@/lib/playerNameNormalize"
import {
  isCatcherRegistrationPosition,
  isFielderRegistrationPosition,
  isPitcherRegistrationPosition,
} from "@/lib/rosterPitcher"
import { resolveShowCatcherSeasonTab } from "@/lib/playerCatcherSeasonTab"
import { MANUAL_YAHOO_TO_NPB } from "@/lib/yahooNpbBatterIdMap.manual"
import { rosterEnglishAliasKeys, rosterEnglishFullFromCsvRow } from "@/lib/rosterEnglishDisplay"
import {
  isPlaceholderPlayerPageId,
  resolveNpbIdFromRomanAlias,
} from "@/lib/playerPageAlias"
import { rankingTeamStripeColor } from "@/lib/ranking/teamStripeColor"
import { formatSlashStatDisplay } from "@/lib/battingRateFormat"
import {
  enrichCareerPitchingRow,
  enrichCareerPitchingRows,
} from "@/lib/careerPitchingEnrich"
import type {
  PitcherSeasonPocPayload,
  PitcherSeasonPitchingApiResponse,
  PitcherSeasonPitchingPeriodApiResponse,
  PitcherSeasonPitchingPeriodPayload,
} from "@/lib/pitcherSeasonPocTypes"
import { hasPitchTypeVsHandSidePanelData } from "@/lib/pitcherSeasonPocUi"
import type { PitcherSeasonPitchTypesApiResponse } from "@/app/api/players/[playerId]/season-pitch-types/route"
import PitcherSeasonPitchTypesTable from "@/app/components/PitcherSeasonPitchTypesTable"
import {
  EMPTY_PITCH_TYPE_VS_HAND_PANELS,
  type PitchTypeVsHandPanelsOpenState,
} from "@/app/components/PitchTypeSplitViewsSection"
import type { PitcherSeasonPitchTypesPayload } from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import { useCatcherSeasonDerived } from "@/hooks/useCatcherSeasonDerived"
import { usePinnedSeasonSubTabRail } from "@/hooks/usePinnedSeasonSubTabRail"
import { usePinnedSubTabContentScroll } from "@/hooks/usePinnedSubTabContentScroll"
import {
  PITCHER_PROFILE_UI_SCALE,
  useScaleLayoutCollapse,
} from "@/hooks/useScaleLayoutCollapse"
import { usePlayerMatchupDerived } from "@/hooks/usePlayerMatchupDerived"
import { usePlayerGameLogDerived } from "@/hooks/usePlayerGameLogDerived"
import { useBatterVsTeamCountPitchTypesDerived } from "@/hooks/useBatterVsTeamCountPitchTypesDerived"
import {
  playerPagePath,
  type PlayerPageSection,
} from "@/lib/playerSlug"
import {
  normalizePlayerPageSectionForTabSync,
  playerPageTabUrlPath,
  resolveFielderSeasonDetailTabFromUrlSegment,
  resolvePitcherSeasonSubTabFromUrlSegment,
  resolveUrlSegmentFromFielderSeasonDetailTab,
  resolveUrlSegmentFromPitcherSeasonSubTab,
} from "@/lib/playerPageTabUrlPhase2"
import {
  activeSeasonSubTabIndex,
  buildFielderSeasonSubTabs,
  buildPitcherSeasonSubTabs,
  type FielderSeasonDetailTab,
  type PitcherSeasonSubTab,
  seasonSubTabSliderTransform,
  seasonSubTabSliderWidthPct,
} from "@/lib/playerMatchupSeasonTab"
import { CareerHighStatGrid } from "@/app/components/player/CareerHighStatGrid"
import {
  buildCareerHighBattingCards,
  careerHighBattingSeasonYear,
  formatCareerHighBattingHeading,
  pickOpsBestCareerHighRow,
} from "@/lib/playerCareerHighBatting"
import {
  buildCareerHighPitchingFromRows,
  formatCareerHighPitchingHeading,
} from "@/lib/playerCareerHighPitching"
import { resolvePitcherPocYahooGameId } from "@/lib/yahooGame/pitcherPocDefaults"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"
import { SectionLoadingSpinner } from "@/components/ui/spinner"
import DerivedPipelineEmptyNotice from "@/app/components/DerivedPipelineEmptyNotice"
import CareerBattingTableRankingStyle from "@/app/components/player/CareerBattingTableRankingStyle"
import { CAREER_TABLE_SCALE_MULTIPLIER, usesPitcherCareerPitchingTableFromRosterMatch } from "@/lib/playerCareerPitchingTablePilot"
import {
  appendCareerTotalRow,
  careerAgeAtYear,
  careerYearLabel,
  formatCareerCell,
  formatSalaryManFromRow,
  splitBattingColumns,
  PITCHING_STAT_COLUMNS,
  splitPitchingColumns,
  type CareerColumnDef,
  type CareerDisplayRow,
} from "@/lib/playerCareerMergedDisplay"
import {
  AOYAGI_NPB_ID,
  battingColsLeft,
  battingColsRight,
  careerTd,
  careerTh,
  careerYearTd,
  FIELDER_PILOT_HEADING_SCALE,
  FIELDER_PILOT_SECTION_STRIPE_PX,
  isItoDaiyaPlayerPage,
  kMinusBbPctOfBf,
  parseBirthDateJa,
  pctOfBf,
  pitchingColsLeft,
  pitchingColsRight,
  playerIdSegmentFromPathname,
  playerRomanNames,
  PLAYER_SEASON_TAB_NUMERICS_CLASS,
  PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS,
  PITCHER_SEASON_NUMERICS_UI_CLASS,
  ITO_DAIYA_PROFILE_UI_CLASS,
  stripQueryHash,
  teamColors,
  type ProfileMergedPayload,
} from "./playerPageShared"
import { PlayerPagePitcherSeasonBody } from "./PlayerPagePitcherSeasonBody"
import { PlayerPageCatcherSeasonBody } from "./PlayerPageCatcherSeasonBody"
import { PlayerPageCareerSection } from "./PlayerPageCareerSection"
import { PlayerPageMatchupBody } from "./PlayerPageMatchupBody"
import { PlayerPageFielderVsTeamPitchBody } from "./PlayerPageFielderVsTeamPitchBody"
import { PlayerPageGameLogBody } from "./PlayerPageGameLogBody"
import { PlayerPageProfileTableBlock } from "./PlayerPageProfileTableBlock"

/** 通算成績行から在籍年数が最多の球団キー（team / team_code）を返す */
function primaryTeamStripeKeyFromCareer(profile: ProfileMergedPayload | null): string {
  if (!profile) return ""
  const yearsByTeam = new Map<string, Set<number>>()
  const addRows = (rows: Array<Record<string, unknown>> | undefined) => {
    for (const row of rows ?? []) {
      const team = String(row.team_code ?? row.team ?? "").trim()
      const year = Number(row.year)
      if (!team || !Number.isFinite(year)) continue
      let years = yearsByTeam.get(team)
      if (!years) {
        years = new Set()
        yearsByTeam.set(team, years)
      }
      years.add(year)
    }
  }
  addRows(profile.career_batting?.rows as Array<Record<string, unknown>> | undefined)
  addRows(profile.career_pitching?.rows as Array<Record<string, unknown>> | undefined)
  let bestTeam = ""
  let bestCount = 0
  for (const [team, years] of yearsByTeam) {
    if (years.size > bestCount) {
      bestCount = years.size
      bestTeam = team
    }
  }
  return bestTeam
}

const PitchTypePieChart = dynamic(() => import("@/app/components/PitchTypePieChart"), { ssr: false })

const SATO_TERUAKI_NAME_KEY = "佐藤輝明"

const SATO_BASIC_CAREER_HIGH_COLUMNS: CareerColumnDef[] = [
  { key: "ops", label: "OPS", kind: "slash3" },
  { key: "avg", label: "打率", kind: "slash3" },
  { key: "hr", label: "本塁打", kind: "int" },
  { key: "rbi", label: "打点", kind: "int" },
  { key: "isop", label: "IsoP", kind: "dec3" },
  { key: "k_pct", label: "K%", kind: "pct1" },
]

function SatoBasicCareerHighTable({
  rows,
  titleClassName,
  stripeColor,
}: {
  rows: CareerDisplayRow[]
  titleClassName: string
  stripeColor: string
}) {
  const bestRow = pickOpsBestCareerHighRow(rows)

  return (
    <section className="mb-7">
      <h2
        className={`${titleClassName} mb-3 pl-4`}
        style={{
          borderLeft: `6px solid ${stripeColor}`,
          fontWeight: 900,
        }}
      >
        基本成績
      </h2>
      <div className="overflow-hidden overflow-x-auto">
        <table
          className="w-full text-xs"
          style={{
            fontVariantNumeric: "tabular-nums",
            borderCollapse: "collapse",
            border: "1px solid #555",
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#FFFF44", color: "#000000" }}>
              {SATO_BASIC_CAREER_HIGH_COLUMNS.map((col) => (
                <th key={col.key} className="px-1 py-1.5 text-center text-[10px] font-bold latin tabular-nums whitespace-nowrap border-l border-gray-500 first:border-l-0">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                borderTop: "1px solid #333",
              }}
            >
              {SATO_BASIC_CAREER_HIGH_COLUMNS.map((col) => (
                <td key={col.key} className="px-1 py-2 text-center latin text-[14px] font-black tabular-nums border-l border-gray-500 first:border-l-0">
                  {bestRow ? formatCareerCell(col, bestRow) : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PlayerPageClient({
  layout,
  forceMobile,
  pageSection,
  initialDisplayName,
  initialDisplayRomanName,
}: {
  layout: ViewportLayout
  forceMobile?: boolean
  pageSection: PlayerPageSection
  initialDisplayName: string
  initialDisplayRomanName?: string | null
}) {
  const isMobile = layout === "mobile"
  const tb = isMobile ? "text-[1.625rem]" : "text-[1.125rem]"
  const BUILD_MARKER = "phase7-career-bat-all-players-20260528"
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(2026)
  /** 既定は今季。名簿照合前は showSeasonCareerTabs が偽でも通算は (!showSeasonCareerTabs || …) で出るため、career 固定より安全 */
  const [statsTab, setStatsTab] = useState<"season" | "career">("season")
  /** 投手「今季の成績」4タブ（PoC シェル）。将来のAPI連携で値を差し替え可能 */
  const [pitcherSeasonSubTab, setPitcherSeasonSubTab] = useState<PitcherSeasonSubTab>("basic")
  /** 球種情報タブを一度離れたら再訪時はグラフアニメーションを抑止（Strict Mode の effect cleanup では立てない） */
  const pitchTabChartsSeenRef = useRef(false)
  const prevPitcherSeasonSubTabRef = useRef<PitcherSeasonSubTab>(pitcherSeasonSubTab)
  const [pitchTypeVsHandPanels, setPitchTypeVsHandPanels] =
    useState<PitchTypeVsHandPanelsOpenState>(EMPTY_PITCH_TYPE_VS_HAND_PANELS)
  /** 投手通算タブ（大野パイロット等）: 通算成績 / キャリアハイ */
  const [pitcherCareerSubTab, setPitcherCareerSubTab] = useState<"total" | "high">("total")
  /** 野手通算タブ: 通算成績 / キャリアハイ */
  const [fielderCareerSubTab, setFielderCareerSubTab] = useState<"total" | "high">("total")
  // 今季サブタブは SeasonStatsPilot の seasonDetailTab でブロックを出し分け。対左右・チーム別は基本成績タブ。状況別は球場・得点圏など。
  // 初期 pitch だと showPilotTab("situation") が偽になり状況別の表が DOM に無い（タップするまで見えない）。既定は基本成績。球種は「球種情報」タブへ。
  const [kikuchiSeasonDetailTab, setKikuchiSeasonDetailTab] =
    useState<FielderSeasonDetailTab>("basic")
  /** 計画書 Phase 6: 投手派生 API の取得完了（未データ時の案内表示に使用） */
  const [pitcherSeasonPocApiSettled, setPitcherSeasonPocApiSettled] = useState(false)
  const [displayName, setDisplayName] = useState(() => String(initialDisplayName ?? "").trim())
  const [displayRomanName, setDisplayRomanName] = useState<string | null>(
    () => initialDisplayRomanName?.trim() || null,
  )
  const [profileMerged, setProfileMerged] = useState<ProfileMergedPayload>(null)
  const [profileMergedSettled, setProfileMergedSettled] = useState(false)
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
    total_row?: GamePitchTypeRow
  }
  const [pitcherSeasonPitchTypesPayload, setPitcherSeasonPitchTypesPayload] =
    useState<PitcherSeasonPitchTypesPayload | null>(null)
  const [pitcherSeasonPitchTypesLoading, setPitcherSeasonPitchTypesLoading] = useState(false)
  const [gamePitchTypes, setGamePitchTypes] = useState<GamePitchTypesData | null>(null)
  /** Phase 2: `_data/derived/player_season_pitching_poc` を API 経由で取得 */
  const [pitcherSeasonPocPayload, setPitcherSeasonPocPayload] =
    useState<PitcherSeasonPocPayload | null>(null)
  /** Phase 7: `_data/derived/player_season_pitching_period` を API 経由で取得 */
  const [pitcherSeasonPitchingPeriodPayload, setPitcherSeasonPitchingPeriodPayload] =
    useState<PitcherSeasonPitchingPeriodPayload | null>(null)
  const router = useRouter()
  const pathname = useClientPathname()
  const clientSearch = useClientSearchString()
  const playerIdFromPath = playerIdSegmentFromPathname(pathname)
  const lastSegmentFromPathname = pathname.split("/").filter(Boolean).pop() || ""
  /**
   * pathname から取れない場合のフォールバック（末尾セグメント）。
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
  const routePlayerSlug = playerIdNormalized
  const showLegacySeasonSubTabs = true

  /** 旧 player-N + ?roman= URL → /players/{npb_id} へ統一 */
  useEffect(() => {
    if (!isPlaceholderPlayerPageId(playerSegmentClean)) return
    const roman = new URLSearchParams(clientSearch).get("roman")
    if (!roman) return
    let cancelled = false
    void resolveNpbIdFromRomanAlias(roman).then((npbId) => {
      if (cancelled || !npbId || npbId === playerSegmentClean) return
      const qs = clientSearch.startsWith("?") ? clientSearch : `?${clientSearch}`
      router.replace(`/players/${npbId}${qs}`)
    })
    return () => {
      cancelled = true
    }
  }, [playerSegmentClean, clientSearch, router])

  /** 個人ページ URL 正規化用 NPB ID（名簿照合 → profile-merged） */
  const canonicalPlayerNpbId = useMemo(() => {
    const fromRoster = rosterMatchedNpbId.trim()
    if (fromRoster) return fromRoster
    if (!profileMergedSettled) return ""
    return String(profileMerged?.npb_player_id ?? "").trim()
  }, [rosterMatchedNpbId, profileMergedSettled, profileMerged?.npb_player_id])

  /** Yahoo 等の公開 ID → 確定した NPB player_id の URL へ統一（名簿・名簿外） */
  useEffect(() => {
    const npb = canonicalPlayerNpbId
    const pathId = playerIdNormalized.trim()
    if (!npb || !pathId || npb === pathId) return
    if (!/^\d+$/.test(pathId)) return
    const qs = clientSearch.startsWith("?") ? clientSearch : clientSearch ? `?${clientSearch}` : ""
    router.replace(`/players/${npb}${qs}`)
  }, [canonicalPlayerNpbId, playerIdNormalized, clientSearch, router])

  useEffect(() => {
    pitchTabChartsSeenRef.current = false
    prevPitcherSeasonSubTabRef.current = pitcherSeasonSubTab
    // playerIdNormalized のみ: サブタブ切替では「既に球種タブを見た」フラグを維持する
  }, [playerIdNormalized])
  useEffect(() => {
    const prev = prevPitcherSeasonSubTabRef.current
    if (prev === "pitch" && pitcherSeasonSubTab !== "pitch") {
      pitchTabChartsSeenRef.current = true
    }
    prevPitcherSeasonSubTabRef.current = pitcherSeasonSubTab
  }, [pitcherSeasonSubTab])
  const animatePitchCharts =
    pitcherSeasonSubTab === "pitch" && !pitchTabChartsSeenRef.current

  useLayoutEffect(() => {
    setRosterMainReady(false)
    if (playerIdNormalized) {
      setDisplayName((prev) => prev || initialDisplayName || playerIdNormalized)
    }
  }, [initialDisplayName, playerIdNormalized])

  useEffect(() => {
    let cancelled = false
    const id = playerIdNormalized.trim()
    const qs =
      id.length > 0 ? `?publicId=${encodeURIComponent(playerIdNormalized)}` : ""
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 15000)
    fetch(`/api/roster/2026${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(
        (data: {
          players?: Array<{
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
          const pathNameKey = id && !/^\d+$/.test(id) ? rosterNameMatchKey(playerIdNormalized) : ""
          const byPathSegment =
            pathNameKey.length > 0
              ? players.find((p) => rosterNameMatchKey(p.name_ja) === pathNameKey)
              : undefined
          const c = rosterNameMatchKey(displayName)
          /** 初回 fetch が state 初期値（近本プレースホルダ）のまま走るのを防ぐ。ランキング等の ?name= 付き URL 向け */
          let nameKeyFromUrl = ""
          if (typeof window !== "undefined") {
            try {
              const qn = new URLSearchParams(window.location.search).get("name")?.trim() ?? ""
              if (qn) {
                try {
                  nameKeyFromUrl = rosterNameMatchKey(decodeURIComponent(qn).normalize("NFC"))
                } catch {
                  nameKeyFromUrl = rosterNameMatchKey(qn)
                }
              }
            } catch {
              nameKeyFromUrl = ""
            }
          }
          const nameKeyFromUrlNorm = nameKeyFromUrl ? rosterNameMatchKey(nameKeyFromUrl) : ""
          const byName = players.find(
            (p) =>
              rosterNameMatchKey(p.name_ja) === c ||
              (nameKeyFromUrlNorm.length > 0 && rosterNameMatchKey(p.name_ja) === nameKeyFromUrlNorm),
          )
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
          if (matched?.name_ja) {
            setDisplayName(matched.name_ja)
          }
          if (matched) {
            const stripeKey =
              (matched.team_code ?? "").trim() || (matched.team ?? "").trim()
            setRosterStripeKey(stripeKey)
          } else {
            setRosterStripeKey("")
          }
          const extra: Record<string, string> = {}
          if (matched) {
            const full = rosterEnglishFullFromCsvRow(matched)
            if (full) {
              Object.assign(extra, rosterEnglishAliasKeys(matched.name_ja, full))
            }
          } else {
            for (const p of players) {
              const full = rosterEnglishFullFromCsvRow(p)
              if (!full) continue
              Object.assign(extra, rosterEnglishAliasKeys(p.name_ja, full))
            }
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
        window.clearTimeout(timeoutId)
        if (!cancelled) setRosterMainReady(true)
      })
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [displayName, playerIdNormalized])

  useEffect(() => {
    let cancelled = false
    setProfileMergedSettled(false)
    setProfileMerged(null)
    const pathId = playerIdNormalized.trim()
    const npbFromRoster = rosterMatchedNpbId.trim()
    const fetchId = npbFromRoster || pathId
    if (!fetchId) {
      setProfileMergedSettled(true)
      return
    }

    const PROFILE_MERGED_TIMEOUT_MS = 120_000

    const loadMerged = (attempt: number) => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), PROFILE_MERGED_TIMEOUT_MS)
      return fetch(
        `/api/players/${encodeURIComponent(fetchId)}/profile-merged?year=${DERIVED_SEASON_YEAR_DEFAULT}`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .then((data: { hasData?: boolean; payload?: ProfileMergedPayload }) => {
          if (cancelled) return
          setProfileMerged(data?.hasData ? (data.payload ?? null) : null)
          setProfileMergedSettled(true)
        })
        .catch(() => {
          if (cancelled) return
          if (attempt < 1) {
            return loadMerged(attempt + 1)
          }
          setProfileMerged(null)
          setProfileMergedSettled(true)
        })
        .finally(() => {
          window.clearTimeout(timeoutId)
        })
    }

    void loadMerged(0)

    return () => {
      cancelled = true
    }
  }, [playerIdNormalized, rosterMatchedNpbId])

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
      if (initialDisplayName) {
        setDisplayName(initialDisplayName)
      } else {
        const playerIdFromPath = playerIdSegmentFromPathname(window.location.pathname)
        if (playerIdFromPath && playerIdFromPath !== "players") {
          try {
            setDisplayName(decodeURIComponent(playerIdFromPath))
          } catch {
            setDisplayName(playerIdFromPath)
          }
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
      setDisplayRomanName(initialDisplayRomanName?.trim() || null)
    }
  }, [initialDisplayName, initialDisplayRomanName, pathname])

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
  const isItoDaiyaPage = isItoDaiyaPlayerPage({
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
    rosterMatchedNpbId,
  })
  const rosterKnownPitcher =
    isRosterPlayer &&
    isPitcherRegistrationPosition(rosterMatchedPosition, {
      rosterNpbPlayerId: rosterMatchedNpbId,
    })
  const rosterKnownFielder =
    isRosterPlayer &&
    isFielderRegistrationPosition(rosterMatchedPosition, {
      rosterNpbPlayerId: rosterMatchedNpbId,
    })
  const rosterKnownCatcher =
    isRosterPlayer && isCatcherRegistrationPosition(rosterMatchedPosition)
  const hasMergedPitchingFromProfile =
    ((profileMerged?.career_pitching?.rows ?? []) as CareerDisplayRow[]).length > 0
  const hasMergedBattingFromProfile =
    ((profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[]).length > 0
  const canFallbackToPitcherFromMergedProfile =
    hasMergedPitchingFromProfile && !rosterKnownFielder && !rosterKnownCatcher
  /** 名簿ポジション空欄は投手・野手両方 true になり得る。打撃のみのときは野手今季 UI を優先 */
  const rosterEmptyPositionPrefersFielderUi =
    isRosterPlayer &&
    !(rosterMatchedPosition || "").trim() &&
    hasMergedBattingFromProfile &&
    !hasMergedPitchingFromProfile &&
    pitcherSeasonPocApiSettled &&
    !pitcherSeasonPocPayload
  const rosterNpbForCareer =
    rosterMatchedNpbId.trim() || playerIdNormalized.trim()
  const pitcherCareerPitchingTablePilot = useMemo(() => {
    const sources: Array<{
      npb_player_id: string
      name_ja: string
      position: string
    }> = []
    if (isRosterPlayer && rosterMatchedNpbId) {
      sources.push({
        npb_player_id: rosterMatchedNpbId,
        name_ja: displayName,
        position: rosterMatchedPosition,
      })
    }
    const mergedNpbId = String(profileMerged?.npb_player_id ?? "").trim()
    if (mergedNpbId && !sources.some((s) => s.npb_player_id === mergedNpbId)) {
      sources.push({
        npb_player_id: mergedNpbId,
        name_ja: String(profileMerged?.name_ja ?? displayName),
        position:
          rosterMatchedPosition ||
          String(profileMerged?.meta?.registration_position ?? "").trim(),
      })
    }
    return sources.some((m) => usesPitcherCareerPitchingTableFromRosterMatch(m))
  }, [
    isRosterPlayer,
    rosterMatchedNpbId,
    displayName,
    rosterMatchedPosition,
    profileMerged,
  ])
  /**
   * 投手の「今季の成績」PoC シェル（未連携は「—」「ー」）。
   * 菊池（打者パイロット）は除外。名簿のポジションが空欄の場合は投手扱い（rosterPitcher.ts 参照）。
   * 名簿未照合の数値 ID は season-pitching 派生データまたは通算投手成績で判定する。
   */
  const showPitcherSeasonSuganoUi =
    !isKikuchiPage &&
    !pathMatchesKikuchiPilot(pathname) &&
    !rosterEmptyPositionPrefersFielderUi &&
    (isAoyagiPage ||
      rosterKnownPitcher ||
      canFallbackToPitcherFromMergedProfile ||
      Boolean(pitcherSeasonPocPayload))
  /** クエリに明示された Yahoo 試合 ID（無ければ空文字） */
  const pitcherPocYahooGameIdExplicit = useMemo(() => {
    const q = clientSearch.replace(/^\?/, "")
    return (new URLSearchParams(q).get("yahooGameId") ?? "").trim()
  }, [clientSearch])
  /** 球種別・コース別 API 用の実効試合 ID（未指定時は season-pitching の最新登板試合） */
  const pitcherPocYahooGameId = useMemo(
    () =>
      resolvePitcherPocYahooGameId({
        explicitFromUrl: pitcherPocYahooGameIdExplicit,
        isAoyagiPage,
        canonicalGames: pitcherSeasonPocPayload?.source?.canonicalGames,
      }),
    [
      pitcherPocYahooGameIdExplicit,
      isAoyagiPage,
      pitcherSeasonPocPayload?.source?.canonicalGames,
    ]
  )
  /**
   * 2026 名簿の野手：菊池と同じ今季成績（見出し・表）。投手ページは対象外。
   * 名簿 API 応答前でもファビアン・菊池パイロット（パス判定）では今季ブロックを出す。
   * 数値 ID（NPB/Yahoo）は名簿・投手派生の判定後に野手 UI を出す（投手を打撃 UI にしない）。
   */
  const numericPilotIdFromPath = /^\d+$/.test(
    String(playerIdNormalized || playerSegmentCore || "").trim()
  )
  const seasonPilotPlayerId = useMemo(() => {
    const resolved = resolveSeasonStatsPilotQueryId({
      pathname,
      playerIdNormalized,
      playerSegmentCore,
      playerSegmentClean,
      displayName,
      displayRomanName,
    })
    if (isKikuchiPage || isFabianPage) return resolved
    const npb = rosterMatchedNpbId.trim()
    if (npb) return npb
    return resolved
  }, [
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    playerSegmentClean,
    displayName,
    displayRomanName,
    isKikuchiPage,
    isFabianPage,
    rosterMatchedNpbId,
  ])
  /** 2026 名簿外・マスタ成績あり選手: 通算成績タブ専用 UI */
  const isCareerOnlyNonRosterPage = useMemo(
    () =>
      !isRosterPlayer &&
      String(profileMerged?.meta?.page_kind ?? "").trim() === "career_only_non_roster",
    [isRosterPlayer, profileMerged],
  )
  const nonRosterHasCareerStats =
    profileMergedSettled &&
    !isRosterPlayer &&
    Boolean(profileMerged) &&
    (hasMergedBattingFromProfile || hasMergedPitchingFromProfile)
  const showCareerOnlyShell =
    profileMergedSettled &&
    Boolean(profileMerged) &&
    (isCareerOnlyNonRosterPage || nonRosterHasCareerStats)
  /** Phase4-B: 2026名簿外でも profile-merged があればプロフィール表のみ表示 */
  const hasProfileOnly = useMemo(() => {
    if (isCareerOnlyNonRosterPage) return false
    if (isRosterPlayer || !profileMergedSettled || !profileMerged?.profile) return false
    const hasCareerStats =
      ((profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[]).length > 0 ||
      ((profileMerged?.career_pitching?.rows ?? []) as CareerDisplayRow[]).length > 0
    if (hasCareerStats) return false
    const p = profileMerged.profile
    return Boolean(
      String(p.birth_date_raw ?? "").trim() ||
        String(p.pro_debut_raw ?? "").trim() ||
        String(p.career_raw ?? "").trim(),
    )
  }, [isCareerOnlyNonRosterPage, isRosterPlayer, profileMergedSettled, profileMerged])

  useEffect(() => {
    if (!hasProfileOnly && !showCareerOnlyShell) return
    const ja = String(profileMerged?.name_ja ?? "").trim()
    if (ja) setDisplayName(ja)
  }, [hasProfileOnly, showCareerOnlyShell, profileMerged?.name_ja])

  /** 名簿外の数値 ID は profile-merged 確定まで今季 API を叩かない */
  const deferNonRosterNumericPilot =
    numericPilotIdFromPath && !isRosterPlayer && !profileMergedSettled

  /** 名簿未確定の数値 ID 向けに season-pitching を先読みして投手か判定する */
  const shouldProbePitcherSeasonData =
    !hasProfileOnly &&
    !showCareerOnlyShell &&
    !deferNonRosterNumericPilot &&
    !isKikuchiPage &&
    !pathMatchesKikuchiPilot(pathname) &&
    !isFabianPage &&
    (isAoyagiPage ||
      rosterKnownPitcher ||
      (numericPilotIdFromPath && rosterMainReady && !rosterKnownFielder))
  const showFielderSeasonPilotUi =
    !hasProfileOnly &&
    !showCareerOnlyShell &&
    !deferNonRosterNumericPilot &&
    !showPitcherSeasonSuganoUi &&
    (isFabianPage ||
      isKikuchiPage ||
      rosterKnownFielder ||
      (numericPilotIdFromPath &&
        rosterMainReady &&
        pitcherSeasonPocApiSettled &&
        !pitcherSeasonPocPayload &&
        !hasMergedPitchingFromProfile))
  /** 名簿にいる選手・パイロット対象に加え、数値ID（NPB/Yahoo）を持つページは今季ブロックを出す */
  const showSeasonCareerTabs =
    !hasProfileOnly &&
    !showCareerOnlyShell &&
    (isRosterPlayer ||
      isAoyagiPage ||
      isKikuchiPage ||
      isFabianPage ||
      numericPilotIdFromPath ||
      /^\d+$/.test(String(seasonPilotPlayerId || "").trim()))

  useEffect(() => {
    if (!showCareerOnlyShell) return
    setStatsTab("career")
    setPitcherCareerSubTab("total")
    setFielderCareerSubTab("total")
  }, [showCareerOnlyShell, playerIdNormalized])

  /** 選手切替時のみタブを初期化（名簿照合後に通算タブへ戻さない） */
  const lastStatsTabInitForPlayerRef = useRef("")
  useEffect(() => {
    const id = playerIdNormalized.trim()
    if (!id || id === lastStatsTabInitForPlayerRef.current) return
    lastStatsTabInitForPlayerRef.current = id
    if (typeof window === "undefined") return
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab === "career") {
      setStatsTab("career")
      return
    }
    if (tab === "season") {
      setStatsTab("season")
      return
    }
    setStatsTab("season")
    setPitcherCareerSubTab("total")
    setFielderCareerSubTab("total")
  }, [playerIdNormalized])

  const leaveCatcherTabIfActive = useCallback(() => {
    setKikuchiSeasonDetailTab((t) => (t === "catcher" ? "basic" : t))
  }, [])

  const catcherDerivedEnabled =
    showSeasonCareerTabs && statsTab === "season" && showFielderSeasonPilotUi

  const catcherSeasonDerived = useCatcherSeasonDerived({
    enabled: catcherDerivedEnabled,
    playerId: seasonPilotPlayerId,
    rosterKnownCatcher,
    onLeaveCatcherTab: leaveCatcherTabIfActive,
  })

  const showCatcherSeasonTab = useMemo(
    () =>
      resolveShowCatcherSeasonTab({
        rosterPosition: rosterMatchedPosition,
        isRosterPlayer,
        catcherAppearances: catcherSeasonDerived.appearances,
      }),
    [isRosterPlayer, rosterMatchedPosition, catcherSeasonDerived.appearances]
  )

  const fielderSeasonSubTabs = useMemo(
    () => buildFielderSeasonSubTabs(showCatcherSeasonTab),
    [showCatcherSeasonTab],
  )
  const pitcherSeasonSubTabs = useMemo(() => buildPitcherSeasonSubTabs(), [])

  const playerMatchupDerivedFielder = usePlayerMatchupDerived({
    enabled:
      showSeasonCareerTabs &&
      statsTab === "season" &&
      showFielderSeasonPilotUi &&
      !showPitcherSeasonSuganoUi &&
      kikuchiSeasonDetailTab === "matchup",
    playerId: seasonPilotPlayerId,
    role: "batter",
  })

  const batterVsTeamPitchDerived = useBatterVsTeamCountPitchTypesDerived({
    enabled:
      showSeasonCareerTabs &&
      statsTab === "season" &&
      showFielderSeasonPilotUi &&
      !showPitcherSeasonSuganoUi &&
      kikuchiSeasonDetailTab === "vs_team_pitch",
    playerId: seasonPilotPlayerId,
  })

  const playerMatchupDerivedPitcher = usePlayerMatchupDerived({
    enabled:
      showSeasonCareerTabs &&
      statsTab === "season" &&
      showPitcherSeasonSuganoUi &&
      pitcherSeasonSubTab === "matchup",
    playerId: seasonPilotPlayerId,
    role: "pitcher",
  })

  useEffect(() => {
    setPitchTypeVsHandPanels(EMPTY_PITCH_TYPE_VS_HAND_PANELS)
  }, [pitcherSeasonPocPayload?.npbPlayerId])

  useEffect(() => {
    if (!showSeasonCareerTabs || showCareerOnlyShell) return
    const segment = normalizePlayerPageSectionForTabSync(pageSection)
    setStatsTab("season")
    setPitcherSeasonSubTab(resolvePitcherSeasonSubTabFromUrlSegment(segment))
    setKikuchiSeasonDetailTab(
      resolveFielderSeasonDetailTabFromUrlSegment(segment, showCatcherSeasonTab),
    )
  }, [pageSection, playerIdNormalized, showCatcherSeasonTab, showCareerOnlyShell, showSeasonCareerTabs])

  const playerGameLogDerived = usePlayerGameLogDerived({
    enabled: showSeasonCareerTabs && statsTab === "season" && pageSection === "game-log",
    playerId: seasonPilotPlayerId,
  })

  const togglePitchTypeVsHandPanel = useCallback(
    (section: "paRound" | "count", side: "left" | "right") => {
      setPitchTypeVsHandPanels((prev) => {
        const key = side === "left" ? "leftOpen" : "rightOpen"
        return {
          ...prev,
          [section]: { ...prev[section], [key]: !prev[section][key] },
        }
      })
    },
    [],
  )

  /** 個人ページ URL から yahooGameId は見せない。実効 ID 解決は内部 state 側で継続する。 */
  useEffect(() => {
    if (typeof window === "undefined") return
    const qs = clientSearch.startsWith("?") ? clientSearch.slice(1) : clientSearch
    if (!qs) return
    const params = new URLSearchParams(qs)
    if (!params.has("yahooGameId")) return
    params.delete("yahooGameId")
    const next = params.toString()
    const nextUrl = next ? `${pathname}?${next}` : pathname
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl === nextUrl) return
    window.history.replaceState(window.history.state, "", nextUrl)
  }, [clientSearch, pathname])

  /**
   * 試合単位の球種別（gamePitchTypes）。コース別ゾーン表示は廃止。
   */
  useEffect(() => {
    if (!showPitcherSeasonSuganoUi) {
      setGamePitchTypes(null)
      return
    }
    const gid = pitcherPocYahooGameId
    const npb = rosterMatchedNpbId.trim() || (isAoyagiPage ? AOYAGI_NPB_ID : "")
    let cancelled = false
    const base =
      gid && npb
        ? `/api/games/${encodeURIComponent(gid)}/pitchers/npb/${encodeURIComponent(npb)}`
        : ""

    setGamePitchTypes(null)
    if (!base) return

    fetch(`${base}/pitch-types`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((pt) => {
        if (!cancelled) setGamePitchTypes(pt as GamePitchTypesData | null)
      })
      .catch(() => {
        if (!cancelled) setGamePitchTypes(null)
      })

    return () => {
      cancelled = true
    }
  }, [
    showPitcherSeasonSuganoUi,
    pitcherPocYahooGameId,
    isAoyagiPage,
    rosterMatchedNpbId,
  ])

  /** Phase 2/6: `_data/derived/player_season_pitching_poc` を API 経由で取得（捕手別含む） */
  useEffect(() => {
    if (!shouldProbePitcherSeasonData) {
      setPitcherSeasonPocPayload(null)
      setPitcherSeasonPocApiSettled(false)
      return
    }
    const id = playerIdNormalized.trim()
    if (!id) {
      setPitcherSeasonPocPayload(null)
      setPitcherSeasonPocApiSettled(false)
      return
    }
    let cancelled = false
    setPitcherSeasonPocApiSettled(false)
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
      .finally(() => {
        if (!cancelled) setPitcherSeasonPocApiSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [shouldProbePitcherSeasonData, playerIdNormalized])

  /** シーズン通算・球種別（投球データ表） */
  useEffect(() => {
    if (!showPitcherSeasonSuganoUi) {
      setPitcherSeasonPitchTypesPayload(null)
      setPitcherSeasonPitchTypesLoading(false)
      return
    }
    const id = playerIdNormalized.trim()
    if (!id) {
      setPitcherSeasonPitchTypesPayload(null)
      setPitcherSeasonPitchTypesLoading(false)
      return
    }
    let cancelled = false
    setPitcherSeasonPitchTypesLoading(true)
    const y = DERIVED_SEASON_YEAR_DEFAULT
    fetch(
      `/api/players/${encodeURIComponent(id)}/season-pitch-types?year=${encodeURIComponent(y)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PitcherSeasonPitchTypesApiResponse | null) => {
        if (cancelled || !data) return
        setPitcherSeasonPitchTypesPayload(data.hasData && data.payload ? data.payload : null)
      })
      .catch(() => {
        if (!cancelled) setPitcherSeasonPitchTypesPayload(null)
      })
      .finally(() => {
        if (!cancelled) setPitcherSeasonPitchTypesLoading(false)
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
  const sectionStripeColor = useMemo(() => {
    if (isRosterPlayer && rosterStripeKey) {
      return rankingTeamStripeColor(rosterStripeKey)
    }
    if (!isRosterPlayer && profileMerged) {
      const careerTeam = primaryTeamStripeKeyFromCareer(profileMerged)
      if (careerTeam) return rankingTeamStripeColor(careerTeam)
    }
    return "#666"
  }, [isRosterPlayer, rosterStripeKey, profileMerged])
  /** 対左右別と同じ見出し文字・左帯（scale 0.7 後）。通算タブ先頭は上余白なし */
  const careerUsesRankingCareerHeading =
    showFielderSeasonPilotUi || pitcherCareerPitchingTablePilot || showCareerOnlyShell
  const careerHighSectionH2Class = careerUsesRankingCareerHeading
    ? "mb-5 mt-0"
    : `${tb} mb-6 pl-4`
  const careerBattingTotalSectionH2Class = careerUsesRankingCareerHeading
    ? "mb-5 mt-0"
    : `${tb} mb-6 pl-4`
  const careerBattingSectionH2Style = careerUsesRankingCareerHeading
    ? {
        borderLeft: `${FIELDER_PILOT_SECTION_STRIPE_PX}px solid ${sectionStripeColor}`,
        fontWeight: 900 as const,
        fontSize: isMobile
          ? `${1.625 * FIELDER_PILOT_HEADING_SCALE}rem`
          : `${1.125 * FIELDER_PILOT_HEADING_SCALE}rem`,
        paddingLeft: `${1 * FIELDER_PILOT_HEADING_SCALE}rem`,
      }
    : {
        borderLeft: `6px solid ${sectionStripeColor}`,
        fontWeight: 900 as const,
      }

  const routeHasRomanQuery = useMemo(() => {
    if (!clientSearch) return false
    try {
      return new URLSearchParams(clientSearch).has("roman")
    } catch {
      return false
    }
  }, [clientSearch])
  /**
   * 名簿解決前の URL 断片（ローマ字・仮 ID・数値 ID）が一瞬見えるのを防ぐ。
   * 名簿照合が終わるまでは本文を出さず、解決待ちが必要なルートでは profile-merged まで待つ。
   */
  const needsResolvedPlayerShell =
    numericPilotIdFromPath ||
    routeHasRomanQuery ||
    isPlaceholderPlayerPageId(playerIdNormalized)
  const pageShellReady =
    rosterMainReady && (isRosterPlayer || !needsResolvedPlayerShell || profileMergedSettled)
  const pageContentReady = pageShellReady && profileMergedSettled

  const mergedBirthRaw = String(profileMerged?.profile?.birth_date_raw ?? "").trim()
  const mergedProDebut = String(profileMerged?.profile?.pro_debut_raw ?? "").trim()
  const mergedCareer = String(profileMerged?.profile?.career_raw ?? "").trim()
  const mergedSalaryTotal = String(profileMerged?.career_total_salary_display ?? "").trim()
  const mergedSalaryTotalPlain = mergedSalaryTotal
    ? mergedSalaryTotal.split("（")[0]?.trim() || mergedSalaryTotal
    : ""
  const mergedFaDisplay = String(profileMerged?.faEstimate?.domesticFa?.displayValue ?? "").trim()

  const mergedBattingRowsForDisplay = useMemo(() => {
    const rows = (profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[]
    const total = (profileMerged?.career_batting?.total ?? null) as CareerDisplayRow | null
    return appendCareerTotalRow(rows, total)
  }, [profileMerged])

  const mergedPitchingRowsForDisplay = useMemo(() => {
    const rows = enrichCareerPitchingRows(
      (profileMerged?.career_pitching?.rows ?? []) as CareerDisplayRow[],
    )
    const totalRaw = (profileMerged?.career_pitching?.total ?? null) as CareerDisplayRow | null
    const total =
      totalRaw && Object.keys(totalRaw).length > 0 ? enrichCareerPitchingRow(totalRaw) : null
    return appendCareerTotalRow(rows, total)
  }, [profileMerged])

  const hasMergedBatting = mergedBattingRowsForDisplay.length > 0
  const hasMergedPitching = mergedPitchingRowsForDisplay.length > 0

  const careerHighBattingCards = useMemo(
    () =>
      buildCareerHighBattingCards(
        (profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[],
      ),
    [profileMerged],
  )
  const careerHighBattingYear = useMemo(
    () =>
      careerHighBattingSeasonYear(
        (profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[],
      ),
    [profileMerged],
  )
  const showSatoBasicCareerHighTable = useMemo(() => {
    const names = [
      displayName,
      profileMerged?.name_ja,
      profileMerged?.profile?.name,
      profileMerged?.profile?.name_ja,
    ]
    return names.some((name) => rosterNameMatchKey(String(name ?? "")) === SATO_TERUAKI_NAME_KEY)
  }, [
    displayName,
    profileMerged?.name_ja,
    profileMerged?.profile?.name,
    profileMerged?.profile?.name_ja,
  ])
  const careerHighPitching = useMemo(() => {
    if (!pitcherCareerPitchingTablePilot) {
      return { cards: [], seasonYear: null as number | null }
    }
    return buildCareerHighPitchingFromRows(
      (profileMerged?.career_pitching?.rows ?? []) as CareerDisplayRow[],
    )
  }, [profileMerged, pitcherCareerPitchingTablePilot])

  const showCareerBattingSection = hasMergedBatting && !pitcherCareerPitchingTablePilot
  const showCareerPitchingRankingTable =
    pitcherCareerPitchingTablePilot && hasMergedPitching
  const showLegacyPitchingCareerSection = hasMergedPitching && !pitcherCareerPitchingTablePilot

  const useRankingStyleCareerBattingTable = showCareerBattingSection

  /** 通算タブの投手成績表は scale 外のまま。プロフィール表だけ scale して余白を詰める */
  const pitcherCareerPitchingTightLayout =
    showPitcherSeasonSuganoUi &&
    showSeasonCareerTabs &&
    statsTab === "career" &&
    showCareerPitchingRankingTable

  const pitcherProfileScaleStyle =
    showPitcherSeasonSuganoUi || showFielderSeasonPilotUi
      ? {
          transform: "scale(0.7)",
          transformOrigin: "top left",
          width: "142.857%",
        }
      : undefined

  /** 投手・野手の今季: プロフィール表の下でサブタブをヘッダー下に固定 */
  const showSeasonSubTabPinLayout =
    showLegacySeasonSubTabs &&
    showSeasonCareerTabs &&
    statsTab === "season" &&
    (showPitcherSeasonSuganoUi || showFielderSeasonPilotUi)

  const seasonSubTabRail = usePinnedSeasonSubTabRail(showSeasonSubTabPinLayout)
  const pilotProfileScaleCollapse = useScaleLayoutCollapse(showSeasonSubTabPinLayout)
  const pilotTabsScaleCollapse = useScaleLayoutCollapse(
    showSeasonSubTabPinLayout,
    PITCHER_PROFILE_UI_SCALE,
    false,
  )
  const pilotContentScaleCollapse = useScaleLayoutCollapse(showSeasonSubTabPinLayout)

  const seasonSubTabScrollKey = showPitcherSeasonSuganoUi
    ? pitcherSeasonSubTab
    : kikuchiSeasonDetailTab
  usePinnedSubTabContentScroll({
    enabled: showSeasonSubTabPinLayout,
    tabKey: seasonSubTabScrollKey,
    pinTargetRef: seasonSubTabRail.pinTargetRef,
    contentRef: pilotContentScaleCollapse.ref,
  })

  const pilotScaledBlockStyle = (
    collapse: ReturnType<typeof useScaleLayoutCollapse>,
  ): React.CSSProperties => ({
    ...pitcherProfileScaleStyle,
    marginBottom: collapse.marginBottom,
  })

  const stickyPilotInsetClass = isMobile ? "-mx-5 px-5" : "-mx-8 px-8"

  const pitcherInlineSubTabBarShellClass =
    "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mt-7 mb-3"
  const careerInlineSubTabBarShellClass =
    "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mt-10 mb-3"
  /** 通常フロー: プロフィール表との間隔は外側 mt-7 で確保 */
  const pitcherStickySubTabBarShellClass =
    "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mb-3"
  /** 固定時: 外側 mt-7 でプロフィール表との間隔を確保 */
  const fielderStickySubTabBarShellClass =
    "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mb-5"
  const pitcherCareerSubTabBarShellClass =
    "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mt-7 mb-1"
  const pitcherSubTabButtonClass =
    "relative z-10 m-0 flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-150 hover:bg-[#2a2a2a]/50"
  const fielderCareerH2Class = careerUsesRankingCareerHeading ? "mb-3 mt-0" : `${tb} mb-4 pl-4`
  const pitcherCareerH2Class = fielderCareerH2Class

  const renderCareerSubTabBar = (
    active: "total" | "high",
    setActive: (tab: "total" | "high") => void,
    inlineInProfileShell: boolean,
    shellClass?: string,
  ) => (
    <div
      className={
        shellClass ??
        (inlineInProfileShell
          ? careerInlineSubTabBarShellClass
          : isMobile
            ? "relative isolate box-border mb-6 mt-4 flex min-h-10 w-[calc(100%+2.5rem)] max-w-none shrink-0 -mx-5 items-stretch overflow-hidden"
            : "relative isolate box-border mb-6 mt-4 flex min-h-10 w-[calc(100%+4rem)] max-w-none shrink-0 -mx-8 items-stretch overflow-hidden")
      }
      style={{
        border: "1px solid #555",
        backgroundColor: "#1a1a1a",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1/2 transition-transform duration-200 ease-out"
        style={{
          backgroundColor: "#FFFF44",
          transform: active === "total" ? "translateX(0)" : "translateX(100%)",
        }}
      />
      <button
        type="button"
        onClick={() => setActive("total")}
        className={pitcherSubTabButtonClass}
        style={{
          color: active === "total" ? "#000000" : "#9ca3af",
        }}
      >
        通算成績
      </button>
      <button
        type="button"
        onClick={() => setActive("high")}
        className={pitcherSubTabButtonClass}
        style={{
          color: active === "high" ? "#000000" : "#9ca3af",
        }}
      >
        キャリアハイ
      </button>
    </div>
  )

  const renderPitcherCareerSubTabBar = (
    inlineInProfileShell: boolean,
    shellClass?: string,
  ) => renderCareerSubTabBar(pitcherCareerSubTab, setPitcherCareerSubTab, inlineInProfileShell, shellClass)

  const renderFielderCareerSubTabBar = (
    inlineInProfileShell: boolean,
    shellClass?: string,
  ) => renderCareerSubTabBar(fielderCareerSubTab, setFielderCareerSubTab, inlineInProfileShell, shellClass)

  const renderPitcherSeasonSubTabBar = (
    inlineInProfileShell: boolean,
    shellClassOverride?: string,
    shellRef?: React.Ref<HTMLDivElement>,
  ) => {
    const activeIdx = activeSeasonSubTabIndex(pitcherSeasonSubTabs, pitcherSeasonSubTab)
    return (
      <div
        ref={shellRef}
        className={
          shellClassOverride ??
          (inlineInProfileShell
            ? pitcherInlineSubTabBarShellClass
            : isMobile
              ? "relative isolate box-border mb-6 flex min-h-10 w-[calc(100%+2.5rem)] max-w-none shrink-0 -mx-5 items-stretch overflow-hidden"
              : "relative isolate box-border mb-6 flex min-h-10 w-[calc(100%+4rem)] max-w-none shrink-0 -mx-8 items-stretch overflow-hidden")
        }
        style={{
          border: "1px solid #555",
          backgroundColor: "#1a1a1a",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-transform duration-200 ease-out"
          style={{
            backgroundColor: "#FFFF44",
            width: seasonSubTabSliderWidthPct(pitcherSeasonSubTabs.length),
            transform: seasonSubTabSliderTransform(activeIdx),
          }}
        />
        {pitcherSeasonSubTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handlePitcherSeasonSubTabClick(t.key as PitcherSeasonSubTab)}
            className={pitcherSubTabButtonClass}
            style={{
              color: pitcherSeasonSubTab === t.key ? "#000000" : "#9ca3af",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    )
  }

  const renderFielderSeasonSubTabBar = (
    shellClassOverride?: string,
    shellRef?: React.Ref<HTMLDivElement>,
  ) => (
    <div
      ref={shellRef}
      className={
        shellClassOverride ??
        "relative isolate box-border flex min-h-10 w-full min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden mt-7 mb-5"
      }
      style={{
        border: "1px solid #555",
        backgroundColor: "#1a1a1a",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-transform duration-200 ease-out"
        style={{
          backgroundColor: "#FFFF44",
          width: seasonSubTabSliderWidthPct(fielderSeasonSubTabs.length),
          transform: seasonSubTabSliderTransform(
            activeSeasonSubTabIndex(fielderSeasonSubTabs, kikuchiSeasonDetailTab),
          ),
        }}
      />
      {fielderSeasonSubTabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => handleFielderSeasonSubTabClick(t.key as FielderSeasonDetailTab)}
          title={
            t.key === "catcher"
              ? "名簿登録捕手は常に表示。数値は試合派生データに依存します"
              : undefined
          }
          className={pitcherSubTabButtonClass}
          style={{
            color: kikuchiSeasonDetailTab === t.key ? "#000000" : "#9ca3af",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  const routeTabs = useMemo(() => {
    if (!routePlayerSlug || !showSeasonCareerTabs) return []
    const tabs: Array<{ key: PlayerPageSection; label: string; href: string }> = [
      { key: "basic", label: "基本成績", href: playerPagePath(routePlayerSlug, "basic") },
      { key: "advanced", label: "詳細成績", href: playerPagePath(routePlayerSlug, "advanced") },
    ]
    if (showPitcherSeasonSuganoUi) {
      tabs.push({
        key: "pitch-types",
        label: "球種情報",
        href: playerPagePath(routePlayerSlug, "pitch-types"),
      })
    }
    tabs.push(
      { key: "splits", label: "状況別成績", href: playerPagePath(routePlayerSlug, "splits") },
      { key: "game-log", label: "試合別成績", href: playerPagePath(routePlayerSlug, "game-log") },
    )
    return tabs
  }, [routePlayerSlug, showPitcherSeasonSuganoUi, showSeasonCareerTabs])

  const renderRouteTabBar = () => null

  const replaceSeasonTabUrl = useCallback(
    (segment: "basic" | "pitch" | "situation" | "matchup" | "vs-team" | "catcher") => {
      if (typeof window === "undefined" || !routePlayerSlug) return
      const nextPath = playerPageTabUrlPath(routePlayerSlug, segment)
      const qs = clientSearch.startsWith("?") ? clientSearch.slice(1) : clientSearch
      const params = new URLSearchParams(qs)
      params.delete("yahooGameId")
      const nextSearch = params.toString()
      const nextUrl = nextSearch ? `${nextPath}?${nextSearch}` : nextPath
      const currentUrl = `${window.location.pathname}${window.location.search}`
      if (currentUrl === nextUrl) return
      window.history.pushState(window.history.state, "", nextUrl)
    },
    [clientSearch, routePlayerSlug],
  )

  const handlePitcherSeasonSubTabClick = useCallback(
    (tab: PitcherSeasonSubTab) => {
      setPitcherSeasonSubTab(tab)
      replaceSeasonTabUrl(resolveUrlSegmentFromPitcherSeasonSubTab(tab))
    },
    [replaceSeasonTabUrl],
  )

  const handleFielderSeasonSubTabClick = useCallback(
    (tab: FielderSeasonDetailTab) => {
      setKikuchiSeasonDetailTab(tab)
      replaceSeasonTabUrl(resolveUrlSegmentFromFielderSeasonDetailTab(tab))
    },
    [replaceSeasonTabUrl],
  )

  const profileTableProps = {
    mergedBirthRaw,
    mergedProDebut,
    mergedCareer,
    mergedSalaryTotalPlain,
    mergedFaDisplay,
    profileMerged,
    tableClassName: isItoDaiyaPage ? "player-page-profile-table" : undefined,
    showFinancialFields: isRosterPlayer,
  }

  const renderPitcherSeasonMatchupBody = () => (
    <div className={PLAYER_SEASON_TAB_NUMERICS_CLASS}>
      <div className={PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS}>
        <PlayerPageMatchupBody
          tb={tb}
          sectionStripeColor={sectionStripeColor}
          role="pitcher"
          loading={playerMatchupDerivedPitcher.loading}
          settled={playerMatchupDerivedPitcher.settled}
          payload={playerMatchupDerivedPitcher.payload}
        />
      </div>
    </div>
  )

  const renderPitcherSeasonBody = () => (
    <div className={PLAYER_SEASON_TAB_NUMERICS_CLASS}>
      <PlayerPagePitcherSeasonBody
        tb={tb}
        sectionStripeColor={sectionStripeColor}
        pitcherSeasonSubTab={pitcherSeasonSubTab}
        pitcherSeasonPocApiSettled={pitcherSeasonPocApiSettled}
        pitcherSeasonPocPayload={pitcherSeasonPocPayload}
        rosterMainReady={rosterMainReady}
        pitcherSeasonPitchTypesPayload={pitcherSeasonPitchTypesPayload}
        pitcherSeasonPitchTypesLoading={pitcherSeasonPitchTypesLoading}
        gamePitchTypes={gamePitchTypes}
        pitcherSeasonPitchingPeriodPayload={pitcherSeasonPitchingPeriodPayload}
        pitcherPeriodMonthRows={pitcherPeriodMonthRows}
        pitcherPeriodWeekRows={pitcherPeriodWeekRows}
        layout={layout}
        isMobile={isMobile}
        seasonPilotPlayerId={seasonPilotPlayerId}
        catcherAppearances={catcherSeasonDerived.appearances}
        catcherPitchers={catcherSeasonDerived.pitchers}
        catcherDefenseBasic={catcherSeasonDerived.defenseBasic}
        catcherStartingSummary={catcherSeasonDerived.startingSummary}
        catcherPaRoundPitchTypes={catcherSeasonDerived.paRoundPitchTypes}
        showFielderSeasonPilotUi={showFielderSeasonPilotUi}
        kikuchiSeasonDetailTab={kikuchiSeasonDetailTab}
        pitchTypeSidePanelPilot={hasPitchTypeVsHandSidePanelData(pitcherSeasonPocPayload)}
        pitchTypeVsHandPanels={pitchTypeVsHandPanels}
        onPitchTypeVsHandPanelToggle={togglePitchTypeVsHandPanel}
        animatePitchCharts={animatePitchCharts}
        isItoDaiyaPage={isItoDaiyaPage}
      />
    </div>
  )

  const renderFielderSeasonBody = () => (
    <div className={PLAYER_SEASON_TAB_NUMERICS_CLASS}>
      <div className={PITCHER_SEASON_CAREER_HIGH_NUMERICS_CLASS}>
        {kikuchiSeasonDetailTab === "catcher" ? (
          <PlayerPageCatcherSeasonBody
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            derived={catcherSeasonDerived}
            gamePitchTypes={gamePitchTypes}
          />
        ) : kikuchiSeasonDetailTab === "vs_team_pitch" ? (
          <PlayerPageFielderVsTeamPitchBody
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            playerId={seasonPilotPlayerId}
            loading={batterVsTeamPitchDerived.loading}
            settled={batterVsTeamPitchDerived.settled}
            payload={batterVsTeamPitchDerived.payload}
          />
        ) : kikuchiSeasonDetailTab === "matchup" ? (
          <PlayerPageMatchupBody
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            role="batter"
            loading={playerMatchupDerivedFielder.loading}
            settled={playerMatchupDerivedFielder.settled}
            payload={playerMatchupDerivedFielder.payload}
          />
        ) : (
          <SeasonStatsPilot
            playerId={seasonPilotPlayerId}
            seasonDetailTab={kikuchiSeasonDetailTab as any}
            layout={layout}
            looseSpacing
            pinLayoutShell={showSeasonSubTabPinLayout}
            rosterFielderShell={showFielderSeasonPilotUi}
            rosterPrimaryPositionLabel={rosterMatchedPosition || undefined}
            headingStripeColor={sectionStripeColor}
            basicTopContent={
              showSatoBasicCareerHighTable && kikuchiSeasonDetailTab === "basic" ? (
                <SatoBasicCareerHighTable
                  rows={(profileMerged?.career_batting?.rows ?? []) as CareerDisplayRow[]}
                  titleClassName={tb}
                  stripeColor={sectionStripeColor}
                />
              ) : null
            }
          />
        )}
      </div>
    </div>
  )

  return (
    <div
      className={`player-page-fonts min-h-screen text-white${showPitcherSeasonSuganoUi || showFielderSeasonPilotUi ? ` ${PITCHER_SEASON_NUMERICS_UI_CLASS}` : ""}${isItoDaiyaPage ? ` ${ITO_DAIYA_PROFILE_UI_CLASS}` : ""}`}
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
            <Link href={SITE_TOP_HREF} className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
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
            <Link href={SITE_TOP_HREF} className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
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
        {!pageContentReady ? (
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
                className={`player-page-display-name ${isMobile ? "text-[1.75rem]" : "text-[1.5rem]"} leading-tight`}
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
                const nonRosterRomanFull = String(
                  (profileMerged as { name_en_full?: string } | null)?.name_en_full ?? "",
                ).trim()
                /** 名簿外: フル英字（meta）優先。?roman= の略式は使わない */
                const romanToShow = isRosterPlayer
                  ? fromRoster ||
                    (displayRomanName && displayRomanName.trim() ? displayRomanName.trim() : null)
                  : nonRosterRomanFull || fromRoster || null
                return romanToShow ? (
                  <span className="latin text-sm text-gray-400 leading-tight mt-0.5">
                    {romanToShow}
                  </span>
                ) : null
              })()}
            </div>
          </div>
          {/* Stats Tab Buttons（名簿・パイロット対象のみ。通算専用ページは非表示） */}
          {showSeasonCareerTabs && !isCareerOnlyNonRosterPage && (
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
          className={
            pitcherCareerPitchingTightLayout
              ? undefined
              : showPitcherSeasonSuganoUi
                ? statsTab === "season" ||
                    (statsTab === "career" &&
                      showCareerPitchingRankingTable &&
                      showSeasonCareerTabs)
                  ? undefined
                  : "mb-6"
                : showFielderSeasonPilotUi
                  ? showSeasonSubTabPinLayout
                    ? undefined
                    : statsTab === "career" || showCareerOnlyShell
                      ? "mb-2"
                      : "mb-6"
                  : showCareerOnlyShell
                    ? "mb-2"
                    : "mb-12"
          }
          style={
            pitcherCareerPitchingTightLayout
              ? undefined
              : showSeasonSubTabPinLayout
                ? undefined
                : pitcherProfileScaleStyle
          }
        >
          {showSeasonSubTabPinLayout ? (
            <>
              <div
                ref={pilotProfileScaleCollapse.ref}
                style={pilotScaledBlockStyle(pilotProfileScaleCollapse)}
              >
                <PlayerPageProfileTableBlock {...profileTableProps} />
                {renderRouteTabBar()}
              </div>
              <div
                ref={seasonSubTabRail.anchorRef}
                className={`${stickyPilotInsetClass} mt-7`}
                style={{ overflowAnchor: "none" }}
              >
                <div ref={seasonSubTabRail.spacerRef} aria-hidden />
                <div ref={seasonSubTabRail.outerRef}>
                  <div
                    ref={pilotTabsScaleCollapse.ref}
                    style={pilotScaledBlockStyle(pilotTabsScaleCollapse)}
                  >
                    {showLegacySeasonSubTabs &&
                    (showPitcherSeasonSuganoUi
                      ? renderPitcherSeasonSubTabBar(
                          true,
                          pitcherStickySubTabBarShellClass,
                          seasonSubTabRail.pinTargetRef,
                        )
                      : renderFielderSeasonSubTabBar(
                          fielderStickySubTabBarShellClass,
                          seasonSubTabRail.pinTargetRef,
                        ))}
                  </div>
                </div>
              </div>
              <div
                ref={pilotContentScaleCollapse.ref}
                style={pilotScaledBlockStyle(pilotContentScaleCollapse)}
              >
                {pageSection === "game-log" ? (
                  <PlayerPageGameLogBody
                    payload={playerGameLogDerived.payload}
                    loading={playerGameLogDerived.loading}
                    settled={playerGameLogDerived.settled}
                  />
                ) : showPitcherSeasonSuganoUi
                  ? pitcherSeasonSubTab === "matchup"
                    ? renderPitcherSeasonMatchupBody()
                    : renderPitcherSeasonBody()
                  : renderFielderSeasonBody()}
              </div>
            </>
          ) : (
            <>
              <div
                style={
                  pitcherCareerPitchingTightLayout
                    ? { ...pitcherProfileScaleStyle, marginBottom: "-2.5rem" }
                    : undefined
                }
              >
                <PlayerPageProfileTableBlock {...profileTableProps} />
                {renderRouteTabBar()}
              </div>
              {/* 投手: 今季サブタブ（プロフィール表と同じ scale コンテナ内） */}
              {showSeasonCareerTabs &&
                statsTab === "season" &&
                showPitcherSeasonSuganoUi &&
                showLegacySeasonSubTabs &&
                renderPitcherSeasonSubTabBar(true)}
              {showSeasonCareerTabs &&
                statsTab === "career" &&
                showPitcherSeasonSuganoUi &&
                showCareerPitchingRankingTable &&
                !pitcherCareerPitchingTightLayout &&
                renderPitcherCareerSubTabBar(true)}
              {showSeasonCareerTabs &&
                statsTab === "season" &&
                showPitcherSeasonSuganoUi &&
                (pageSection === "game-log" ? (
                  <PlayerPageGameLogBody
                    payload={playerGameLogDerived.payload}
                    loading={playerGameLogDerived.loading}
                    settled={playerGameLogDerived.settled}
                  />
                ) : pitcherSeasonSubTab === "matchup" ? (
                  renderPitcherSeasonMatchupBody()
                ) : (
                  renderPitcherSeasonBody()
                ))}
            </>
          )}
          {/* 名簿野手: 今季サブタブ（プロフィール表・名簿ブロックと同じ幅に揃える） */}
          {showSeasonCareerTabs &&
            statsTab === "season" &&
            !showPitcherSeasonSuganoUi &&
            showFielderSeasonPilotUi &&
            !showSeasonSubTabPinLayout &&
            showLegacySeasonSubTabs &&
            renderFielderSeasonSubTabBar()}
          {showSeasonCareerTabs &&
            statsTab === "career" &&
            !showPitcherSeasonSuganoUi &&
            showFielderSeasonPilotUi &&
            showCareerBattingSection &&
            renderFielderCareerSubTabBar(true)}
          {showCareerOnlyShell &&
            !showPitcherSeasonSuganoUi &&
            showCareerBattingSection &&
            renderFielderCareerSubTabBar(true)}
          {showCareerOnlyShell &&
            showCareerPitchingRankingTable &&
            !pitcherCareerPitchingTightLayout &&
            renderPitcherCareerSubTabBar(true, pitcherCareerSubTabBarShellClass)}
          {showSeasonCareerTabs &&
            statsTab === "season" &&
            !showPitcherSeasonSuganoUi &&
            showFielderSeasonPilotUi &&
            !showSeasonSubTabPinLayout &&
            (pageSection === "game-log" ? (
              <PlayerPageGameLogBody
                payload={playerGameLogDerived.payload}
                loading={playerGameLogDerived.loading}
                settled={playerGameLogDerived.settled}
              />
            ) : (
              renderFielderSeasonBody()
            ))}
        </div>

        {pitcherCareerPitchingTightLayout && (
          <div style={{ ...pitcherProfileScaleStyle, marginBottom: "-0.75rem" }}>
            {renderPitcherCareerSubTabBar(true, pitcherCareerSubTabBarShellClass)}
          </div>
        )}

        {!hasProfileOnly && (
          <PlayerPageCareerSection
            showSeasonCareerTabs={showSeasonCareerTabs || showCareerOnlyShell}
            statsTab={showCareerOnlyShell ? "career" : statsTab}
            pitcherCareerPitchingTightLayout={pitcherCareerPitchingTightLayout}
            pitcherCareerPitchingTablePilot={pitcherCareerPitchingTablePilot}
            showCareerBattingSection={showCareerBattingSection}
            profileMergedSettled={profileMergedSettled}
            profileMerged={profileMerged}
            showCareerPitchingRankingTable={showCareerPitchingRankingTable}
            showLegacyPitchingCareerSection={showLegacyPitchingCareerSection}
            pitcherCareerSubTab={pitcherCareerSubTab}
            fielderCareerSubTab={fielderCareerSubTab}
            careerHighSectionH2Class={careerHighSectionH2Class}
            careerBattingSectionH2Style={careerBattingSectionH2Style}
            careerHighBattingCards={careerHighBattingCards}
            isMobile={isMobile}
            renderPitcherCareerSubTabBar={renderPitcherCareerSubTabBar}
            renderFielderCareerSubTabBar={renderFielderCareerSubTabBar}
            pitcherCareerH2Class={pitcherCareerH2Class}
            careerBattingTotalSectionH2Class={careerBattingTotalSectionH2Class}
            mergedPitchingRowsForDisplay={mergedPitchingRowsForDisplay}
            mergedBirthRaw={mergedBirthRaw}
            careerHighPitching={careerHighPitching}
            fielderCareerH2Class={fielderCareerH2Class}
            useRankingStyleCareerBattingTable={useRankingStyleCareerBattingTable}
            mergedBattingRowsForDisplay={mergedBattingRowsForDisplay}
            careerHighBattingYear={careerHighBattingYear}
            tb={tb}
            sectionStripeColor={sectionStripeColor}
            showSalaryColumn={isRosterPlayer}
            careerTableScaleMultiplier={CAREER_TABLE_SCALE_MULTIPLIER}
          />
        )}
          </>
        )}
      </main>

      <SiteFooter className="mt-12" />
    </div>
  )
}
