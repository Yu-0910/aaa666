import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherAppearancesDerived } from "@/lib/catcherAppearances"

export function catcherAppearancesFilePath(
  projectRoot: string,
  year: string,
  npbPlayerId: string
): string {
  const safeYear = String(year).replace(/[^\d]/g, "") || "2026"
  const safeNpb = String(npbPlayerId).replace(/[^\d]/g, "")
  return path.join(
    projectRoot,
    "_data",
    "derived",
    "player_catcher_appearances",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadCatcherAppearancesFromRepo(
  year: string,
  npbPlayerId: string
): CatcherAppearancesDerived | null {
  const root = getProjectRoot()
  const p = catcherAppearancesFilePath(root, year, npbPlayerId)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CatcherAppearancesDerived
    if (j?.schemaVersion !== "player-catcher-appearances-v1") return null
    if (String(j.npbPlayerId ?? "").trim() !== String(npbPlayerId).trim()) return null
    return j
  } catch {
    return null
  }
}

