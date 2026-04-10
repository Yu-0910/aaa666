/**
 * 2026年NPB選手名簿API
 * データページで打・投の利き手を活用するためのエンドポイント
 */

import { NextResponse } from "next/server"
import { findRosterPlayerByPublicId, getNpbRoster2026 } from "@/lib/npbRoster"

export async function GET(request: Request) {
  const roster = getNpbRoster2026()
  const publicId = new URL(request.url).searchParams.get("publicId")?.trim() ?? ""
  const matchedPlayer = publicId ? findRosterPlayerByPublicId(publicId) : null
  return NextResponse.json({
    year: 2026,
    count: roster.length,
    players: roster,
    matchedPlayer,
  })
}
