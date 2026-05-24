/**
 * 2026年NPB選手名簿API
 * データページで打・投の利き手を活用するためのエンドポイント
 */

import { NextResponse } from "next/server"
import { findRosterPlayerByPublicId, getNpbRoster2026 } from "@/lib/npbRoster"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const publicId = url.searchParams.get("publicId")?.trim() ?? ""
  const matchedPlayer = publicId ? findRosterPlayerByPublicId(publicId) : null
  /** 個人ページ: 786 件丸ごと返さず matched のみ（モバイル回線でのタイムアウト防止） */
  if (publicId) {
    return NextResponse.json({
      year: 2026,
      matchedPlayer,
    })
  }
  const roster = getNpbRoster2026()
  return NextResponse.json({
    year: 2026,
    count: roster.length,
    players: roster,
    matchedPlayer,
  })
}
