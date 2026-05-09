/**
 * Phase 29 (b)+(c) の入口診断:
 *   - canonical の `scoreboard` / `teams` が空のままで `injectTeamsFromTextPbpIfMissing`
 *     でも埋められない試合（27 件相当）を特定し、ID と先頭テキスト数行を出力する。
 *   - canonical 全体に登場する Yahoo player ID のうち、`yahoo_to_npb_full.json` に
 *     未登録（= roster lookup が null になる）ID をリスト化する。
 *   - 投手の roster.throw_hand が空（cellPitcherHandUnknownPas の根本原因）の
 *     yahoo_pitcher_id をリスト化する。
 *
 * 出力先: `_data/derived/audit/phase29_canonical_and_roster_gaps.json`
 *
 * 使い方:
 *   npx tsx scripts/diag_phase29_canonical_and_roster_gaps.ts [--year 2026]
 */
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { getProjectRoot } from "@/lib/projectRoot"
import { loadCanonicalGames } from "@/lib/yahooGame/loadCanonicalGames"
import {
  injectTeamsFromTextPbpIfMissing,
  parsePregameInfoFromTextPbp,
} from "@/lib/yahooGame/inferTeamsFromTextPbp"
import { findRosterPlayerByPublicId } from "@/lib/npbRoster"

const root = getProjectRoot()

interface FailedGame {
  gameId: string
  preParsed: boolean
  visitorFullName: string
  homeFullName: string
  pregameTextSample: string
  battersUnique: number
  pitchersUnique: number
  battersResolvedByRoster: number
  pitchersResolvedByRoster: number
}

const docs = loadCanonicalGames(root)
const failedGames: FailedGame[] = []
const unmappedYahooIds = new Map<string, { roleHint: string; sampleGameId: string; samplePlayerName: string }>()
const pitchersWithoutThrowHand = new Map<
  string,
  { yahooPitcherId: string; npbPlayerId: string; playerName: string; team: string; sampleGameId: string }
>()

for (const d of docs) {
  const gid = String(d.gameId ?? "")
  const board = d.game?.scoreboard ?? []
  const teams = d.game?.teams ?? []
  const pre = parsePregameInfoFromTextPbp(d)
  const inj = injectTeamsFromTextPbpIfMissing(d)
  const sbLen = inj.game?.scoreboard?.length ?? 0
  const teamsLen = inj.game?.teams?.length ?? 0

  // batters / pitchers の roster lookup 状況
  const bSet = new Set<string>()
  const pSet = new Set<string>()
  for (const bl of d.domain?.battingLines ?? []) {
    const yid = String(bl.yahooPlayerId ?? "")
    if (!yid) continue
    bSet.add(yid)
    const r = findRosterPlayerByPublicId(yid)
    if (!r) {
      const cur = unmappedYahooIds.get(yid)
      if (!cur) {
        unmappedYahooIds.set(yid, { roleHint: "batter", sampleGameId: gid, samplePlayerName: String(bl.playerName ?? "") })
      }
    }
  }
  for (const pl of d.domain?.pitchingLines ?? []) {
    const yid = String(pl.yahooPlayerId ?? "")
    if (!yid) continue
    pSet.add(yid)
    const r = findRosterPlayerByPublicId(yid)
    if (!r) {
      const cur = unmappedYahooIds.get(yid)
      if (!cur) {
        unmappedYahooIds.set(yid, { roleHint: "pitcher", sampleGameId: gid, samplePlayerName: String(pl.playerName ?? "") })
      }
    } else {
      const th = String(r.throw_hand ?? "").trim()
      if (th !== "R" && th !== "L" && !pitchersWithoutThrowHand.has(yid)) {
        pitchersWithoutThrowHand.set(yid, {
          yahooPitcherId: yid,
          npbPlayerId: r.npb_player_id,
          playerName: r.name_ja,
          team: r.team,
          sampleGameId: gid,
        })
      }
    }
  }

  if (board.length < 2 && teamsLen < 2 && sbLen < 2) {
    // インジェクション後も埋まらない試合
    let bResolved = 0
    let pResolved = 0
    for (const yid of bSet) if (findRosterPlayerByPublicId(yid)) bResolved += 1
    for (const yid of pSet) if (findRosterPlayerByPublicId(yid)) pResolved += 1
    const lines = (d.game?.textPlayByPlay?.[0]?.lines ?? []).slice(0, 1)
    failedGames.push({
      gameId: gid,
      preParsed: !!pre,
      visitorFullName: pre?.visitorFullName ?? "",
      homeFullName: pre?.homeFullName ?? "",
      pregameTextSample: (lines[0] ?? "").slice(0, 240),
      battersUnique: bSet.size,
      pitchersUnique: pSet.size,
      battersResolvedByRoster: bResolved,
      pitchersResolvedByRoster: pResolved,
    })
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  totalCanonicalDocs: docs.length,
  scoreboardStillEmptyAfterInject: {
    count: failedGames.length,
    games: failedGames,
  },
  unmappedYahooIds: {
    count: unmappedYahooIds.size,
    samples: [...unmappedYahooIds.entries()]
      .slice(0, 50)
      .map(([yid, info]) => ({ yahooPlayerId: yid, ...info })),
  },
  pitchersWithoutThrowHand: {
    count: pitchersWithoutThrowHand.size,
    list: [...pitchersWithoutThrowHand.values()],
  },
}

const outDir = join(root, "_data", "derived", "audit")
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, "phase29_canonical_and_roster_gaps.json")
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8")
console.log(`[diag:phase29] wrote ${outPath}`)
console.log(`  totalCanonicalDocs                = ${out.totalCanonicalDocs}`)
console.log(`  scoreboardStillEmptyAfterInject   = ${out.scoreboardStillEmptyAfterInject.count}`)
console.log(`  unmappedYahooIds (roster null)    = ${out.unmappedYahooIds.count}`)
console.log(`  pitchersWithoutThrowHand          = ${out.pitchersWithoutThrowHand.count}`)
if (failedGames.length > 0) {
  console.log(`\n  First few failed games:`)
  for (const g of failedGames.slice(0, 5)) {
    console.log(
      `    ${g.gameId} preParsed=${g.preParsed} batters=${g.battersUnique}(roster=${g.battersResolvedByRoster}) pitchers=${g.pitchersUnique}(roster=${g.pitchersResolvedByRoster})`,
    )
    if (g.pregameTextSample) console.log(`      pregame head: ${g.pregameTextSample.slice(0, 120)}`)
  }
}
