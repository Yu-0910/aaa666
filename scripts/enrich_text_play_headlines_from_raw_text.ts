/**
 * `raw_sportsnavi_text/{gameId}.html` から、全プレー（各 `li.bb-liveText__item`）について
 * 一球速報でプレー上部に出る見出し `p.bb-liveText__itemTitle` を読み、
 * canonical の `game.textPlayByPlay[].playHeadlineJa` にマージする。
 *
 * 牽制球捕球ミス等の特別トリガーは不要。raw がある全試合を対象。動画見出しが無いプレーは null。
 * `lines` の粒度が Yahoo マージ済みと異なる場合は、1プレー全文に含まれる先頭の行へ見出しを付与（sportsnaviTextPlaySections.ts）。
 *
 *   npx tsx scripts/enrich_text_play_headlines_from_raw_text.ts
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { CanonicalGameDocument } from "../lib/yahooGame/types"
import {
  mergePlayHeadlinesLooseIntoTextPlayByPlay,
  parseSportsnaviTextPlaySectionsFromHtml,
} from "../lib/yahooGame/sportsnaviTextPlaySections"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, "..")

function main(): void {
  const canonicalDir = join(projectRoot, "_data", "scraped_games", "canonical")
  const rawTextDir = join(projectRoot, "_data", "scraped_games", "raw_sportsnavi_text")

  let updated = 0
  let skipped = 0
  const files = readdirSync(canonicalDir).filter((f) => f.endsWith(".json"))

  for (const f of files) {
    const gameId = f.replace(/\.json$/, "")
    const rawPath = join(rawTextDir, `${gameId}.html`)
    if (!existsSync(rawPath)) continue

    const cPath = join(canonicalDir, f)
    let doc: CanonicalGameDocument
    try {
      doc = JSON.parse(readFileSync(cPath, "utf8")) as CanonicalGameDocument
    } catch {
      continue
    }
    if (doc.schemaVersion !== "yahoo-game-canonical-v1") continue

    const html = readFileSync(rawPath, "utf8")
    const parsed = parseSportsnaviTextPlaySectionsFromHtml(html)
    if (parsed.length === 0) continue

    const merged = mergePlayHeadlinesLooseIntoTextPlayByPlay(doc.game?.textPlayByPlay ?? [], parsed)
    const before = JSON.stringify(doc.game?.textPlayByPlay ?? [])
    if (JSON.stringify(merged) === before) {
      skipped += 1
      continue
    }
    doc.game.textPlayByPlay = merged

    writeFileSync(cPath, JSON.stringify(doc, null, 2), "utf8")
    updated += 1
  }

  console.log(`[enrich_text_play_headlines_from_raw_text] updated=${updated} skipped=${skipped}`)
}

main()
