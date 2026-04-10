import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { CanonicalGameDocument } from "./types"

export function canonicalGameFilePath(projectRoot: string, gameId: string): string {
  return join(projectRoot, "_data", "scraped_games", "canonical", `${gameId}.json`)
}

export function loadCanonicalGameDocument(
  projectRoot: string,
  gameId: string
): CanonicalGameDocument | null {
  const p = canonicalGameFilePath(projectRoot, gameId.trim())
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p, "utf8")
    const doc = JSON.parse(raw) as CanonicalGameDocument
    if (doc?.schemaVersion !== "yahoo-game-canonical-v1" || !doc.gameId) return null
    return doc
  } catch {
    return null
  }
}
