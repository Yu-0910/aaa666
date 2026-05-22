import fs from "fs"
import path from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import type { CatcherPaRoundPitchTypesDerived } from "@/lib/catcherPaRoundPitchTypes"

export function catcherPaRoundPitchTypesFilePath(
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
    "player_catcher_pa_round_pitch_types",
    safeYear,
    `npb_${safeNpb}.json`
  )
}

export function loadCatcherPaRoundPitchTypesFromRepo(
  year: string,
  npbCatcherId: string
): CatcherPaRoundPitchTypesDerived | null {
  const root = getProjectRoot()
  const p = catcherPaRoundPitchTypesFilePath(root, year, npbCatcherId)
  if (!fs.existsSync(p)) return null
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as CatcherPaRoundPitchTypesDerived
    if (j?.schemaVersion !== "player-catcher-pa-round-pitch-types-v1") return null
    if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
    return j
  } catch {
    return null
  }
}

