import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import type { CanonicalGameDocument } from "./types"

/**
 * `raw_sportsnavi_score/{gameId}/*.html` を読み、runnerEventsFromSportsnaviScoreSnapshots 用の配列にする。
 */
export function loadSportsnaviScoreSnapshots(
  projectRoot: string,
  gameId: string,
): Array<{ scoreIndex: string; html: string }> {
  const dir = join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_score", gameId)
  if (!existsSync(dir)) return []
  const out: Array<{ scoreIndex: string; html: string }> = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".html")) continue
    const base = ent.name.slice(0, -".html".length)
    if (!/^\d{7}$/.test(base)) continue
    try {
      const html = readFileSync(join(dir, ent.name), "utf8")
      out.push({ scoreIndex: base, html })
    } catch {
      continue
    }
  }
  out.sort((a, b) => a.scoreIndex.localeCompare(b.scoreIndex))
  return out
}

/**
 * mergePhase10 の eventsFingerprint は打席・投球のみ。score 由来の runnerEvents / 調査をマージしたあと
 * フィンガープリントを伸ばし、ingest の skipped_unchanged を避ける。
 */
export function extendEventsFingerprintForScoreRunnerMerge(doc: CanonicalGameDocument): void {
  const base = doc.eventsFingerprint ?? ""
  const runner = JSON.stringify(doc.domain.runnerEvents ?? [])
  const inv = JSON.stringify(doc.game?.pickoffCatchMissInvestigations ?? [])
  doc.eventsFingerprint = createHash("sha256")
    .update(`${base}|score-runner-merge-v1|${runner}|${inv}`, "utf8")
    .digest("hex")
}
