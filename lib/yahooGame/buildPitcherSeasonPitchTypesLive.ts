/**
 * 派生 JSON が無いとき canonical から 1 投手分をその場で構築（登板試合のみ読み込み）
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadCanonicalGameDocument } from "@/lib/yahooGame/loadCanonicalGame"
import { findPitchingLineForNpbPlayer } from "@/lib/yahooGame/pitcherForNpbPlayer"
import {
  buildPitcherSeasonPitchTypesForNpbFromDocs,
  type PitcherSeasonPitchTypesPayload,
} from "@/lib/yahooGame/pitcherSeasonPitchTypes"
import { parseRosterCsv } from "@/lib/yahooGame/rosterCsv"
import type { CanonicalGameDocument } from "@/lib/yahooGame/types"

export function buildPitcherSeasonPitchTypesLive(
  npbPlayerId: string,
  seasonYear: string,
): PitcherSeasonPitchTypesPayload | null {
  const npb = npbPlayerId.trim()
  if (!npb) return null

  const root = getProjectRoot()
  const roster = parseRosterCsv(
    readFileSync(join(root, "_data/npb_roster_2026.csv"), "utf8"),
  )
  const canonDir = join(root, "_data/scraped_games/canonical")
  if (!existsSync(canonDir)) return null

  const docs: CanonicalGameDocument[] = []
  for (const f of readdirSync(canonDir).filter((x) => x.endsWith(".json"))) {
    const gid = f.replace(/\.json$/, "")
    const doc = loadCanonicalGameDocument(root, gid)
    if (!doc) continue
    if (findPitchingLineForNpbPlayer(doc, roster, npb)) docs.push(doc)
  }

  return buildPitcherSeasonPitchTypesForNpbFromDocs(npb, seasonYear, docs, roster)
}
