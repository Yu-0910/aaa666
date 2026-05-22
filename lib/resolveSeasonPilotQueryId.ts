/**
 * 菊池涼介の「今季の成績」（SeasonStatsPilot）が空になる不具合の再発防止
 * -----------------------------------------------------------------
 * 原因だったパターン:
 * 1. `useState` の初期 `displayName` がプレースホルダー（例: 近本光司）のまま
 * 2. 本番で `useParams().playerId` が初回レンダーで空
 * 3. `seasonPilotPlayerId` のフォールバックが `displayName` に落ち、API が別人扱いになる
 *
 * 対策:
 * - 菊池ページと判定したら **常に Yahoo 打者 ID（1100082）** を API に渡す（表示名に依存しない）
 * - `usePathname()` の末尾セグメントで菊池を同期判定（params より先に安定しやすい）
 *
 * 新しいパイロット選手を足すときは、このモジュールと `getYahooIdForPilot`、および
 * Phase11 派生（`player_season_batting/{年}/yahoo_{id}.json`）が揃っていることを確認すること。
 */

import {
  PILOT_FABIAN_NPB_PLAYER_ID,
  PILOT_FABIAN_YAHOO_BATTER_ID,
  PILOT_KIKUCHI_NPB_PLAYER_ID,
  PILOT_KIKUCHI_YAHOO_BATTER_ID,
} from "@/lib/pilotPlayerConstants"
import { compactPlayerName } from "@/lib/playerNameNormalize"

const KIKUCHI_NAME_KEY = compactPlayerName("菊池涼介")
const KIKUCHI_ROMAN_KEY = compactPlayerName("Kikuchi Ryosuke")

const FABIAN_SHORT_KEY = compactPlayerName("ファビアン")
const FABIAN_ROSTER_KEY = compactPlayerName("Ｓ．ファビアン")
const FABIAN_ROMAN_KEY = compactPlayerName("Sandro Fabian")

/** URL パスだけから菊池パイロットかどうか（初回レンダー・params 未同期用） */
export function pathMatchesKikuchiPilot(pathname: string): boolean {
  const raw = pathname.split("/").filter(Boolean).pop() || ""
  if (!raw || raw === "players") return false
  let d = raw
  try {
    d = decodeURIComponent(raw).normalize("NFC")
  } catch {
    d = raw.normalize("NFC")
  }
  const c = compactPlayerName(d)
  return (
    c === KIKUCHI_NAME_KEY ||
    c.includes("菊池") ||
    d === PILOT_KIKUCHI_NPB_PLAYER_ID ||
    d === PILOT_KIKUCHI_YAHOO_BATTER_ID ||
    c === KIKUCHI_ROMAN_KEY
  )
}

/** URL パスだけからファビアンかどうか（Yahoo / NPB / 日本語名） */
export function pathMatchesFabianPilot(pathname: string): boolean {
  const raw = pathname.split("/").filter(Boolean).pop() || ""
  if (!raw || raw === "players") return false
  let d = raw
  try {
    d = decodeURIComponent(raw).normalize("NFC")
  } catch {
    d = raw.normalize("NFC")
  }
  const c = compactPlayerName(d)
  return (
    c === FABIAN_SHORT_KEY ||
    c === FABIAN_ROSTER_KEY ||
    d === PILOT_FABIAN_NPB_PLAYER_ID ||
    d === PILOT_FABIAN_YAHOO_BATTER_ID ||
    c === FABIAN_ROMAN_KEY
  )
}

export type KikuchiPageDetectionInput = {
  pathname: string
  playerIdNormalized: string
  playerSegmentCore: string
  displayName: string
  displayRomanName: string | null
}

/** 菊池個人ページか（UI タブ・今季タブ自動オープンと共用） */
export function isKikuchiPlayerPage(input: KikuchiPageDetectionInput): boolean {
  const {
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
  } = input
  return (
    pathMatchesKikuchiPilot(pathname) ||
    compactPlayerName(displayName) === KIKUCHI_NAME_KEY ||
    compactPlayerName(displayName).includes("菊池") ||
    compactPlayerName(displayRomanName || "") === KIKUCHI_ROMAN_KEY ||
    playerSegmentCore === "菊池涼介" ||
    playerIdNormalized === "菊池涼介" ||
    playerSegmentCore === PILOT_KIKUCHI_NPB_PLAYER_ID ||
    playerIdNormalized === PILOT_KIKUCHI_NPB_PLAYER_ID ||
    playerSegmentCore === PILOT_KIKUCHI_YAHOO_BATTER_ID ||
    playerIdNormalized === PILOT_KIKUCHI_YAHOO_BATTER_ID ||
    compactPlayerName(playerIdNormalized) === KIKUCHI_NAME_KEY ||
    compactPlayerName(playerIdNormalized).includes("菊池") ||
    compactPlayerName(playerIdNormalized) === KIKUCHI_ROMAN_KEY
  )
}

/** ファビアン個人ページか（今季 API の Yahoo ID 正規化用） */
export function isFabianPlayerPage(input: KikuchiPageDetectionInput): boolean {
  const {
    pathname,
    playerIdNormalized,
    playerSegmentCore,
    displayName,
    displayRomanName,
  } = input
  return (
    pathMatchesFabianPilot(pathname) ||
    compactPlayerName(displayName) === FABIAN_SHORT_KEY ||
    compactPlayerName(displayName) === FABIAN_ROSTER_KEY ||
    compactPlayerName(displayRomanName || "") === FABIAN_ROMAN_KEY ||
    playerSegmentCore === FABIAN_SHORT_KEY ||
    playerIdNormalized === FABIAN_SHORT_KEY ||
    playerSegmentCore === FABIAN_ROSTER_KEY ||
    playerIdNormalized === FABIAN_ROSTER_KEY ||
    playerSegmentCore === PILOT_FABIAN_NPB_PLAYER_ID ||
    playerIdNormalized === PILOT_FABIAN_NPB_PLAYER_ID ||
    playerSegmentCore === PILOT_FABIAN_YAHOO_BATTER_ID ||
    playerIdNormalized === PILOT_FABIAN_YAHOO_BATTER_ID ||
    compactPlayerName(playerIdNormalized) === FABIAN_SHORT_KEY ||
    compactPlayerName(playerIdNormalized) === FABIAN_ROSTER_KEY ||
    compactPlayerName(playerIdNormalized) === FABIAN_ROMAN_KEY
  )
}

export type SeasonPilotQueryIdInput = KikuchiPageDetectionInput & {
  playerSegmentClean: string
}

/**
 * `/api/players/[id]/season-stats` および pitch-details に渡す playerId。
 * 菊池・ファビアンのときは必ず Yahoo 打者 ID に正規化する。
 */
export function resolveSeasonStatsPilotQueryId(input: SeasonPilotQueryIdInput): string {
  if (isFabianPlayerPage(input)) {
    return PILOT_FABIAN_YAHOO_BATTER_ID
  }
  if (isKikuchiPlayerPage(input)) {
    return PILOT_KIKUCHI_YAHOO_BATTER_ID
  }
  const stripped = (input.playerSegmentClean || "").replace(/^player-/, "")
  return (
    input.playerIdNormalized ||
    input.playerSegmentCore ||
    stripped ||
    input.displayName
  )
}
