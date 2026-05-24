import path from "path"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"
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

function parseCatcherPitcherSplits(
  j: CatcherPitcherSplitsDerived | null,
  npbCatcherId: string
): CatcherPitcherSplitsDerived | null {
  if (j?.schemaVersion !== "player-catcher-pitcher-splits-v1") return null
  if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
  return j
}

export function loadCatcherPitcherSplitsFromRepo(
  year: string,
  npbCatcherId: string
): CatcherPitcherSplitsDerived | null {
  return parseCatcherPitcherSplits(
    loadDerivedNpbJsonSync<CatcherPitcherSplitsDerived>(
      "player_catcher_pitcher_splits",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

export async function loadCatcherPitcherSplitsFromRepoAsync(
  year: string,
  npbCatcherId: string
): Promise<CatcherPitcherSplitsDerived | null> {
  return parseCatcherPitcherSplits(
    await loadDerivedNpbJsonAsync<CatcherPitcherSplitsDerived>(
      "player_catcher_pitcher_splits",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

