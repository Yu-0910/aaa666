import path from "path"
import { loadDerivedNpbJsonAsync, loadDerivedNpbJsonSync } from "@/lib/derived/loadDerivedNpbJson"
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

function parseCatcherStartingSummary(
  j: CatcherStartingSummaryDerived | null,
  npbCatcherId: string
): CatcherStartingSummaryDerived | null {
  if (j?.schemaVersion !== "player-catcher-starting-summary-v1") return null
  if (String(j.npbCatcherId ?? "").trim() !== String(npbCatcherId).trim()) return null
  return j
}

export function loadCatcherStartingSummaryFromRepo(
  year: string,
  npbCatcherId: string
): CatcherStartingSummaryDerived | null {
  return parseCatcherStartingSummary(
    loadDerivedNpbJsonSync<CatcherStartingSummaryDerived>(
      "player_catcher_starting_summary",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

export async function loadCatcherStartingSummaryFromRepoAsync(
  year: string,
  npbCatcherId: string
): Promise<CatcherStartingSummaryDerived | null> {
  return parseCatcherStartingSummary(
    await loadDerivedNpbJsonAsync<CatcherStartingSummaryDerived>(
      "player_catcher_starting_summary",
      year,
      npbCatcherId
    ),
    npbCatcherId
  )
}

