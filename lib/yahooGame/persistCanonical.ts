import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type { CanonicalGameDocument } from "./types"

export type IngestManifest = {
  schemaVersion: "yahoo-ingest-manifest-v1"
  entries: Array<{
    gameId: string
    sourceCompositeFingerprint: string
    lastIngestedAt: string
    action: "written" | "skipped_unchanged"
  }>
}

const MANIFEST_NAME = "ingest_manifest.json"

function manifestPath(projectRoot: string): string {
  return join(projectRoot, "_data", "scraped_games", MANIFEST_NAME)
}

function canonicalPath(projectRoot: string, gameId: string): string {
  return join(projectRoot, "_data", "scraped_games", "canonical", `${gameId}.json`)
}

export function loadManifest(projectRoot: string): IngestManifest {
  const p = manifestPath(projectRoot)
  if (!existsSync(p)) {
    return { schemaVersion: "yahoo-ingest-manifest-v1", entries: [] }
  }
  try {
    const raw = readFileSync(p, "utf8")
    const data = JSON.parse(raw) as IngestManifest
    if (data.schemaVersion !== "yahoo-ingest-manifest-v1" || !Array.isArray(data.entries)) {
      return { schemaVersion: "yahoo-ingest-manifest-v1", entries: [] }
    }
    return data
  } catch {
    return { schemaVersion: "yahoo-ingest-manifest-v1", entries: [] }
  }
}

export function saveManifest(projectRoot: string, manifest: IngestManifest): void {
  writeFileSync(manifestPath(projectRoot), JSON.stringify(manifest, null, 2), "utf8")
}

/**
 * game_id 単位で canonical を upsert。
 * sourceCompositeFingerprint が同一なら上書きせず skipped（二重加算防止の前提）。
 */
export function ingestCanonicalGame(
  projectRoot: string,
  doc: CanonicalGameDocument
): { action: "written" | "skipped_unchanged"; path: string } {
  const outDir = join(projectRoot, "_data", "scraped_games", "canonical")
  mkdirSync(outDir, { recursive: true })
  const outFile = canonicalPath(projectRoot, doc.gameId)

  if (existsSync(outFile)) {
    try {
      const prev = JSON.parse(readFileSync(outFile, "utf8")) as CanonicalGameDocument
      const prevEv = prev.eventsFingerprint ?? ""
      const nextEv = doc.eventsFingerprint ?? ""
      if (
        prev.sourceCompositeFingerprint === doc.sourceCompositeFingerprint &&
        prevEv === nextEv
      ) {
        const manifest = loadManifest(projectRoot)
        manifest.entries = manifest.entries.filter((e) => e.gameId !== doc.gameId)
        manifest.entries.push({
          gameId: doc.gameId,
          sourceCompositeFingerprint: doc.sourceCompositeFingerprint,
          lastIngestedAt: new Date().toISOString(),
          action: "skipped_unchanged",
        })
        saveManifest(projectRoot, manifest)
        return { action: "skipped_unchanged", path: outFile }
      }
    } catch {
      // 壊れていれば上書き
    }
  }

  writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf8")
  const manifest = loadManifest(projectRoot)
  manifest.entries = manifest.entries.filter((e) => e.gameId !== doc.gameId)
  manifest.entries.push({
    gameId: doc.gameId,
    sourceCompositeFingerprint: doc.sourceCompositeFingerprint,
    lastIngestedAt: new Date().toISOString(),
    action: "written",
  })
  saveManifest(projectRoot, manifest)
  return { action: "written", path: outFile }
}
