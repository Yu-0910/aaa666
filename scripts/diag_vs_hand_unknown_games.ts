/**
 * 対左右「対不明」に入った打数の打席がどの試合かを特定する（調査用）。
 * npm run diag:vs-hand:unknown-games
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { CanonicalGameDocument } from '../lib/yahooGame/types'
import {
  loadVsHandRowsFromCanonicalWithDebug,
  mergePhase10RestoredIntoDocIfPresent,
} from '../lib/seasonStatsPilot'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function loadCanonicalGames(): CanonicalGameDocument[] {
  const dir = join(projectRoot, '_data', 'scraped_games', 'canonical')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const out: CanonicalGameDocument[] = []
  for (const f of files) {
    const p = join(dir, f)
    try {
      const doc = JSON.parse(readFileSync(p, 'utf8')) as CanonicalGameDocument
      if (doc?.schemaVersion === 'yahoo-game-canonical-v1' && doc?.gameId) out.push(doc)
    } catch {
      // ignore
    }
  }
  return out
}

function main() {
  process.chdir(projectRoot)

  const docs = loadCanonicalGames()
  const mergedDocsByGameId = new Map<string, CanonicalGameDocument>()
  for (const d of docs) {
    const gid = String(d.gameId ?? '').trim()
    if (gid) mergedDocsByGameId.set(gid, mergePhase10RestoredIntoDocIfPresent(d))
  }

  const yahooIds = ['1800050', '2102926']
  for (const yahoo of yahooIds) {
    const d = loadVsHandRowsFromCanonicalWithDebug(yahoo, {
      preloadedCanonicalDocs: docs,
      mergedDocsByGameId,
      collectVsUnknownAbSamples: true,
    })
    const unknownRow = d.rows.find((r) => r.split_type === 'vs_hand' && r.split_value === 'unknown')
    const samples = (d.vsUnknownAbSamples ?? []).map((s) => {
      const doc = mergedDocsByGameId.get(s.gameId)
      const title = String(doc?.game?.meta?.documentTitle ?? '').trim() || null
      return { ...s, documentTitle: title }
    })
    const gameIds = [...new Set(samples.map((s) => s.gameId))].sort()
    console.log(
      JSON.stringify(
        {
          yahoo,
          unknownRow: unknownRow
            ? { g: unknownRow.g, pa: unknownRow.pa, ab: unknownRow.ab, so: unknownRow.so }
            : null,
          gameIdsContributingToUnknownAb: gameIds,
          vsUnknownAbSamples: samples,
          unknownPitchers: d.unknownPitchers,
          missingPitcherIdPas: d.missingPitcherIdPas,
          missingPitcherIdSamples: d.missingPitcherIdSamples,
        },
        null,
        2,
      ),
    )
  }
}

main()
