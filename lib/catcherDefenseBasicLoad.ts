import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherDefenseBasicDerived } from "@/lib/catcherDefenseBasic"

export function catcherDefenseBasicFilePath(
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
    "player_catcher_defense_basic",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadCatcherDefenseBasicFromRepo(
  year: string,
  npbCatcherId: string
): CatcherDefenseBasicDerived | null {
  const root = getProjectRoot()
  const p = catcherDefenseBasicFilePath(root, year, npbCatcherId)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CatcherDefenseBasicDerived
    if (j?.schemaVersion !== "player-catcher-defense-basic-v1") return null
    if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
    return j
  } catch {
    return null
  }
}

