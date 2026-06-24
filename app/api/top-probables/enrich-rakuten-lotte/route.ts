import fs from "fs"
import { NextResponse } from "next/server"
import { yearFromRequest } from "@/lib/api/derivedPlayerApiShared"
import { enrichProbablesCardAsync } from "@/lib/probables/enrichProbablesCard"
import { isRakutenLotteCard } from "@/lib/probables/isRakutenLotteCard"
import { topProbablesOutputPath } from "@/lib/probables/buildTopProbablesSnapshot"
import type { TopProbablesSnapshot } from "@/lib/probables/types"
import { getProjectRoot } from "@/lib/projectRoot"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const year = yearFromRequest(request)
    const projectRoot = getProjectRoot()
    const jsonPath = topProbablesOutputPath(projectRoot, year)

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ error: "top-probables JSON not found" }, { status: 404 })
    }

    const snapshot = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as TopProbablesSnapshot
    const card = snapshot.cards.find((c) => isRakutenLotteCard(c))
    if (!card) {
      return NextResponse.json({ error: "Rakuten vs Lotte card not found" }, { status: 404 })
    }

    const enriched = await enrichProbablesCardAsync(projectRoot, year, card)
    return NextResponse.json(enriched)
  } catch (e) {
    console.error("[enrich-rakuten-lotte]", e)
    return NextResponse.json({ error: "Failed to enrich Rakuten vs Lotte card" }, { status: 500 })
  }
}
