import path from "path"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"
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

function parseCatcherDefenseBasic(
  j: CatcherDefenseBasicDerived | null,
  npbCatcherId: string
): CatcherDefenseBasicDerived | null {
  if (j?.schemaVersion !== "player-catcher-defense-basic-v1") return null
  if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
  return j
}

export function loadCatcherDefenseBasicFromRepo(
  year: string,
  npbCatcherId: string
): CatcherDefenseBasicDerived | null {
  return parseCatcherDefenseBasic(
    loadDerivedNpbJsonSync<CatcherDefenseBasicDerived>(
      "player_catcher_defense_basic",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

export async function loadCatcherDefenseBasicFromRepoAsync(
  year: string,
  npbCatcherId: string
): Promise<CatcherDefenseBasicDerived | null> {
  return parseCatcherDefenseBasic(
    await loadDerivedNpbJsonAsync<CatcherDefenseBasicDerived>(
      "player_catcher_defense_basic",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

