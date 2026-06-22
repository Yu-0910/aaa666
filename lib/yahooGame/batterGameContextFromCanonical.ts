/**
 * Phase 13 / Phase 33 共用: 打者の試合コンテキスト（対戦球団・球場・ホーム/ビジター）解決 SSOT。
 * scripts/phase13_build_context_splits_from_canonical.ts から抽出。
 */

import { normalizeStadiumSplitValue } from "../stadiumVenueNormalize"
import { teamCodeFromShort } from "../standings/teamCodes"
import { dedupePlateAppearancesByInningHalfOrder } from "./dedupePlateAppearances"
import type { CanonicalGameDocument } from "./types"

export type BatterGameContextSplit = {
  stadium: string
  /** Phase 13 split_value 形式（例: vs_福岡ソフトバンクホークス） */
  vsTeamValue: string
  homeAway: "home" | "visitor"
}

/** Phase 13 `split_value`（vs_*）→ 球団コード（F / H / Hs …） */
export function vsTeamSplitValueToTeamCode(vsTeamValue: string): string | null {
  const raw = String(vsTeamValue ?? "").trim().replace(/^vs_/, "")
  if (!raw) return null
  const code = teamCodeFromShort(raw)
  return code || null
}

export function contextFromInningHalf(
  doc: CanonicalGameDocument,
  half: string,
  stadiumByGameId: Map<string, string>,
): BatterGameContextSplit | null {
  const sb = doc.game.scoreboard
  if (sb.length < 2) return null
  const visitorName = (sb[0].teamName ?? "").trim()
  const homeName = (sb[1].teamName ?? "").trim()
  if (!visitorName || !homeName) return null

  const isTop = /表/.test(half)
  const isBottom = /裏/.test(half)
  if (!isTop && !isBottom) return null

  const stadium = normalizeStadiumSplitValue(
    stadiumByGameId.get(String(doc.gameId ?? "").trim()) ?? "未設定",
  )

  return {
    stadium,
    vsTeamValue: `vs_${isTop ? homeName : visitorName}`,
    homeAway: isTop ? "visitor" : "home",
  }
}

/**
 * 打席の表裏から対戦相手・ホーム/ビジターを決める。打席が無いときはスタメン名簿で所属側を推定。
 * Phase 13 `resolveGameContextForBatter` と同一。
 */
export function resolveGameContextForBatter(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
  stadiumByGameId: Map<string, string>,
): BatterGameContextSplit | null {
  const bid = String(yahooBatterId ?? "").trim()
  if (!bid) return null

  const pas = dedupePlateAppearancesByInningHalfOrder(
    doc.domain?.plateAppearances ?? [],
    doc.gameId,
  )
  const myPa = pas.find((pa) => String(pa.yahooBatterId ?? "").trim() === bid)
  if (myPa) {
    return contextFromInningHalf(doc, String(myPa.inningHalf ?? "").trim(), stadiumByGameId)
  }

  const teams = doc.game.teams ?? []
  if (teams.length >= 2) {
    const onVisitor = (teams[0]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === bid,
    )
    const onHome = (teams[1]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === bid,
    )
    const sb = doc.game.scoreboard
    const visitorName = (sb[0]?.teamName ?? "").trim()
    const homeName = (sb[1]?.teamName ?? "").trim()
    if (visitorName && homeName) {
      const stadium = normalizeStadiumSplitValue(
        stadiumByGameId.get(String(doc.gameId ?? "").trim()) ?? "未設定",
      )
      if (onVisitor && !onHome) {
        return {
          stadium,
          vsTeamValue: `vs_${homeName}`,
          homeAway: "visitor",
        }
      }
      if (onHome && !onVisitor) {
        return {
          stadium,
          vsTeamValue: `vs_${visitorName}`,
          homeAway: "home",
        }
      }
    }
  }

  return null
}

/** 打席単位: 表裏から対戦球団 split_value のみ返す（検証スクリプト向け） */
export function resolveVsTeamValueForBatterInGame(
  doc: CanonicalGameDocument,
  yahooBatterId: string,
): string | null {
  const pas = dedupePlateAppearancesByInningHalfOrder(
    doc.domain?.plateAppearances ?? [],
    doc.gameId,
  )
  const myPa = pas.find((pa) => String(pa.yahooBatterId ?? "").trim() === yahooBatterId)
  if (myPa) {
    const ctx = contextFromInningHalf(doc, String(myPa.inningHalf ?? "").trim(), new Map())
    return ctx?.vsTeamValue ?? null
  }

  const teams = doc.game.teams ?? []
  if (teams.length >= 2) {
    const onVisitor = (teams[0]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === yahooBatterId,
    )
    const onHome = (teams[1]?.startingLineup ?? []).some(
      (p) => String(p.yahooPlayerId ?? "").trim() === yahooBatterId,
    )
    const visitorName = (doc.game.scoreboard[0]?.teamName ?? "").trim()
    const homeName = (doc.game.scoreboard[1]?.teamName ?? "").trim()
    if (onVisitor && !onHome && homeName) return `vs_${homeName}`
    if (onHome && !onVisitor && visitorName) return `vs_${visitorName}`
  }

  return null
}
