/**
 * 計画書 Phase4: 個人API（derived JSON）の応答形・クエリの共通化。
 * fs を使わないため route からそのまま import 可能。
 */

import { NextResponse } from "next/server"
import { DERIVED_SEASON_YEAR_DEFAULT } from "@/lib/seasonStatsPilotShared"

/** 個人ページ用・派生JSON API の標準 Cache-Control */
export const DERIVED_API_HEADERS_NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const

/** `?year=`（未指定時は DERIVED_SEASON_YEAR_DEFAULT） */
export function yearFromRequest(request: Request): string {
  return new URL(request.url).searchParams.get("year")?.trim() || DERIVED_SEASON_YEAR_DEFAULT
}

/**
 * `[playerId]` パスセグメントの正規化（decodeURIComponent + NFC + trim）。
 * `player-` プレフィックス除去が必要なルートは呼び出し側で行う。
 */
export function decodePlayerPathSegment(raw: string): string {
  const t = (raw || "").trim()
  try {
    return decodeURIComponent(t).normalize("NFC")
  } catch {
    return t
  }
}

/** 計画書どおり: year 指定・hasData・payload（データ無しは null） */
export type DerivedPlayerApiEnvelope<T> = {
  hasData: boolean
  year: string
  payload: T | null
  /** データ無し・エラー時の機械可読理由（任意） */
  code?: string
  /** 人間可読メッセージ（任意） */
  message?: string
}

export function jsonDerivedResponse<T>(
  body: DerivedPlayerApiEnvelope<T>,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: DERIVED_API_HEADERS_NO_STORE,
  })
}
