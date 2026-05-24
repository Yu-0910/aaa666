import path from "path"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"
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

function parseCatcherPaRoundPitchTypes(
  j: CatcherPaRoundPitchTypesDerived | null,
  npbCatcherId: string
): CatcherPaRoundPitchTypesDerived | null {
  if (j?.schemaVersion !== "player-catcher-pa-round-pitch-types-v1") return null
  if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
  return j
}

export function loadCatcherPaRoundPitchTypesFromRepo(
  year: string,
  npbCatcherId: string
): CatcherPaRoundPitchTypesDerived | null {
  return parseCatcherPaRoundPitchTypes(
    loadDerivedNpbJsonSync<CatcherPaRoundPitchTypesDerived>(
      "player_catcher_pa_round_pitch_types",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

export async function loadCatcherPaRoundPitchTypesFromRepoAsync(
  year: string,
  npbCatcherId: string
): Promise<CatcherPaRoundPitchTypesDerived | null> {
  return parseCatcherPaRoundPitchTypes(
    await loadDerivedNpbJsonAsync<CatcherPaRoundPitchTypesDerived>(
      "player_catcher_pa_round_pitch_types",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

