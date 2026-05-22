import type { CanonicalGameDocument, RunnerEvent } from "./types"
import { runnerEventsFromSportsnaviScoreSnapshots } from "./runnerEventsFromSportsnaviScore"

/**
 * 本番 canonical 用: 走者イベントは一球速報 score 記録文（`sourceTier: "score"`）のみを載せる。
 * Yahoo `/text` DOM・textPlayByPlay 由来は集計に使わないため canonical には入れない。
 */
export function runnerEventsForCanonicalFromScoreSnapshots(args: {
  gameId: string
  doc: CanonicalGameDocument
  snapshots: Array<{ scoreIndex: string; html: string }>
}): RunnerEvent[] | undefined {
  const events = runnerEventsFromSportsnaviScoreSnapshots(args)
  return events.length > 0 ? events : undefined
}
