import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import type { CanonicalGameDocument } from "./types"

/** ディスク上の canonical のみ（一球復元は未マージ）。派生生成は `loadCanonicalGamesMergedForDerivedPipeline` を使うこと。 */
export function loadCanonicalGames(projectRoot: string): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion === "yahoo-game-canonical-v1" && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}
