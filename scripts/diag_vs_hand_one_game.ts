/**
 * 1 試合の打席ごと vs_hand 判定ダンプ（調査用）。
 *
 * npx tsx scripts/diag_vs_hand_one_game.ts 1860140 2021038875
 */
import { loadVsHandRowsFromCanonicalWithDebug } from "../lib/seasonStatsPilot"

function main(): void {
  const args = process.argv.slice(2)
  const yahoo = args[0] ?? "1860140"
  const gameId = args[1] ?? ""
  if (!/^\d+$/.test(yahoo) || !/^\d+$/.test(gameId)) {
    console.error("usage: npx tsx scripts/diag_vs_hand_one_game.ts <yahooBatterId> <gameId>")
    process.exit(2)
  }

  const d = loadVsHandRowsFromCanonicalWithDebug(yahoo, {
    collectPaDumpForGameId: gameId,
  })

  console.log(
    JSON.stringify(
      {
        yahoo,
        gameId,
        rows: d.rows.filter((r) => r.split_type === "vs_hand"),
        missingPitcherIdPas: d.missingPitcherIdPas,
        inferredPitcherIdFromTextPas: d.inferredPitcherIdFromTextPas,
        paDump: d.paDump,
      },
      null,
      2,
    ),
  )
}

main()
