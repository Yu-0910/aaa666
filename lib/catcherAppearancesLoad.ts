import fs from "fs"
import path from "path"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"
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
  const j = loadDerivedNpbJsonSync<CatcherAppearancesDerived>(
    "player_catcher_appearances",
    year,
    npbPlayerId
  )
  if (j?.schemaVersion !== "player-catcher-appearances-v1") return null
  if (String(j.npbPlayerId ?? "").trim() !== String(npbPlayerId).trim()) return null
  return j
}

export async function loadCatcherAppearancesFromRepoAsync(
  year: string,
  npbPlayerId: string
): Promise<CatcherAppearancesDerived | null> {
  const j = await loadDerivedNpbJsonAsync<CatcherAppearancesDerived>(
    "player_catcher_appearances",
    year,
    npbPlayerId
  )
  if (j?.schemaVersion !== "player-catcher-appearances-v1") return null
  if (String(j.npbPlayerId ?? "").trim() !== String(npbPlayerId).trim()) return null
  return j
}

