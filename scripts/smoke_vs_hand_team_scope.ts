/**
 * 守備球団スコープ名簿照合のスモーク（佐藤×オスナ 2021038847）。
 * npx tsx scripts/smoke_vs_hand_team_scope.ts
 */
import { readFileSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { loadVsHandRowsFromCanonicalWithDebug, mergePhase10RestoredIntoDocIfPresent } from "../lib/seasonStatsPilot"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import { pitcherThrowHandRLFromYahooPitcherIdWithMentioned } from "../lib/yahooGame/batterHandFromCanonical"
import {
  defendingTeamFullNameFromPlateAppearance,
  injectTeamsFromTextPbpIfMissing,
} from "../lib/yahooGame/inferTeamsFromTextPbp"
import { enrichPlateAppearancesWithResolvedPitcherIds } from "../lib/yahooGame/resolvePitcherIdByPaId"
import { findRosterPlayersMatchingJaHint } from "../lib/npbRoster"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(root)

const gameId = "2021038847"
const doc = JSON.parse(
  readFileSync(join("_data", "scraped_games", "canonical", `${gameId}.json`), "utf8"),
) as CanonicalGameDocument
const merged = enrichPlateAppearancesWithResolvedPitcherIds(
  injectTeamsFromTextPbpIfMissing(mergePhase10RestoredIntoDocIfPresent(doc)),
)
const pa = merged.domain?.plateAppearances?.find((p) => p.paId === `${gameId}-9-表-7`)
if (!pa) {
  console.error("PA not found")
  process.exit(1)
}
const team = defendingTeamFullNameFromPlateAppearance(merged, pa)
const th = pitcherThrowHandRLFromYahooPitcherIdWithMentioned("2000133", merged.game?.yahooPlayersMentioned, {
  defendingTeamFullName: team,
})
const yakultMatches = findRosterPlayersMatchingJaHint("オスナ", { teamFullName: "東京ヤクルトスワローズ" })
const hawkMatches = findRosterPlayersMatchingJaHint("オスナ", { teamFullName: "福岡ソフトバンクホークス" })

const d = loadVsHandRowsFromCanonicalWithDebug("2000051", {
  preloadedCanonicalDocs: [doc],
  mergedDocsByGameId: new Map([[gameId, merged]]),
})
const unk = d.rows.find((r) => r.split_type === "vs_hand" && r.split_value === "unknown")

console.log(
  JSON.stringify(
    {
      defendingTeam: team,
      throwHand: th,
      yakultMatchCount: yakultMatches.length,
      hawkMatchCount: hawkMatches.length,
      unknownPaInSingleGame: unk?.pa ?? 0,
      unknownPitchers: d.unknownPitchers,
      ok: th === "R" && yakultMatches.length === 1 && hawkMatches.length === 1,
    },
    null,
    2,
  ),
)

if (th !== "R" || yakultMatches.length !== 1) process.exit(1)
