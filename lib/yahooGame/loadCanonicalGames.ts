import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import type { CanonicalGameDocument } from "./types"

export type LoadCanonicalGamesOptions = {
  year?: string
  from?: string
  to?: string
  gameIds?: Iterable<string>
}

export function extractCanonicalGameYmd(doc: CanonicalGameDocument): string {
  const meta = doc?.game?.meta ?? {}
  const candidates = [meta.documentTitle, meta.ogTitle]
  for (const candidate of candidates) {
    const m = String(candidate ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (!m) continue
    const [, yyyy, mm, dd] = m
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
  }
  return ""
}

/** ディスク上の canonical のみ（一球復元は未マージ）。派生生成は `loadCanonicalGamesMergedForDerivedPipeline` を使うこと。 */
export function loadCanonicalGames(
  projectRoot: string,
  options?: LoadCanonicalGamesOptions,
): CanonicalGameDocument[] {
  const dir = join(projectRoot, "_data", "scraped_games", "canonical")
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  const out: CanonicalGameDocument[] = []
  const targetGameIds = options?.gameIds ? new Set([...options.gameIds].map((v) => String(v ?? "").trim())) : null
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as CanonicalGameDocument
      if (doc?.schemaVersion !== "yahoo-game-canonical-v1" || !doc?.gameId) continue

      const gameId = String(doc.gameId ?? "").trim()
      if (targetGameIds && !targetGameIds.has(gameId)) continue

      if (options?.year || options?.from || options?.to) {
        const ymd = extractCanonicalGameYmd(doc)
        if (!ymd) continue
        if (options?.year && !ymd.startsWith(`${options.year}-`)) continue
        if (options?.from && ymd < options.from) continue
        if (options?.to && ymd > options.to) continue
      }

      out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}
