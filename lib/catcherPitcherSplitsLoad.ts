import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherPitcherSplitsDerived } from "@/lib/catcherPitcherSplits"

export function catcherPitcherSplitsFilePath(
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
    "player_catcher_pitcher_splits",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadCatcherPitcherSplitsFromRepo(
  year: string,
  npbCatcherId: string
): CatcherPitcherSplitsDerived | null {
  const root = getProjectRoot()
  const p = catcherPitcherSplitsFilePath(root, year, npbCatcherId)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CatcherPitcherSplitsDerived
    if (j?.schemaVersion !== "player-catcher-pitcher-splits-v1") return null
    if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
    return j
  } catch {
    return null
  }
}

