import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherStartingSummaryDerived } from "@/lib/catcherStartingSummary"

export function catcherStartingSummaryFilePath(
  projectRoot: string,
  year: string,
  npbCatcherId: string
): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbCatcherId).replace(/[^\d]/g, "")
  return path.join(
    projectRoot,
    "_data",
    "derived",
    "player_catcher_starting_summary",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadCatcherStartingSummaryFromRepo(
  year: string,
  npbCatcherId: string
): CatcherStartingSummaryDerived | null {
  const root = getProjectRoot()
  const p = catcherStartingSummaryFilePath(root, year, npbCatcherId)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CatcherStartingSummaryDerived
    if (j?.schemaVersion !== "player-catcher-starting-summary-v1") return null
    if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
    return j
  } catch {
    return null
  }
}

