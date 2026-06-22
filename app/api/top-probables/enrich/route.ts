import fs from "fs"
import { NextResponse } from "next/server"
import { yearFromRequest } from "@/lib/api/derivedPlayerApiShared"
import { topProbablesOutputPath } from "@/lib/probables/buildTopProbablesSnapshot"
import { enrichProbablesSnapshot } from "@/lib/probables/enrichProbablesCard"
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
    const enriched = enrichProbablesSnapshot(projectRoot, snapshot)
    return NextResponse.json(enriched)
  } catch (e) {
    console.error("[top-probables/enrich]", e)
    return NextResponse.json({ error: "Failed to enrich top-probables snapshot" }, { status: 500 })
  }
}
